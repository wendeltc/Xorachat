---

description: "Task list for feature 001-workspace-foundation"
---

# Tasks: Workspace Foundation

**Input**: Design documents from `/specs/001-workspace-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: None. Constitution Principle III forbids test tasks during the MVP; each story is
validated manually through [quickstart.md](quickstart.md).

**Organization**: Tasks are grouped by user story. Commit after each phase with Conventional
Commits. All code, comments, README and commit messages in English; comments only for a
non-obvious "why".

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 build from fresh clone, US2 CI, US3 legacy preserved

---

## Phase 1: Setup (renames only)

**Purpose**: Clear the repository root and keep Git history. This phase is a renames-only commit
so `git log --follow` works (research R9).

- [ ] T001 Move the previous app with `git mv index.html xorachat-desktop xorachat-desktop.zip legacy/` (creates `legacy/`)
- [ ] T002 Move the AppImage workflow with `git mv .github/workflows/build.yml legacy/build-appimage.yml`, which disables it
- [ ] T003 Move the project document with `git mv PROJETO.md docs/PROJETO.md` (creates `docs/`)
- [ ] T004 Commit only the renames from T001–T003: `chore: move legacy app to legacy/ and project doc to docs/`; confirm `git show --stat HEAD` lists only renames (100% similarity)

---

## Phase 2: Foundational (workspace root)

**Purpose**: Workspace-level files every crate depends on.

**⚠️ CRITICAL**: No crate can build until this phase is complete.

- [ ] T005 Create `Cargo.toml` at the repository root: `[workspace]` with `members = ["crates/*"]` and `resolver = "3"`; `[workspace.package]` with `version = "0.1.0"`, `edition = "2024"`, `license = "MIT"`, `repository = "https://github.com/wendeltc/Xorachat"`; `[workspace.dependencies]` with `xora-media = { path = "crates/xora-media" }`, `xora-core = { path = "crates/xora-core" }`, `livekit = "0.9.4"`, `livekit-api = { version = "0.8.2", default-features = false, features = ["access-token"] }`, `eframe = "0.36.2"`, `axum = "0.8.9"`, `tokio = { version = "1", features = ["rt-multi-thread", "macros"] }`, `tracing = "0.1"`, `tracing-subscriber = { version = "0.3", features = ["env-filter"] }`, `anyhow = "1"`, `thiserror = "2"` (versions from research R2)
- [ ] T006 [P] Create `rust-toolchain.toml` with `[toolchain] channel = "1.97.1"`, `profile = "default"` (research R1)
- [ ] T007 [P] Create `.cargo/config.toml` with `[target.x86_64-pc-windows-msvc] rustflags = ["-C", "target-feature=+crt-static"]` and a one-line comment saying libwebrtc requires the static CRT (research R3)
- [ ] T008 [P] Create `.gitignore` containing `/target`
- [ ] T009 [P] Create `LICENSE` with the MIT license text, copyright "Xorachat contributors", year 2026

**Checkpoint**: Workspace root ready; commit `build: add cargo workspace root`.

---

## Phase 3: User Story 1 - Build the new project from a fresh clone (Priority: P1) 🎯 MVP

**Goal**: Four crates build on Windows, Debian 13 and Fedora; both binaries print name and version
0.1.0 and exit 0 ([contracts/cli.md](contracts/cli.md)).

**Independent Test**: quickstart.md sections 1–4.

- [ ] T010 [P] [US1] Create `crates/xora-media/Cargo.toml` (`name = "xora-media"`, `version.workspace`, `edition.workspace`, `license.workspace`, `repository.workspace`, no dependencies) and `crates/xora-media/src/lib.rs` declaring `#[cfg(target_os = "windows")] mod windows;` and `#[cfg(target_os = "linux")] mod linux;`, with empty `crates/xora-media/src/windows/mod.rs` and `crates/xora-media/src/linux/mod.rs`
- [ ] T011 [US1] Create `crates/xora-core/Cargo.toml` with workspace package fields, dependencies `xora-media.workspace = true`, `livekit.workspace = true`, `tokio.workspace = true`, plus `[target.'cfg(target_os = "linux")'.dependencies] livekit = { workspace = true, features = ["glib-main-loop"] }`; no UI crates (data-model.md validation rules)
- [ ] T012 [US1] Create `crates/xora-core/src/lib.rs` with one public function `pub fn init_webrtc()` that creates `livekit::webrtc::audio_source::native::NativeAudioSource::new(livekit::webrtc::audio_source::AudioSourceOptions::default(), 48_000, 1, 100)` and drops it; this calls into the native libwebrtc via FFI, so libwebrtc is linked into every binary that calls it (research R8)
- [ ] T013 [US1] Create `crates/xora-app/Cargo.toml` (workspace package fields; dependencies `xora-core`, `eframe`, `tracing`, `tracing-subscriber`, `anyhow`, all `.workspace = true`) and `crates/xora-app/src/main.rs`: `fn main() -> anyhow::Result<()>` that initializes `tracing_subscriber` with `EnvFilter::from_default_env()`, calls `xora_core::init_webrtc()`, prints `xora-app {CARGO_PKG_VERSION}` and returns `Ok(())`
- [ ] T014 [P] [US1] Create `crates/xora-token/Cargo.toml` (workspace package fields; dependencies `axum`, `livekit-api`, `tokio`, `tracing`, `tracing-subscriber`, `anyhow`, all `.workspace = true`; no dependency on other xora crates) and `crates/xora-token/src/main.rs`: `#[tokio::main] async fn main() -> anyhow::Result<()>` that initializes `tracing_subscriber` like T013 and prints `xora-token {CARGO_PKG_VERSION}`
- [ ] T015 [US1] Run `cargo generate-lockfile` at the repository root and keep `Cargo.lock` under version control (needed by `--locked` in CI)
- [ ] T016 [US1] Rewrite `README.md` in English: one-paragraph description of Xorachat (from docs/PROJETO.md section 1), repository layout (crates/, docs/, legacy/), prerequisites for Windows (Visual Studio Build Tools with C++ workload, rustup), Debian 13 and Fedora (package lists from research R4, LLVM 21 tarball steps with `CC`/`CXX` exports, note that Fedora 43+ can use the distro clang), build command `cargo build --workspace`, run commands `cargo run -p xora-app` / `cargo run -p xora-token`, and a warning that the first build downloads prebuilt libwebrtc
- [ ] T017 [US1] On Linux, follow quickstart.md sections 1–4 (`cargo build --workspace --locked`, run both binaries, version grep, `cargo clippy --workspace --all-targets --locked -- -D warnings`) and fix any failure in the files above

**Checkpoint**: US1 complete; commit `feat: add rust workspace with xora crates`.

---

## Phase 4: User Story 2 - Automatic build check on every change (Priority: P2)

**Goal**: CI builds and lints on Windows and Debian 13 for every PR and push to main
([contracts/ci.md](contracts/ci.md)).

**Independent Test**: quickstart.md section 5.

- [ ] T018 [US2] Create `.github/workflows/ci.yml` (workflow `CI`, triggers `pull_request` on `main` and `push` on `main`, `env: CARGO_TERM_COLOR: always`) with job `windows` on `windows-latest`: `actions/checkout@v4`, a step running `rustup toolchain install` (installs the toolchain from rust-toolchain.toml explicitly instead of relying on rustup auto-install), `Swatinem/rust-cache@v2`, `cargo build --workspace --locked`, `cargo clippy --workspace --all-targets --locked -- -D warnings`
- [ ] T019 [US2] Add job `linux` to `.github/workflows/ci.yml` on `ubuntu-latest` with `container: debian:13`: `apt-get update && apt-get install -y` the Debian packages from research R4; download LLVM 21.1.8 (`https://github.com/llvm/llvm-project/releases/download/llvmorg-21.1.8/LLVM-21.1.8-Linux-X64.tar.xz`) into `/opt/llvm` with `tar -xJ --strip-components=1`, append `CC=/opt/llvm/bin/clang` and `CXX=/opt/llvm/bin/clang++` to `$GITHUB_ENV` with a one-line comment that webrtc-sys needs clang 21+; install rustup (`curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain none`) and add `$HOME/.cargo/bin` to `$GITHUB_PATH`; then `actions/checkout@v4`, `rustup toolchain install`, `Swatinem/rust-cache@v2`, build and clippy as in T018
- [ ] T020 [US2] Push the branch, open the PR to `main`, and iterate on `.github/workflows/ci.yml` until both `windows` and `linux` jobs pass; note the warm-cache duration of each job against SC-004 (30 minutes)
- [ ] T021 [US2] Negative check from quickstart.md section 5, locally only (no extra PR on the shared repository): add `let unused = 1;` to `main` in `crates/xora-app/src/main.rs`, run `cargo clippy --workspace --all-targets --locked -- -D warnings`, confirm it fails, then revert with `git checkout -- crates/xora-app/src/main.rs`

**Checkpoint**: US2 complete; commit `ci: build and lint workspace on windows and debian`.

---

## Phase 5: User Story 3 - Legacy app preserved as reference (Priority: P3)

**Goal**: Legacy files reachable with history, `docs/PROJETO.md` is the referenced location,
AppImage pipeline inactive.

**Independent Test**: quickstart.md section 6.

- [ ] T022 [US3] Amend `.specify/memory/constitution.md` to version 1.0.1: preamble points to `docs/PROJETO.md` instead of the root, `Last Amended` stays 2026-10-11, prepend a Sync Impact Report comment (1.0.0 → 1.0.1, PATCH, path change only)
- [ ] T023 [P] [US3] Search the repository (`grep -rn "PROJETO.md\|index.html\|xorachat-desktop" --exclude-dir=legacy --exclude-dir=target --exclude-dir=.git`) and update any reference that still points to the old root locations, except historical text inside `specs/001-workspace-foundation/`
- [ ] T024 [US3] Follow quickstart.md section 6 (`ls legacy/`, `git log --follow --oneline legacy/index.html`, `ls docs/PROJETO.md`, `ls .github/workflows/`) and confirm the expected results

**Checkpoint**: US3 complete; commit `docs: point constitution to docs/PROJETO.md`.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 Windows manual check: on a Windows 10/11 machine follow quickstart.md sections 1–2 and fix README prerequisites in `README.md` if anything was missing
- [ ] T026 Fedora manual check (clarification 2026-10-11): fresh clone build on Fedora following `README.md`; record Fedora release and result in the PR description
- [ ] T027 Review all new files for comments that restate code and remove them (constitution Principle II); final `cargo clippy --workspace --all-targets --locked -- -D warnings`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: first; renames must be committed alone.
- **Foundational (Phase 2)**: after Setup; blocks all crate work.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1 (CI needs a buildable workspace and `Cargo.lock`).
- **US3 (Phase 5)**: after Setup only; can run in parallel with Phases 2–4.
- **Polish (Phase 6)**: after US1–US3.

### Within User Story 1

- T010 → T011 → T012 → T013 (core depends on media, app depends on core).
- T014 independent of T010–T013.
- T015 after T010–T014; T016 any time; T017 last.

### Parallel Opportunities

- T006, T007, T008, T009 together.
- T010 and T014 together.
- T022/T023 (US3) alongside Phases 2–4.

## Parallel Example: User Story 1

```text
Task: "T010 Create crates/xora-media (Cargo.toml, lib.rs, windows/, linux/)"
Task: "T014 Create crates/xora-token (Cargo.toml, main.rs)"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 renames commit.
2. Phase 2 workspace root.
3. Phase 3 crates + README; validate locally with quickstart 1–4.
4. Stop and validate: both binaries print `0.1.0`.

### Incremental Delivery

1. US1 → local build proven.
2. US2 → PR opened, CI green on Windows and Linux.
3. US3 → constitution and references updated.
4. Polish → Windows and Fedora manual checks recorded in the PR.

## Notes

- No test tasks (constitution Principle III).
- One PR for the whole feature (Principle IV).
- `thiserror` stays only in `[workspace.dependencies]` until a crate defines an error type.
