# Contract: Deployment

## Files (`deploy/`)

| File | Purpose |
|---|---|
| `docker-compose.yml` | services `caddy`, `livekit`, `xora-token`; host networking; `restart: unless-stopped`; only `xora-token` uses `env_file: .env`, `caddy` and `livekit` get just the variables they need |
| `Dockerfile` | builds `xora-token` (context: repository root) |
| `Caddyfile` or `caddy.yaml` | layer4 SNI routing on 443 + internal HTTP routes (research R8) |
| `livekit.yaml` | generic media server config, no secrets, no domains (research R7) |
| `.env.example` | every variable from data-model.md Config with placeholder values |
| `README.md` | deployment guide (FR-016) |

`deploy/.env` and `deploy/caddy_data/` are git-ignored.

## Operator interface

| Action | Command (from `deploy/`) |
|---|---|
| Start / update | `docker compose up -d --build` |
| Rotate invite | edit `XORA_INVITE_CODE` in `.env`, then `docker compose up -d xora-token` |
| Logs | `docker compose logs -f <service>` |
| Stop | `docker compose down` |

## Network

| Port | Protocol | Service |
|---|---|---|
| 80 | TCP | Caddy, certificate issuance |
| 443 | TCP | Caddy: HTTPS (token + signaling) and TURN/TLS by SNI |
| 7881 | TCP | WebRTC over TCP |
| 3478 | UDP | TURN/UDP |
| 50000–60000 | UDP | WebRTC over UDP |

Internal only (bound to localhost): 3000 xora-token, 5349 TURN after TLS, 7880 LiveKit HTTP/WS,
8080 Caddy internal HTTP.

## DNS

Two DuckDNS A records pointing to the VM public IP: `<XORA_DOMAIN>` and `<XORA_TURN_DOMAIN>`.
