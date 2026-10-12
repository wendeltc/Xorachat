---

description: "Task list for feature 002-token-service-deploy"
---

# Tasks: Token Service and Deployment

**Input**: Design documents from `/specs/002-token-service-deploy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: None. Constitution Principle III forbids test tasks during the MVP; each story is
validated manually through [quickstart.md](quickstart.md).

**Organization**: Tasks are grouped by user story. Commit after each phase with Conventional
Commits. All code, logs, errors and docs in English; comments only for a non-obvious "why".
All Rust code lives in `crates/xora-token/src/main.rs` unless it grows past one screen of logic
(then move the limiter to `crates/xora-token/src/limiter.rs`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 join with invite, US2 rotate invite, US3 deploy on one VM

---

## Phase 1: Setup

- [X] T001 Commit the spec artifacts in `specs/002-token-service-deploy/` and `.specify/feature.json`: `docs: add spec, plan and tasks for token service and deployment`
- [X] T002 Add `serde = { version = "1", features = ["derive"] }` and `subtle = "2.6"` to `[workspace.dependencies]` in `Cargo.toml`, and `serde.workspace = true`, `subtle.workspace = true` to `crates/xora-token/Cargo.toml`; run `cargo update -p subtle --precise 2.6.1` only if the lockfile picks a different version
- [X] T003 [P] Append `deploy/.env` and `deploy/caddy_data/` to `.gitignore`; create `.dockerignore` at the repository root with `target/`, `legacy/`, `specs/`, `.git/`, `deploy/.env`, `deploy/caddy_data/`

---

## Phase 2: Foundational

**Purpose**: Config loading, logging and the HTTP server every story uses.

- [X] T004 In `crates/xora-token/src/main.rs` add `struct Config { livekit_url, api_key, api_secret, invite, bind_addr }` loaded by a `fn required(name) -> anyhow::Result<String>` that fails with `missing environment variable <NAME>` for absent or empty values; `XORA_BIND_ADDR` defaults to `127.0.0.1:3000`; `LIVEKIT_API_SECRET` shorter than 32 characters fails with `LIVEKIT_API_SECRET must be at least 32 characters` because livekit-server refuses such secrets (research R6, FR-010, FR-011). Never log any field except `bind_addr`
- [X] T005 In `crates/xora-token/src/main.rs` build `axum::Router` with shared state `Arc<AppState { config, limiter }>`, route `GET /health` returning `Json({"status":"ok"})` (FR-013), bind `tokio::net::TcpListener` on `bind_addr` and serve with `into_make_service_with_connect_info::<SocketAddr>()`; log `listening on <addr>` at info. Remove the old version-print-and-exit behavior

**Checkpoint**: `cargo run -p xora-token` with the four env vars set answers `/health`; commit `feat(token): add config loading and health endpoint`.

---

## Phase 3: User Story 1 - Join a room with the invite code (Priority: P1) 🎯 MVP

**Goal**: `POST /token` per [contracts/token-api.md](contracts/token-api.md).

**Independent Test**: quickstart.md sections 1–3.

- [X] T006 [US1] In `crates/xora-token/src/main.rs` add `#[derive(Deserialize)] struct JoinRequest { nickname: String, room: String, invite: String }`, `#[derive(Serialize)] struct JoinResponse { url: String, token: String }` and a helper `fn error(status: StatusCode, msg: &str) -> Response` producing `{"error": msg}`
- [X] T007 [US1] In `crates/xora-token/src/main.rs` add `fn clean(value: &str, max: usize) -> Option<&str>`: trims, returns `None` if empty, longer than `max` chars (`chars().count()`) or containing `char::is_control`; nickname max 32, room max 64 (FR-008, data-model.md)
- [X] T008 [US1] In `crates/xora-token/src/main.rs` add `fn new_identity() -> String` returning `format!("{:x}-{:x}", unix_nanos, COUNTER.fetch_add(1, Relaxed))` with a `static COUNTER: AtomicU64` (research R2, FR-005)
- [X] T009 [US1] In `crates/xora-token/src/main.rs` add `fn sign(config: &Config, room: &str, nickname: &str) -> anyhow::Result<String>` using `livekit_api::access_token::{AccessToken, VideoGrants}` exactly as research R1 (room_join, room, can_publish, can_subscribe, can_publish_data set; TTL 6 h; identity from T008) (FR-002–FR-005)
- [X] T010 [US1] In `crates/xora-token/src/main.rs` add the attempt limiter from research R5: `struct Limiter(Mutex<HashMap<IpAddr, Attempts>>)` with `fn is_blocked(&self, ip) -> bool` and `fn record_failure(&self, ip)` (10 failures in 60 s → blocked 300 s; prune stale entries with `retain` on every write), plus `fn source(headers: &HeaderMap, peer: SocketAddr) -> IpAddr` that reads the rightmost `X-Forwarded-For` value only when `peer.ip().is_loopback()` (one-line comment: only the local Caddy is trusted to set it) and otherwise, or when the header is missing or unparsable, returns `peer.ip()` (FR-009, research R5)
- [X] T011 [US1] In `crates/xora-token/src/main.rs` add the `POST /token` handler taking `State`, `ConnectInfo<SocketAddr>`, `HeaderMap` and `Result<Json<JoinRequest>, JsonRejection>`; order: rejection → 400 `bad request`; blocked → 403 `invalid invite`; `invite.as_bytes().ct_eq(config.invite.as_bytes())` false → `record_failure`, `warn!` with source only, 403 `invalid invite`; `clean` nickname → 422 `nickname must be 1-32 characters`; `clean` room → 422 `room must be 1-64 characters`; `sign` error → 500 `internal error` (log the error, not the inputs); success → 200 `JoinResponse { url: config.livekit_url, token }`. Add `.layer(DefaultBodyLimit::max(1024))` to the router (FR-006, FR-007, FR-012)
- [X] T012 [US1] Run `cargo clippy -p xora-token --all-targets --locked -- -D warnings` and follow quickstart.md sections 1–3 (health, valid pass with decoded claims, wrong code, empty nickname, malformed body, 10-failure block, missing env var, no secrets in logs); fix any deviation in `crates/xora-token/src/main.rs`

**Checkpoint**: US1 complete; commit `feat(token): issue livekit passes for valid invites`.

---

## Phase 4: User Story 2 - Rotate the invite code (Priority: P2)

**Goal**: Changing `XORA_INVITE_CODE` and restarting only xora-token switches the accepted code.

**Independent Test**: quickstart.md section 4 (local) and section 5 rotation bullet (deployed).

- [X] T013 [US2] Follow quickstart.md section 4 locally (restart with a new `XORA_INVITE_CODE`; old code 403, new code 200). No code change expected: config is read once at startup (T004)

---

## Phase 5: User Story 3 - Bring up the whole server on one machine (Priority: P3)

**Goal**: `docker compose up -d --build` in `deploy/` brings up Caddy, livekit-server and
xora-token per [contracts/deployment.md](contracts/deployment.md).

**Independent Test**: quickstart.md section 5.

- [X] T014 [P] [US3] Create `deploy/Dockerfile`: stage `build` from `rust:1.97.1-slim-trixie`, `WORKDIR /src`, `COPY . .`, `RUN cargo build --release --locked -p xora-token`; stage from `debian:13-slim`, copy `/src/target/release/xora-token` to `/usr/local/bin/`, run as a non-root user, `ENTRYPOINT ["xora-token"]` (research R9)
- [X] T015 [P] [US3] Create `deploy/livekit.yaml` with `port: 7880`, `rtc: { tcp_port: 7881, port_range_start: 50000, port_range_end: 60000, use_external_ip: true }`, `turn: { enabled: true, tls_port: 5349, udp_port: 3478, external_tls: true }`, `logging: { json: false }`; no keys, no domain (research R7)
- [X] T016 [US3] Create the Caddy config per research R8: layer4 server on `:443` routing SNI `XORA_TURN_DOMAIN` → TLS → `localhost:5349` and SNI `XORA_DOMAIN` → TLS (ALPN `http/1.1`) → PROXY protocol v2 → `127.0.0.1:8080`; internal HTTP server on `127.0.0.1:8080` with a `proxy_protocol` listener wrapper allowing `127.0.0.1/32`, routing `/token` and `/health` to `127.0.0.1:3000` and everything else to `localhost:7880`; certificate automation for both domains; storage `/data`. Prefer `deploy/Caddyfile` with `{$XORA_DOMAIN}`/`{$XORA_TURN_DOMAIN}`; validate with `docker run --rm --env-file deploy/.env.example -v ./deploy:/d livekit/caddyl4:v2.11.3 adapt --config /d/Caddyfile`; if layer4 TLS cert automation cannot be expressed, write `deploy/caddy.yaml` (YAML adapter like the official generator) instead and note the choice in research.md R8
- [X] T017 [US3] Create `deploy/docker-compose.yml`: services `caddy` (`livekit/caddyl4:v2.11.3`, config from T016, volume `./caddy_data:/data`), `livekit` (`livekit/livekit-server:v1.13.9`, `--config /etc/livekit.yaml`, environment `LIVEKIT_KEYS: "${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"`, `LIVEKIT_TURN_DOMAIN: ${XORA_TURN_DOMAIN}`), `xora-token` (`build: { context: .., dockerfile: deploy/Dockerfile }`, `env_file: .env`, environment `LIVEKIT_URL: wss://${XORA_DOMAIN}`); all with `network_mode: host` and `restart: unless-stopped`; `caddy` gets only `environment: { XORA_DOMAIN: ${XORA_DOMAIN}, XORA_TURN_DOMAIN: ${XORA_TURN_DOMAIN} }` and no `env_file`, so it never sees the invite code or API secret (least privilege, Principle IX); `livekit` also uses only its `environment` entries
- [X] T018 [P] [US3] Create `deploy/.env.example` with `XORA_DOMAIN=xora.duckdns.org`, `XORA_TURN_DOMAIN=xora-turn.duckdns.org`, `LIVEKIT_API_KEY=change-me`, `LIVEKIT_API_SECRET=change-me-at-least-32-characters-long`, `XORA_INVITE_CODE=change-me`; one comment line on how to generate secrets (`openssl rand -base64 32`)
- [X] T019 [US3] Create `deploy/README.md` (English): 1) DuckDNS account and two subdomains pointed to the VM IP, how to update the IP if the VM is recreated; 2) Oracle Cloud Always Free Ampere A1 with Ubuntu 24.04 aarch64, VCN security list ingress rules and the instance iptables rules for TCP 80, 443, 7881 and UDP 3478, 50000-60000 (contracts/deployment.md); 3) install Docker Engine via `get.docker.com` and `sudo systemctl enable --now docker` so the stack returns after reboot (SC-006); 4) clone the repo, `cp deploy/.env.example deploy/.env`, fill values (API secret at least 32 characters, e.g. `openssl rand -base64 32`); 5) `docker compose up -d --build`; 6) verify `/health`; 7) rotate invite (`docker compose up -d xora-token` after editing `.env`); 8) update (`git pull && docker compose up -d --build`); 9) idle-reclaim warning and how to rebuild on a new VM (research R10, FR-016)
- [X] T020 [P] [US3] Add a "Server" section to `README.md` linking to `deploy/README.md`
- [X] T021 [US3] Validate the deploy files with Docker (locally after installing Docker, or on the VM): `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config` succeeds, the Caddy adapt from T016 succeeds, `docker compose build xora-token` succeeds; fix files from T014–T018
- [ ] T022 [US3] Operator run on the real VM following `deploy/README.md` and quickstart.md section 5 (HTTPS health and token, meet.livekit.io join, UDP-blocked relay over TLS, rotation without dropping the call, reboot); record results in the PR description, including the time to obtain a pass from a home connection (SC-001, target < 1 s, e.g. `curl -w '%{time_total}'`) and the total time to deploy following the guide (SC-004, target < 1 h)

**Checkpoint**: US3 complete; commit `feat(deploy): add docker compose stack for single-vm hosting`.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 Review `crates/xora-token/src/main.rs` and `deploy/` for comments that restate code (Principle II) and for any logged secret (FR-012); `cargo clippy --workspace --all-targets --locked -- -D warnings`
- [ ] T024 Push the branch, open the PR to `main`, confirm CI jobs `windows` and `linux` pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: first.
- **Foundational (Phase 2)**: after Setup; blocks US1 and US2.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1 (needs `/token`).
- **US3 (Phase 5)**: T014–T020 can start after Setup; T021 needs T014–T018; T022 needs US1 and T021.
- **Polish (Phase 6)**: after all stories (T022 may finish after the PR is open).

### Within User Story 1

- T006 → T007, T008, T009, T010 (same file, sequential) → T011 → T012.

### Parallel Opportunities

- T003 alongside T002.
- T014, T015, T018, T020 together (different files), and in parallel with Phases 2–4.

## Parallel Example: User Story 3

```text
Task: "T014 Create deploy/Dockerfile"
Task: "T015 Create deploy/livekit.yaml"
Task: "T018 Create deploy/.env.example"
Task: "T020 Add Server section to README.md"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Setup + Foundational.
2. US1: token endpoint validated locally with curl.
3. Stop and validate quickstart 1–3.

### Incremental Delivery

1. US1 → local token service.
2. US2 → rotation proven locally.
3. US3 → deploy files validated with Docker, then real VM run.

## Notes

- No test tasks (constitution Principle III).
- One PR for the whole feature (Principle IV); T022 depends on the operator having the VM and
  DuckDNS names, so the PR can be opened with T022 pending and merged after it is recorded.
