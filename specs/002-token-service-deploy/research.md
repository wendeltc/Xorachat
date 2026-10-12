# Research: Token Service and Deployment

Sources checked on 2026-10-12: `livekit-token` 0.2.1 and `livekit-api` 0.8.2 sources (cargo
registry), `cargo tree -p xora-token`, Docker Hub tags, `livekit/deploy` generator
(`generate/production.go`, `generate/templates/{docker,caddy}.go`), `livekit/livekit`
(`cmd/server/main.go`, `pkg/config/config.go`), docs.livekit.io self-hosting VM page.

## R1. Signing the pass

- **Decision**: `livekit_api::access_token::AccessToken::with_api_key(key, secret)
  .with_identity(id).with_name(nickname).with_ttl(Duration::from_secs(6 * 3600))
  .with_grants(VideoGrants { room_join: true, room, can_publish: Some(true),
  can_subscribe: Some(true), can_publish_data: Some(true), ..Default::default() }).to_jwt()`.
- **Rationale**: `livekit-api` re-exports `livekit-token` as `access_token`; `VideoGrants` derives
  `Default`, so admin/record/create/list stay `false` (FR-003). `to_jwt` signs HS256 locally, no
  network call, no TLS backend needed.

## R2. Unique identity without a new crate

- **Decision**: identity = `format!("{:x}-{:x}", unix_nanos, counter)` where `counter` is a
  process-wide `AtomicU64`.
- **Rationale**: FR-005 only needs uniqueness among live participants. Nanosecond time plus a
  counter cannot repeat inside one process and is practically unique across restarts.
- **Alternatives**: `uuid` (not in the dependency tree, new crate); `rand` (already transitive, but
  would become a direct dependency for one call).

## R3. Constant-time invite comparison

- **Decision**: `subtle::ConstantTimeEq` on the UTF-8 bytes (`a.as_bytes().ct_eq(b.as_bytes())`).
- **Rationale**: FR-007. `subtle` 2.6.1 is already compiled into `xora-token` through
  `livekit-token → hmac → digest`, so making it direct adds zero build weight. A hand-written XOR loop
  can be short-circuited by the optimizer. `ct_eq` returns early on length mismatch, leaking only the
  code length; with FR-009 limiting attempts to 10 per minute per source, that is not exploitable.
- **Constitution VII**: `subtle` is not in PROJETO.md section 5 → justified in Complexity Tracking.

## R4. JSON and HTTP layer

- **Decision**: `axum` 0.8 `Router` with `POST /token` (`Json<JoinRequest>`) and `GET /health`;
  `serde` with `derive` (listed in PROJETO.md 5.1). Reject bodies over 1 KiB with
  `DefaultBodyLimit::max(1024)`. Malformed JSON → axum's rejection mapped to
  `400 {"error":"bad request"}`.

## R5. Per-source attempt limit (FR-009)

- **Decision**: `Mutex<HashMap<IpAddr, Attempts>>` in shared state; `Attempts { window_start,
  failures, blocked_until }`. A refused invite increments `failures`; 10 within 60 s sets
  `blocked_until = now + 300 s`. Blocked sources get the same `403 {"error":"invalid invite"}` before
  the code is even checked. Stale entries are dropped on each write (`retain`), bounding memory.
- **Source address**: rightmost value of `X-Forwarded-For` set by Caddy, trusted only when the TCP
  peer is a loopback address (Caddy on the same host); otherwise, or when the header is absent, the
  socket peer (`ConnectInfo`). This keeps the limit unspoofable even if `XORA_BIND_ADDR` is changed
  to a public interface.
- **Rationale**: in-memory is enough for one instance (spec assumption); no new crate
  (`tower_governor` and similar would add dependencies).

## R6. Configuration

- **Decision**: required env vars `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `XORA_INVITE_CODE`; optional `XORA_BIND_ADDR` (default `127.0.0.1:3000`). Missing or empty →
  `anyhow` error naming the variable and exit code 1 (FR-011). `LIVEKIT_API_SECRET` under 32
  characters is also refused at startup, since livekit-server rejects short secrets and the token
  service would otherwise issue unusable passes. Values are never logged (FR-012).

## R7. Media server and relay (TURN)

- **Decision**: `livekit/livekit-server:v1.13.9` (amd64 + arm64 on Docker Hub, published
  2026-10-07), host networking, `deploy/livekit.yaml` with the values the official generator uses:
  `port: 7880`, `rtc: {tcp_port: 7881, port_range_start: 50000, port_range_end: 60000,
  use_external_ip: true}`, `turn: {enabled: true, tls_port: 5349, udp_port: 3478,
  external_tls: true}`, no Redis (single node).
- **Secrets and domain without editing YAML**: livekit-server reads `LIVEKIT_KEYS`
  (`"<key>: <secret>"`) and generates an env var for every config field
  (`LIVEKIT_<PATH>`, e.g. `LIVEKIT_TURN_DOMAIN`). Compose passes them from `deploy/.env`, so
  `livekit.yaml` stays generic and secret-free (FR-017).

## R8. TLS and routing on port 443

- **Decision**: `livekit/caddyl4:v2.11.3` (Caddy + layer4 plugin, amd64 + arm64), host networking,
  following the official generator: layer4 server on `:443` routes by SNI.
  - TURN domain → TLS terminated by Caddy → `localhost:5349` (TURN/TLS, `external_tls`).
  - Main domain → TLS terminated by Caddy (ALPN `http/1.1`) → PROXY protocol v2 →
    `127.0.0.1:8080`, a plain-HTTP Caddy server that routes `/token` and `/health` to
    `127.0.0.1:3000` (xora-token) and everything else (WebSocket signaling) to `localhost:7880`.
  - Certificates for both domains are automated by Caddy via HTTP-01 on port 80.
- **Why the extra internal HTTP hop**: the generator proxies the main domain straight to LiveKit,
  which leaves no place for `/token`. One internal HTTP server keeps two domains (clarification
  2026-10-12) instead of a third one. PROXY protocol keeps the real client address for R5.
- **Config format (verified 2026-10-12 with `livekit/caddyl4:v2.11.3`)**: `deploy/Caddyfile` with
  `{$XORA_DOMAIN}` / `{$XORA_TURN_DOMAIN}`. Three findings from running it:
  1. Layer4 TLS handlers do not trigger certificate automation by themselves. A site
     `https://<both domains>:8443` bound to `127.0.0.1` makes Caddy obtain and renew both
     certificates, which the layer4 handlers then use.
  2. That site's automatic HTTP listener would also bind to `127.0.0.1`, so HTTP-01 from outside
     fails. An explicit `http://` site on public port 80 serves the ACME challenge and redirects;
     `auto_https disable_redirects` stops the automatic redirect to `:8443` from winning.
  3. `disable_tlsalpn_challenge`, since port 443 belongs to layer4.
  Validated locally with the full stack and `tls internal`: `/health`, `/token`, LiveKit `/` and
  `/rtc/validate` with an issued token over 443, TURN SNI handshake, and the real client address
  reaching xora-token through PROXY protocol (a forged `X-Forwarded-For` is discarded by Caddy).

## R9. Building xora-token for arm64 and amd64

- **Decision**: `deploy/Dockerfile`, two stages: `rust:1.97.1-slim-trixie` builds
  `cargo build --release --locked -p xora-token`; `debian:13-slim` runtime with only the binary.
  Built on the VM by `docker compose build`, so it is native arm64 on Oracle and amd64 elsewhere;
  no registry or cross-compilation.
- **Rationale**: `-p xora-token` never compiles `webrtc-sys`, so no clang or libwebrtc download in
  the image. Build context is the repository root (workspace manifest needed); a `.dockerignore`
  excludes `target/`, `legacy/`, `specs/`, `.git/`.

## R10. Host: Oracle Cloud Always Free

- **Decision**: guide targets an Ampere A1 instance with the Ubuntu 24.04 aarch64 image, Docker
  Engine from `get.docker.com`.
- **Gotchas to document**: open ports both in the VCN security list and in the instance's iptables
  (Oracle's Ubuntu images ship REJECT rules); the idle-reclaim policy (PROJETO.md 7) and how to
  recreate the VM from the repository.

## R11. Domains: DuckDNS

- **Decision**: two subdomains, e.g. `xora.duckdns.org` (token + signaling) and
  `xora-turn.duckdns.org` (TURN), set to the VM's public IP in the DuckDNS web UI. Let's Encrypt
  issues certificates for DuckDNS subdomains via HTTP-01.
