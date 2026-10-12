# Feature Specification: Token Service and Deployment

**Feature Branch**: `002-token-service-deploy`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "Server side access control and deployment. A token service lets a client ask to join a room by sending nickname, room name and invite code. If the invite code matches the one configured on the server, the service returns the LiveKit server URL and a signed access token for that room and identity; otherwise it rejects the request without revealing why beyond \"invalid invite\". Nicknames must be non-empty; uniqueness per room is not enforced. Rotating the invite code only requires restarting the service. A reproducible deployment brings up the SFU with embedded TURN, the token service and automatic TLS on a single VM, targeting Oracle Cloud Always Free ARM64 as the preferred host. Out of scope: accounts, databases, multiple invite codes, rate limiting dashboards."

## Clarifications

### Session 2026-10-12

- Q: Room policy (PROJETO.md 8.3.1): fixed room, closed list or free-form names? → A: Free-form;
  any room name is accepted with the valid invite code.
- Q: Which domain names does the deployment use? → A: Two free DuckDNS subdomains, one for the
  token service and media server, one for the relay (TURN).

## User Scenarios & Testing *(mandatory)*

Actors:

- **Friend**: a person in the group who wants to join a room. In this feature they act through any
  HTTP client; the desktop app uses the same flow in feature 003.
- **Operator**: the friend who owns the server, sets the invite code and runs the deployment.

### User Story 1 - Join a room with the invite code (Priority: P1)

A friend sends their nickname, the room name and the invite code to the token service. If the code
is correct they receive the address of the media server and a pass that lets them enter that room
under their nickname. If the code is wrong they get a short "invalid invite" answer and nothing else.

**Why this priority**: without it nobody can enter a room, and it is the only thing that keeps
strangers out (constitution Principle IX).

**Independent Test**: run the token service locally with a known invite code; request a pass with
the right code and confirm a server address and pass come back and the pass names the requested
room and nickname; repeat with a wrong code and confirm only "invalid invite" comes back.

**Acceptance Scenarios**:

1. **Given** the service configured with invite code `X`, **When** a friend sends nickname `ana`,
   room `games` and code `X`, **Then** they receive the media server address and a pass valid for
   room `games` that shows the name `ana`.
2. **Given** the service configured with invite code `X`, **When** a friend sends any other code,
   **Then** the request is refused with the message "invalid invite" and no pass.
3. **Given** a nickname that is empty or only whitespace, **When** the request is sent with the
   correct code, **Then** it is refused with the message "nickname must be 1-32 characters".
4. **Given** two friends both using nickname `ana` in room `games`, **When** both request a pass,
   **Then** both succeed and each pass carries a different internal identity, so both can be in the
   room at the same time.

---

### User Story 2 - Rotate the invite code (Priority: P2)

The operator suspects the code leaked. They change the configured code and restart the token
service. From then on only the new code works; friends already in a call are not kicked out.

**Why this priority**: it is the only recovery when the shared code leaks (PROJETO.md 8.2).

**Independent Test**: with the service running on code `X`, change the configuration to `Y`,
restart only the token service, then confirm `X` is refused and `Y` works.

**Acceptance Scenarios**:

1. **Given** the code changed from `X` to `Y` and the token service restarted, **When** a friend
   sends `X`, **Then** the request is refused with "invalid invite".
2. **Given** the same restart, **When** a friend sends `Y`, **Then** they receive a pass.
3. **Given** friends already connected to the media server, **When** only the token service
   restarts, **Then** their call continues.

---

### User Story 3 - Bring up the whole server on one machine (Priority: P3)

The operator takes a fresh virtual machine (preferably Oracle Cloud Always Free ARM64), points two
domain names at it, fills in one configuration file with the secrets and the invite code, and starts
everything with a single documented command. The media server with relay (TURN), the token service
and automatic HTTPS certificates come up together and restart on their own after a reboot.

**Why this priority**: needed before friends can use the app outside a local network, but the token
logic can be built and validated locally first.

**Independent Test**: on a fresh VM, follow only the deployment guide; then from a home network
request a pass over HTTPS with a valid certificate and connect a reference media client with it.

**Acceptance Scenarios**:

1. **Given** a fresh VM with the documented ports open and the two domain names pointing to it,
   **When** the operator runs the documented start command, **Then** the token service answers over
   HTTPS with a valid certificate and the media server accepts connections.
2. **Given** the server running, **When** the VM reboots, **Then** all services come back without
   manual steps.
3. **Given** a client behind a restrictive network that blocks UDP, **When** it connects with a
   valid pass, **Then** the connection succeeds through the relay over TCP/TLS.
4. **Given** the deployment files in the repository, **When** someone reads them, **Then** no secret
   or real invite code is present; only an example file with placeholders.

---

### Edge Cases

- Missing configuration at startup (no invite code, no media server keys or no public address): the
  token service refuses to start and names the missing setting, instead of running open or broken.
- Many wrong codes from the same source in a short time (guessing): after a threshold the service
  stops answering that source for a while, with the same "invalid invite" style refusal.
- Very long nickname or room name, or names with control characters: refused with a clear message.
- Room name with surrounding spaces or different letter case: whitespace is trimmed; case is kept,
  so `Games` and `games` are different rooms.
- Malformed request body: refused with a generic "bad request" message, never a crash.
- Token service down while the media server is up: people already in a call keep talking; new
  joins fail until it is back.
- The host reclaims an idle free VM (PROJETO.md 7): the deployment can be recreated from the
  repository and the guide on a new VM.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The token service MUST accept a join request with nickname, room name and invite code.
- **FR-002**: When the invite code matches the configured one, the service MUST return the public
  address of the media server and a signed pass limited to the requested room. Any room name that
  passes FR-008 is accepted; there is no fixed room and no list of allowed rooms.
- **FR-003**: The pass MUST allow joining the room, publishing audio/video, subscribing to others
  and sending chat data, and nothing else (no room administration, no recording).
- **FR-004**: The pass MUST expire 6 hours after it is issued.
- **FR-005**: Each pass MUST carry a newly generated unique identity and the nickname as the
  display name, so repeated nicknames never collide.
- **FR-006**: When the invite code does not match, the service MUST refuse with the message
  "invalid invite" and MUST NOT say whether the code was close, expired or any other detail.
- **FR-007**: Invite code comparison MUST take the same time whether the code is right or wrong.
- **FR-008**: Nickname MUST be 1 to 32 characters after trimming; room name MUST be 1 to 64
  characters after trimming; control characters are refused.
- **FR-009**: After 10 refused invite attempts from the same source within 1 minute, the service
  MUST refuse further requests from that source for 5 minutes.
- **FR-010**: The invite code, media server keys and public address MUST come only from the
  service's environment; changing them requires only a restart of the token service.
- **FR-011**: The service MUST refuse to start when any required setting is missing and log which
  one.
- **FR-012**: The service MUST NOT log the invite code, the media server secret or issued passes.
- **FR-013**: The service MUST expose a health check that reports it is running without revealing
  configuration.
- **FR-014**: The repository MUST contain a deployment that starts the media server with embedded
  relay (TURN over UDP and TLS), the token service and automatic HTTPS for both public names with
  one command on a single VM, and restarts them after reboot.
- **FR-015**: The deployment MUST run on ARM64 (Oracle Cloud Always Free) and x86_64 Linux VMs.
- **FR-016**: The repository MUST contain a deployment guide listing required domain names, open
  ports, configuration values and the start, update and invite rotation procedures. The guide MUST
  use two free DuckDNS subdomains (one for the token service and media server, one for the relay)
  and explain how to point them to the VM address and update them if the address changes.
- **FR-017**: The repository MUST contain only an example configuration with placeholders; real
  secrets MUST be excluded from version control.

### Key Entities

- **Join request**: nickname, room name, invite code.
- **Join response**: media server public address, pass.
- **Pass**: room, unique identity, display name (nickname), permissions, expiry (6 h).
- **Server configuration**: invite code, media server key and secret, media server public address,
  listening address of the token service.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A friend with the right code gets a pass in under 1 second on a home connection to
  the deployed server.
- **SC-002**: 100% of requests with a wrong code are refused with exactly the same message.
- **SC-003**: Rotating the invite code takes the operator under 2 minutes, with zero dropped calls.
- **SC-004**: An operator following only the guide brings up the full server on a fresh VM in under
  1 hour (excluding DNS propagation).
- **SC-005**: A client on a network that blocks UDP joins a room successfully through the relay.
- **SC-006**: The server keeps working with zero manual steps after a VM reboot.

## Assumptions

- One invite code for the whole server; multiple codes are out of scope.
- The operator creates a free DuckDNS account and two subdomains; the address is updated manually
  in DuckDNS when the VM changes (no automatic updater, since the VM address only changes when the VM
  is recreated).
- Account, VM creation and firewall setup on Oracle Cloud are manual steps described in the guide,
  not automated.
- No automated tests (constitution Principle III); validation is manual through quickstart.
- The desktop app does not call the token service yet; that happens in feature 003.
- Requests from the desktop app identify their source by network address; the per-source limit is
  in-memory and resets when the service restarts.
