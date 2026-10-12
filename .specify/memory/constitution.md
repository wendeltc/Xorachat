<!--
Sync Impact Report
- Version change: 1.0.0 → 1.0.1 (PATCH)
- Modified: preamble now points to docs/PROJETO.md (moved by feature 001)
- Added sections: none
- Removed sections: none
- Templates: no changes needed
- Follow-up TODOs: none
-->

# Xorachat Constitution

Xorachat is a lightweight native desktop app written in Rust for voice chat, text chat and screen
sharing with system audio among a small group of friends, backed by a self-hosted LiveKit SFU.
`docs/PROJETO.md` is the source of truth for scope, stack, architecture and phases.

## Core Principles

### I. English Only

Code, identifiers, log messages, UI strings, specs, plans, tasks, commit messages and PR
descriptions MUST be written in English.

### II. Minimal Comments

Code MUST be self-explanatory. Comments are allowed only to explain a non-obvious "why", such as
platform quirks or SDK workarounds. Doc comments that restate signatures, commented-out code and
TODO noise MUST NOT be committed.

### III. No Automated Tests During the MVP

`tasks.md` MUST NOT contain unit, integration or contract test tasks, and no test code is written.
Each feature MUST be validated manually through the steps in its `quickstart.md`. This principle
MUST be revisited when the MVP (v0.1.0) ships.

Rationale: the MVP is about proving the media pipeline and user experience quickly; most risk is in
real devices, drivers and networks, which manual validation covers better at this stage.

### IV. One Feature per Pull Request

Every feature MUST be developed on its own branch named after its spec (`NNN-short-name`) and
merged into `main` through a single pull request. Commits MUST follow Conventional Commits. A PR
MUST build on Windows and Linux in CI before merge.

### V. Versioning

The project starts at `0.1.0`. The version MUST live only in `[workspace.package]` of the root
`Cargo.toml`, and every crate MUST inherit it with `version.workspace = true`. Versions follow
SemVer. The MVP ships as tag `v0.1.0`.

### VI. Lightweight First

- Capturing, encoding and sending the screen MUST cost the streamer as little CPU/GPU as possible.
- With the window hidden, the app MUST stop rendering and unsubscribe from video; in a voice call it
  targets near-zero CPU and under 150 MB of RAM.
- Video MUST be downloaded and decoded only by viewers who chose to watch it.

Rationale: the app runs in the background while people play games.

### VII. Simplicity and Few Dependencies

- No database, no accounts, no message history.
- Prefer what the `livekit` SDK already provides over new code or crates.
- Only crates listed in `PROJETO.md` section 5 may be added freely; any other dependency MUST be
  justified in the feature's `plan.md` (Complexity Tracking).

### VIII. Layered Architecture

- Workspace crates: `xora-app` → `xora-core` → `xora-media`, plus the server binary `xora-token`.
- `xora-core` MUST NOT contain UI code.
- OS-specific code MUST live only in `xora-media`, behind `cfg(target_os)`.

### IX. Security

The LiveKit API secret MUST never reach the client. The invite code, API key and API secret MUST
come only from server environment variables and MUST NOT be committed or logged.

### X. Target Platforms

Windows 10/11 and Linux (Debian and Fedora) on x86_64. The Linux binary MUST be built on Debian
stable so it also runs on Fedora.

## Technology Constraints

Pinned versions (change only through a plan that justifies it):

| Crate / tool | Version |
|---|---|
| `livekit` | 0.9.4 |
| `eframe`, `egui`, `egui-wgpu` | 0.36 |
| `axum` | 0.8 |
| `livekit-api` | 0.8 |
| `wasapi` | 0.26 |
| `pipewire` | 0.10 |
| `tray-icon` | 0.26 |
| `global-hotkey` | 0.8 |
| `livekit-server` | 1.13 |

## Development Workflow

1. Update `main`, create the feature branch `NNN-short-name`.
2. `/speckit-specify` → optional `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
   `/speckit-analyze` → `/speckit-implement`.
3. Validate manually with the feature's `quickstart.md`.
4. `cargo build --workspace` and `cargo clippy --workspace -- -D warnings` pass locally.
5. Open one PR into `main`; CI must be green on Windows and Linux before merge.

## Governance

This constitution supersedes other practices. Every plan's Constitution Check and every PR review
MUST verify compliance; deviations MUST be justified in the plan's Complexity Tracking section.

Amendments are made through `/speckit-constitution` in their own PR and MUST update dependent
templates. The constitution version follows SemVer: MAJOR for removed or redefined principles,
MINOR for new principles or materially expanded guidance, PATCH for wording fixes.

**Version**: 1.0.1 | **Ratified**: 2026-10-11 | **Last Amended**: 2026-10-11
