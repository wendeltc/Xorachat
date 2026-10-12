# Implementation Plan: Token Service and Deployment

**Branch**: `002-token-service-deploy` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-token-service-deploy/spec.md`

## Summary

Turn `xora-token` into a small axum service: `POST /token` checks the invite in constant time, rate
limits refused attempts per source, validates nickname and room, and returns the LiveKit URL plus a
6-hour pass signed with `livekit-api`; `GET /health` answers ok. Add `deploy/` with a Docker Compose
stack (Caddy L4, livekit-server 1.13.9 with embedded TURN, xora-token built on the VM) for Oracle
Cloud Always Free ARM64 behind two DuckDNS subdomains. See [research.md](research.md).

## Technical Context

**Language/Version**: Rust 1.97.1, edition 2024 (workspace)

**Primary Dependencies**: `axum` 0.8.9, `livekit-api` 0.8.2 (`access-token`), `tokio` 1, `serde` 1
(`derive`), `subtle` 2.6 (already transitive), `tracing`, `tracing-subscriber`, `anyhow`; deploy:
`livekit/livekit-server:v1.13.9`, `livekit/caddyl4:v2.11.3`, Docker Compose v2

**Storage**: none; in-memory attempt table

**Testing**: none (constitution Principle III); manual via [quickstart.md](quickstart.md)

**Target Platform**: xora-token on Linux arm64/amd64 (container); local runs on any workspace
platform. Host: Ubuntu 24.04 aarch64 on Oracle Ampere A1

**Project Type**: HTTP microservice + infrastructure-as-files

**Performance Goals**: pass issued in under 1 s end to end (SC-001); trivial load (a few friends)

**Constraints**: invite/secret never logged or committed; xora-token reachable only through Caddy;
single VM; zero infrastructure cost

**Scale/Scope**: 1 binary (~150 lines), 6 deploy files, 1 guide

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. English only | Pass | Code, logs, API errors, guide in English |
| II. Minimal comments | Pass | Comments only for non-obvious "why" (PROXY protocol hop, X-Forwarded-For trust) |
| III. No automated tests | Pass | Manual quickstart only |
| IV. One feature per PR | Pass | Branch `002-token-service-deploy`, one PR |
| V. Versioning | Pass | Crate keeps `version.workspace = true` |
| VI. Lightweight first | Pass | Stateless service, no DB, release build in slim image |
| VII. Few dependencies | Pass with justification | `serde` listed in PROJETO.md 5; `subtle` justified below |
| VIII. Layered architecture | Pass | `xora-token` depends on no other xora crate |
| IX. Security | Pass | Secrets only from env (`.env` git-ignored), constant-time compare, attempt limit, no secret logging, bound to localhost |
| X. Targets | Pass | Server side only; client targets unaffected |

Post-design re-check: unchanged, all gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/002-token-service-deploy/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── token-api.md
│   └── deployment.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
Cargo.toml                       # + serde (derive), subtle in [workspace.dependencies]
.gitignore                       # + deploy/.env, deploy/caddy_data/
.dockerignore                    # target/, legacy/, specs/, .git/
crates/xora-token/
├── Cargo.toml                   # + serde, subtle
└── src/main.rs                  # config, router, handler, attempt limiter
deploy/
├── docker-compose.yml           # caddy, livekit, xora-token (host network; only xora-token reads .env whole)
├── Dockerfile                   # rust:1.97.1-slim-trixie → debian:13-slim
├── Caddyfile | caddy.yaml       # chosen at implementation (research R8)
├── livekit.yaml                 # generic, no secrets/domains
├── .env.example
└── README.md                    # guide: DuckDNS, Oracle VM, ports, start, rotate, update
README.md                        # + link to deploy/README.md
```

**Structure Decision**: single `main.rs` (user request) unless it grows past one screen of logic;
the limiter is the first candidate to move to `limiter.rs` if so.

## Implementation Notes

- Handler order: resolve source → blocked? → `ct_eq(invite)` (record failure on mismatch) →
  validate nickname/room → sign → 200. Errors as `(StatusCode, Json<{"error": ...}>)`.
- Source address: rightmost `X-Forwarded-For` only from a loopback peer, else `ConnectInfo<SocketAddr>`; serve with
  `into_make_service_with_connect_info::<SocketAddr>()`.
- `.env` holds only primary values; Compose derives `LIVEKIT_URL: wss://${XORA_DOMAIN}` in the
  `xora-token` service `environment`, so the domain is typed once.
- Compose passes `LIVEKIT_KEYS="${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"` and
  `LIVEKIT_TURN_DOMAIN=${XORA_TURN_DOMAIN}` to livekit (research R7).
- Docker is not installed on the development machine; the Caddy config check from research R8 runs
  on the VM, or Docker is installed locally first.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `subtle` not listed in PROJETO.md 5 | Constant-time invite comparison (FR-007, Principle IX) | Hand-written loop can be optimized into an early exit; `subtle` is already compiled transitively, so no added weight |
| Extra internal Caddy HTTP server + PROXY protocol | Serve `/token` on the main domain and keep client IP for FR-009 | Third domain contradicts clarification (two DuckDNS names); without PROXY protocol every request looks like 127.0.0.1 and one attacker would block everyone |
