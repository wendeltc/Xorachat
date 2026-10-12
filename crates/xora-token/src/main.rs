use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, bail};
use axum::{
    Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use livekit_api::access_token::{AccessToken, VideoGrants};
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use tokio::net::TcpListener;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

const TOKEN_TTL: Duration = Duration::from_secs(6 * 3600);
const MAX_FAILURES: u32 = 10;
const FAILURE_WINDOW: Duration = Duration::from_secs(60);
const BLOCK_DURATION: Duration = Duration::from_secs(300);
const INVALID_INVITE: &str = "invalid invite";

struct Config {
    livekit_url: String,
    api_key: String,
    api_secret: String,
    invite: String,
    bind_addr: String,
}

impl Config {
    fn from_env() -> anyhow::Result<Self> {
        let config = Self {
            livekit_url: required("LIVEKIT_URL")?,
            api_key: required("LIVEKIT_API_KEY")?,
            api_secret: required("LIVEKIT_API_SECRET")?,
            invite: required("XORA_INVITE_CODE")?,
            bind_addr: std::env::var("XORA_BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into()),
        };
        if config.api_secret.len() < 32 {
            bail!("LIVEKIT_API_SECRET must be at least 32 characters");
        }
        Ok(config)
    }
}

fn required(name: &str) -> anyhow::Result<String> {
    match std::env::var(name) {
        Ok(value) if !value.is_empty() => Ok(value),
        _ => bail!("missing environment variable {name}"),
    }
}

struct Attempts {
    window_start: Instant,
    failures: u32,
    blocked_until: Option<Instant>,
}

#[derive(Default)]
struct Limiter(Mutex<HashMap<IpAddr, Attempts>>);

impl Limiter {
    fn is_blocked(&self, ip: IpAddr) -> bool {
        let now = Instant::now();
        self.0
            .lock()
            .unwrap()
            .get(&ip)
            .and_then(|attempts| attempts.blocked_until)
            .is_some_and(|until| until > now)
    }

    fn record_failure(&self, ip: IpAddr) {
        let now = Instant::now();
        let mut map = self.0.lock().unwrap();
        map.retain(|_, a| {
            a.blocked_until.is_some_and(|until| until > now)
                || now - a.window_start < FAILURE_WINDOW
        });
        let attempts = map.entry(ip).or_insert(Attempts {
            window_start: now,
            failures: 0,
            blocked_until: None,
        });
        if now - attempts.window_start >= FAILURE_WINDOW {
            attempts.window_start = now;
            attempts.failures = 0;
        }
        attempts.failures += 1;
        if attempts.failures >= MAX_FAILURES {
            attempts.blocked_until = Some(now + BLOCK_DURATION);
        }
    }
}

struct AppState {
    config: Config,
    limiter: Limiter,
}

#[derive(Deserialize)]
struct JoinRequest {
    nickname: String,
    room: String,
    invite: String,
}

#[derive(Serialize)]
struct JoinResponse {
    url: String,
    token: String,
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

fn error(status: StatusCode, message: &'static str) -> Response {
    (status, Json(ErrorBody { error: message })).into_response()
}

fn source(headers: &HeaderMap, peer: SocketAddr) -> IpAddr {
    // Only the local Caddy is trusted to set X-Forwarded-For.
    if peer.ip().is_loopback()
        && let Some(ip) = headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.rsplit(',').next())
            .and_then(|value| value.trim().parse().ok())
    {
        return ip;
    }
    peer.ip()
}

fn clean(value: &str, max: usize) -> Option<&str> {
    let value = value.trim();
    ((1..=max).contains(&value.chars().count()) && !value.chars().any(char::is_control))
        .then_some(value)
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn new_identity() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{nanos:x}-{:x}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

fn sign(config: &Config, room: &str, nickname: &str) -> anyhow::Result<String> {
    AccessToken::with_api_key(&config.api_key, &config.api_secret)
        .with_identity(&new_identity())
        .with_name(nickname)
        .with_ttl(TOKEN_TTL)
        .with_grants(VideoGrants {
            room_join: true,
            room: room.to_string(),
            can_publish: Some(true),
            can_subscribe: Some(true),
            can_publish_data: Some(true),
            ..Default::default()
        })
        .to_jwt()
        .context("signing token")
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

async fn token(
    State(state): State<Arc<AppState>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Result<Json<JoinRequest>, JsonRejection>,
) -> Response {
    let Ok(Json(request)) = body else {
        return error(StatusCode::BAD_REQUEST, "bad request");
    };
    let ip = source(&headers, peer);
    if state.limiter.is_blocked(ip) {
        warn!(%ip, "request from blocked source");
        return error(StatusCode::FORBIDDEN, INVALID_INVITE);
    }
    if !bool::from(
        request
            .invite
            .as_bytes()
            .ct_eq(state.config.invite.as_bytes()),
    ) {
        state.limiter.record_failure(ip);
        warn!(%ip, "invalid invite");
        return error(StatusCode::FORBIDDEN, INVALID_INVITE);
    }
    let Some(nickname) = clean(&request.nickname, 32) else {
        return error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "nickname must be 1-32 characters",
        );
    };
    let Some(room) = clean(&request.room, 64) else {
        return error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "room must be 1-64 characters",
        );
    };
    match sign(&state.config, room, nickname) {
        Ok(token) => Json(JoinResponse {
            url: state.config.livekit_url.clone(),
            token,
        })
        .into_response(),
        Err(err) => {
            error!("{err:#}");
            error(StatusCode::INTERNAL_SERVER_ERROR, "internal error")
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    let config = Config::from_env()?;
    let listener = TcpListener::bind(&config.bind_addr)
        .await
        .with_context(|| format!("binding {}", config.bind_addr))?;
    info!("listening on {}", config.bind_addr);
    let state = Arc::new(AppState {
        config,
        limiter: Limiter::default(),
    });
    let app = Router::new()
        .route("/health", get(health))
        .route("/token", post(token))
        .layer(DefaultBodyLimit::max(1024))
        .with_state(state);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}
