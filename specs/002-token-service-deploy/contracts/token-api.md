# Contract: xora-token HTTP API

Base URL in production: `https://<XORA_DOMAIN>`. Locally: `http://127.0.0.1:3000`.
All bodies are JSON (`Content-Type: application/json`). Request bodies over 1 KiB are refused.

## POST /token

Request:

```json
{ "nickname": "ana", "room": "games", "invite": "the-code" }
```

| Status | Body | When |
|---|---|---|
| 200 | `{"url": "wss://xora.duckdns.org", "token": "<jwt>"}` | invite matches, fields valid |
| 400 | `{"error": "bad request"}` | body is not valid JSON or a field is missing |
| 403 | `{"error": "invalid invite"}` | invite does not match, or source is blocked (FR-009) |
| 422 | `{"error": "nickname must be 1-32 characters"}` | nickname empty, too long or has control chars |
| 422 | `{"error": "room must be 1-64 characters"}` | room empty, too long or has control chars |

The 403 body is identical in every refused-invite case (FR-006, SC-002).

## GET /health

| Status | Body |
|---|---|
| 200 | `{"status": "ok"}` |

No configuration or version details are exposed.

## Startup

- Exit code 1 and one log line `missing environment variable <NAME>` when a required variable is
  absent or empty (FR-011).
- Log lines never contain the invite code, API secret or issued tokens (FR-012). Refused attempts
  are logged at `warn` with the source address only.
