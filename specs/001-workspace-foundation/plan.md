# Implementation Plan: Workspace Foundation

**Branch**: `001-workspace-foundation` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-workspace-foundation/spec.md`

## Summary

Replace the Electron/PeerJS app with an empty-but-real Rust workspace: four crates laid out as in
PROJETO.md section 6, version 0.1.0 defined once, `xora-core` already linking the LiveKit SDK (and so
libwebrtc), both binaries printing name and version. Previous app files move to `legacy/` with
history, `PROJETO.md` moves to `docs/`, and a CI matrix (Windows + Debian 13 container) builds and
lints every PR. See [research.md](research.md) for the version and toolchain decisions.

## Technical Context

**Language/Version**: Rust 1.97.1 (pinned, same as `livekit/rust-sdks`), edition 2024

**Primary Dependencies**: `livekit` 0.9.4, `livekit-api` 0.8.2 (`access-token` only), `eframe`
0.36.2, `axum` 0.8.9, `tokio` 1, `tracing` 0.1, `tracing-subscriber` 0.3, `anyhow` 1, `thiserror` 2

**Storage**: N/A

**Testing**: none (constitution Principle III); manual validation via [quickstart.md](quickstart.md)

**Target Platform**: Windows 10/11 x86_64 (MSVC, `+crt-static`); Linux x86_64, built on Debian 13,
also run on Fedora

**Project Type**: Cargo workspace with a desktop app binary, a server binary and two libraries

**Performance Goals**: CI under 30 minutes per platform with warm cache (SC-004)

**Constraints**: clang/LLVM 21+ on Linux for `webrtc-sys`; no
secrets in CI

**Scale/Scope**: 4 crates, 1 workflow, README, legacy move; no runtime features

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. English only | Pass | README, code, workflow and specs in English; `docs/PROJETO.md` keeps pt-BR as the original source document, not new content |
| II. Minimal comments | Pass | Only the `.cargo/config.toml` CRT flag and the LLVM install step get a one-line "why" |
| III. No automated tests | Pass | No test tasks; quickstart is manual |
| IV. One feature per PR | Pass | Branch `001-workspace-foundation`, one PR; CI introduced here enforces the build gate |
| V. Versioning | Pass | `[workspace.package] version = "0.1.0"`, crates use `version.workspace = true` |
| VI. Lightweight first | N/A | No runtime behavior yet |
| VII. Few dependencies | Pass | Only crates from PROJETO.md 5; `thiserror` added to a crate only when used; `livekit-api` without default features |
| VIII. Layered architecture | Pass | `xora-app` → `xora-core` → `xora-media`; `xora-token` independent; `src/{windows,linux}` only in `xora-media` |
| IX. Security | Pass | No secrets in repo or CI |
| X. Targets | Pass | Linux job in `debian:13` container; Windows on MSVC |

Post-design re-check: unchanged, all gates pass. Constitution needs a PATCH amendment (1.0.0 →
1.0.1) because its preamble points to `PROJETO.md` at the root (FR-010).

## Project Structure

### Documentation (this feature)

```text
specs/001-workspace-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   └── ci.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
Cargo.toml                       # workspace, resolver 3, [workspace.package], [workspace.dependencies]
Cargo.lock                       # committed (binaries)
rust-toolchain.toml              # channel 1.97.1
.cargo/config.toml               # +crt-static for x86_64-pc-windows-msvc
.gitignore                       # /target
LICENSE                          # MIT
README.md                        # English: what, layout, prerequisites per platform, build/run
crates/
├── xora-media/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs               # cfg(target_os) module selection
│       ├── windows/mod.rs
│       └── linux/mod.rs
├── xora-core/
│   ├── Cargo.toml               # livekit (+ glib-main-loop on Linux), tokio, xora-media
│   └── src/lib.rs               # one function touching a libwebrtc-backed type (research R8)
├── xora-app/
│   ├── Cargo.toml               # xora-core, eframe, tracing, tracing-subscriber, anyhow
│   └── src/main.rs              # init tracing, call xora-core, print "xora-app <version>"
└── xora-token/
    ├── Cargo.toml               # axum, livekit-api (access-token), tokio, tracing, tracing-subscriber, anyhow
    └── src/main.rs              # init tracing, print "xora-token <version>"
deploy/                          # not created yet (feature 002)
packaging/                       # not created yet (feature 008)
docs/
└── PROJETO.md                   # moved from root
legacy/
├── index.html
├── xorachat-desktop/
├── xorachat-desktop.zip
└── build-appimage.yml           # old .github/workflows/build.yml
.github/workflows/
└── ci.yml                       # windows + linux (debian:13) build and clippy
```

**Structure Decision**: PROJETO.md section 6 layout. `deploy/` and `packaging/` are not created
empty; their features create them.

## Implementation Notes

- Commit order: (1) renames only (`git mv` to `legacy/` and `docs/`) so rename detection is exact;
  (2) workspace and crates; (3) CI; (4) README, LICENSE, constitution 1.0.1.
- `xora-core/Cargo.toml` Linux-only feature:
  `[target.'cfg(target_os = "linux")'.dependencies] livekit = { workspace = true, features = ["glib-main-loop"] }`.
- Linux CI job: install Debian packages from research R4, LLVM 21.1.8 tarball into `/opt/llvm`,
  export `CC`/`CXX`, `rustup` with the pinned toolchain, then `Swatinem/rust-cache@v2`.
- Windows CI job: `rustup toolchain install`, `Swatinem/rust-cache@v2`.
- Pin third-party actions by version tag at minimum.

## Complexity Tracking

No violations.
