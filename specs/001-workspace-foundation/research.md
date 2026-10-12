# Research: Workspace Foundation

Sources checked on 2026-10-11: crates.io API, `livekit/rust-sdks` repository (`rust-toolchain.toml`,
`.cargo/config.toml`, `.github/workflows/tests.yml`, `.github/scripts/install-clang.sh`),
Rust stable channel manifest.

## R1. Rust toolchain

- **Decision**: pin `channel = "1.97.1"` in `rust-toolchain.toml` (profile `default`, which includes
  clippy and rustfmt).
- **Rationale**: it is the exact toolchain the `livekit/rust-sdks` repository pins for the 0.9.x
  line. `eframe` 0.36 requires Rust 1.95, `axum` 0.8 requires 1.80, edition 2024 requires 1.85, so
  1.97.1 satisfies all of them.
- **CI**: both jobs run `rustup toolchain install` (no arguments, reads `rust-toolchain.toml`) before
  any cargo command, so the build does not depend on rustup's auto-install behavior.
- **Alternatives**: current stable 1.99.0 (2026-09-28) — newer than what the SDK is validated with,
  no benefit for this feature; floating `stable` — breaks reproducible builds.

## R2. Exact crate versions

| Crate | Version | Notes |
|---|---|---|
| `livekit` | 0.9.4 | default features `["native"]`; feature `glib-main-loop` → `libwebrtc/glib-main-loop` |
| `livekit-api` | 0.8.2 | use `default-features = false, features = ["access-token"]` |
| `eframe` | 0.36.2 | rust-version 1.95 |
| `axum` | 0.8.9 | |
| `tokio` | 1.x | `rt-multi-thread`, `macros` |
| `tracing`, `tracing-subscriber` | 0.1, 0.3 | |
| `anyhow`, `thiserror` | 1.x, 2.x | |

- **Decision on `livekit-api` features**: only `access-token` is needed to sign tokens. The default
  `services` feature pulls `reqwest` without a TLS backend selected, which adds weight for nothing.
- **Decision on `glib-main-loop`**: enable it only for Linux through a target-specific dependency
  entry in `xora-core`, as PROJETO.md 5.1 requires for desktop capture on Linux.
- **Decision on `thiserror`**: declared in `[workspace.dependencies]` but added to a crate only when
  that crate defines its first error type (Principle VII, no unused dependencies).

## R3. Required rustflags

- **Decision**: `.cargo/config.toml` with
  `[target.x86_64-pc-windows-msvc] rustflags = ["-C", "target-feature=+crt-static"]`.
- **Rationale**: copied from the SDK's own `.cargo/config.toml`; libwebrtc is built with the static
  CRT on Windows and fails to link otherwise. The aarch64 Linux `lld` flag and macOS `-ObjC` flags
  are not needed (targets are x86_64 Windows and Linux only).

## R4. Linux compiler and system dependencies

- **Decision**: install LLVM 21.1.8 from the official release tarball and export `CC`/`CXX` to it,
  following `install-clang.sh` from the SDK.
- **Rationale**: `webrtc-sys` compiles against the hermetic libc++ shipped in the libwebrtc artifact
  and its `build.rs` rejects GCC and clang older than 21. Neither Debian 13 (clang 19) nor Fedora's
  older releases are guaranteed to ship 21, so the tarball is the portable path. Fedora 43+ ships
  clang 21 in its repositories and can use it directly.
- **System packages (Debian names)**: `build-essential pkg-config curl xz-utils ca-certificates git
  libasound2-dev libssl-dev libx11-dev libgl1-mesa-dev libxext-dev libdrm-dev
  libgbm-dev libxfixes-dev libxdamage-dev libxrandr-dev libxcomposite-dev libglib2.0-dev
  libpipewire-0.3-dev`.
- **Not installed now**: `libva-dev` and CUDA headers (only for hardware encoding, PROJETO.md 8.1).
- **Fedora equivalents** (documented in README): `gcc gcc-c++ pkgconf-pkg-config
  alsa-lib-devel openssl-devel libX11-devel mesa-libGL-devel libXext-devel libdrm-devel
  mesa-libgbm-devel libXfixes-devel libXdamage-devel libXrandr-devel libXcomposite-devel
  glib2-devel pipewire-devel clang`.

## R5. Linux CI environment "compatible with Debian stable"

- **Decision**: Linux job runs on `ubuntu-latest` inside the container `debian:13` (trixie, current
  Debian stable).
- **Rationale**: Principle X requires the Linux binary to be built on Debian stable; a container is
  the literal match and keeps glibc at the oldest supported baseline so the binary also runs on
  Fedora. Rust is installed with `rustup` inside the container (reads `rust-toolchain.toml`).
- **Alternatives**: plain `ubuntu-24.04` runner — glibc 2.39 is older than Debian 13's 2.41, so it
  would also work, but it does not validate the Debian package names that the README documents.

## R6. Windows CI environment

- **Decision**: `windows-latest` with the MSVC toolchain from `rust-toolchain.toml`; no protoc.
- **Rationale**: `livekit-protocol` ships pre-generated protobuf code and has no `build.rs`; the only
  build scripts in the dependency chain (`livekit`, `webrtc-sys`, `yuv-sys`) do not call protoc. The
  SDK's CI installs protoc for `livekit-ffi`, which Xorachat does not use. PROJETO.md 5.3 lists
  protoc because it copies the SDK CI list. Checked against `livekit/rust-sdks` main on 2026-10-11;
  if a build fails asking for `protoc`, add it back on both platforms with the same version.

## R7. CI caching and steps

- **Decision**: `Swatinem/rust-cache@v2` keyed per OS, then `cargo build --workspace --locked` and
  `cargo clippy --workspace --all-targets --locked -- -D warnings`. Triggers: `pull_request` to
  `main` and `push` to `main`. No secrets used, so fork PRs work.
- **Rationale**: `cargo build` is needed to validate the libwebrtc link (clippy does not link);
  rust-cache covers registry and `target/` with one action, simpler than two `actions/cache` steps
  or sccache for a project this size.
- **Alternatives**: sccache as in the SDK CI — more moving parts, only worth it if cache misses
  push builds past the 30-minute target (SC-004).

## R8. Forcing libwebrtc to link in this feature

- **Decision**: `xora-core` exposes one small function that touches a libwebrtc-backed SDK type, and
  `xora-app` calls it at startup before printing its version.
- **Rationale**: a dependency that is declared but never referenced is compiled but not linked, so
  link-time failures (CRT mismatch, missing system libraries) would only appear in feature 003.
- **Symbol**: `livekit::webrtc::audio_source::native::NativeAudioSource::new(AudioSourceOptions::default(),
  48_000, 1, 100)`. Its constructor calls `new_audio_track_source` in `webrtc-sys` over FFI, needs no
  async runtime and no network, and `queue_size_ms` 100 satisfies the multiple-of-10 assertion.
  `xora-app` calls it from `main` so the call is never optimized away as unreachable.

## R9. Legacy move

- **Decision**: `git mv index.html xorachat-desktop xorachat-desktop.zip legacy/` and
  `git mv .github/workflows/build.yml legacy/build-appimage.yml`, in a commit that contains only
  renames so Git rename detection keeps `git log --follow` working.
- **Rationale**: FR-009 and SC-005. Moving the workflow out of `.github/workflows/` disables it.
