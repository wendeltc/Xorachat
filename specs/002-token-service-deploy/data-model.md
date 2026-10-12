# Data Model: Token Service and Deployment

Nothing is persisted. All state lives in process memory and is lost on restart.

## JoinRequest (input)

| Field | Type | Rules |
|---|---|---|
| `nickname` | string | trimmed; 1–32 chars; no control chars |
| `room` | string | trimmed; 1–64 chars; no control chars; case kept |
| `invite` | string | compared in constant time with `XORA_INVITE_CODE`; never trimmed or logged |

Validation order: malformed body (400) → source blocked? → invite → nickname → room. The invite is
checked before field validation so a wrong code never learns which field would have failed.

## JoinResponse (output)

| Field | Type | Source |
|---|---|---|
| `url` | string | `LIVEKIT_URL` (e.g. `wss://xora.duckdns.org`) |
| `token` | string | signed pass (JWT) |

## Pass (JWT claims)

| Claim | Value |
|---|---|
| `sub` (identity) | `<unix_nanos hex>-<counter hex>`, unique per issue |
| `name` | nickname |
| `video.roomJoin` | `true` |
| `video.room` | room |
| `video.canPublish` / `canSubscribe` / `canPublishData` | `true` |
| everything else | default (`false` / absent) |
| `exp` | issue time + 6 h |

## Attempts (per source address)

| Field | Type | Meaning |
|---|---|---|
| `window_start` | Instant | start of the current 60 s window |
| `failures` | u32 | refused invites in the window |
| `blocked_until` | Option<Instant> | set to now + 300 s when `failures` reaches 10 |

Transitions: `failures` resets when the window expires; any request while `blocked_until > now`
is refused; entries with an expired window and no active block are removed on the next write.

## Config (environment)

| Variable | Required | Used by |
|---|---|---|
| `LIVEKIT_URL` | yes | xora-token |
| `LIVEKIT_API_KEY` | yes | xora-token, livekit (`LIVEKIT_KEYS`) |
| `LIVEKIT_API_SECRET` | yes, ≥ 32 chars | xora-token, livekit (`LIVEKIT_KEYS`) |
| `XORA_INVITE_CODE` | yes | xora-token |
| `XORA_BIND_ADDR` | no, default `127.0.0.1:3000` | xora-token |
| `XORA_DOMAIN` | yes (deploy) | Caddy, `LIVEKIT_URL` |
| `XORA_TURN_DOMAIN` | yes (deploy) | Caddy, livekit (`LIVEKIT_TURN_DOMAIN`) |
