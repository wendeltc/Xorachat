# Quickstart: Token Service and Deployment validation

Manual validation (constitution Principle III). Contract details: [contracts/token-api.md](contracts/token-api.md),
[contracts/deployment.md](contracts/deployment.md).

## 1. Local token service (US1)

```bash
export LIVEKIT_URL=wss://example.invalid LIVEKIT_API_KEY=devkey \
  LIVEKIT_API_SECRET=devsecret-devsecret-devsecret-00 XORA_INVITE_CODE=letmein
cargo run -p xora-token
```

In another terminal:

```bash
curl -s localhost:3000/health
curl -s -XPOST localhost:3000/token -H 'content-type: application/json' \
  -d '{"nickname":" ana ","room":"games","invite":"letmein"}'
curl -s -w ' %{http_code}\n' -XPOST localhost:3000/token -H 'content-type: application/json' \
  -d '{"nickname":"ana","room":"games","invite":"wrong"}'
curl -s -w ' %{http_code}\n' -XPOST localhost:3000/token -H 'content-type: application/json' \
  -d '{"nickname":"  ","room":"games","invite":"letmein"}'
curl -s -w ' %{http_code}\n' -XPOST localhost:3000/token -H 'content-type: application/json' -d 'nope'
```

Expected: `{"status":"ok"}`; a `{url, token}` pair; `{"error":"invalid invite"} 403`;
nickname error `422`; `{"error":"bad request"} 400`.

Decode the token payload (`cut -d. -f2 | base64 -d`) and check: `name` is `ana` (trimmed),
`video.room` is `games`, `roomJoin/canPublish/canSubscribe/canPublishData` are true, no admin
grants, `exp - nbf` (or `exp - iat`) is 21600. Request twice with the same nickname: `sub` differs.

## 2. Attempt limit (FR-009)

Send 10 requests with a wrong code, then one with the right code: the 11th is refused with the same
403. After 5 minutes the right code works again.

## 3. Missing configuration (FR-011, FR-012)

`unset XORA_INVITE_CODE; cargo run -p xora-token` → exits 1 naming `XORA_INVITE_CODE`.
`LIVEKIT_API_SECRET=short cargo run -p xora-token` → exits 1 saying the secret must be at least 32
characters. In all runs
above, logs never show the code, secret or token.

## 4. Invite rotation (US2)

Restart with `XORA_INVITE_CODE=newcode`: `letmein` → 403, `newcode` → 200.

## 5. Full deployment (US3)

On the VM, follow `deploy/README.md`, then from a home machine:

```bash
curl -s https://<XORA_DOMAIN>/health
curl -s -XPOST https://<XORA_DOMAIN>/token -H 'content-type: application/json' \
  -d '{"nickname":"ana","room":"games","invite":"<code>"}'
```

Expected: valid certificate (no `-k`), `{url, token}` with `url = wss://<XORA_DOMAIN>`.

- Paste URL and token in <https://meet.livekit.io> (custom server tab): joins the room with camera
  and microphone.
- UDP-blocked check (SC-005): on a laptop, block outbound UDP (`sudo iptables -A OUTPUT -p udp
  --dport 1024:65535 -j DROP`, remove afterwards), join again; `chrome://webrtc-internals` shows a
  `relay` candidate over `tls`.
- Rotation without dropping calls (US2 scenario 3): while connected, rotate the invite with the
  command in contracts/deployment.md; the call continues.
- Reboot (SC-006): `sudo reboot`; after it comes back, `/health` answers without manual steps.
