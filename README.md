# Xorachat

Xorachat is a lightweight native desktop app for voice chat, text chat and screen sharing with
system audio among a small group of friends. It is written in Rust on top of the LiveKit SDK and
talks to a self-hosted LiveKit SFU. The full project document (in Portuguese) is
[docs/PROJETO.md](docs/PROJETO.md).

Status: early development, version 0.1.0. The previous Electron + PeerJS app lives in
[legacy/](legacy/) as a behavior reference.

## Repository layout

```text
crates/
  xora-core/    session, room state and events (no UI)
  xora-media/   screen and system audio capture, per OS
  xora-app/     desktop app binary
  xora-token/   server binary that issues room tokens
docs/           project document
legacy/         previous web and Electron app
specs/          feature specifications (Spec Kit)
```

## Prerequisites

All platforms need [rustup](https://rustup.rs). The toolchain version is pinned in
`rust-toolchain.toml` and installed with:

```bash
rustup toolchain install
```

The first build downloads a prebuilt libwebrtc (several hundred MB) and takes several minutes.

### Windows 10/11

- Visual Studio 2022 Build Tools with the "Desktop development with C++" workload.

### Debian 13

```bash
sudo apt-get install -y build-essential pkg-config curl xz-utils ca-certificates git \
  libasound2-dev libssl-dev libx11-dev libgl1-mesa-dev libxext-dev libdrm-dev libgbm-dev \
  libxfixes-dev libxdamage-dev libxrandr-dev libxcomposite-dev libglib2.0-dev libpipewire-0.3-dev
```

libwebrtc requires clang 21 or newer, and Debian 13 ships clang 19. Install the official LLVM
release and point the build at it:

```bash
mkdir -p ~/.local/llvm-21
curl -fsSL https://github.com/llvm/llvm-project/releases/download/llvmorg-21.1.8/LLVM-21.1.8-Linux-X64.tar.xz \
  | tar -xJ --strip-components=1 -C ~/.local/llvm-21
export CC=~/.local/llvm-21/bin/clang CXX=~/.local/llvm-21/bin/clang++
```

### Fedora

```bash
sudo dnf install -y gcc gcc-c++ pkgconf-pkg-config alsa-lib-devel openssl-devel libX11-devel \
  mesa-libGL-devel libXext-devel libdrm-devel mesa-libgbm-devel libXfixes-devel libXdamage-devel \
  libXrandr-devel libXcomposite-devel glib2-devel pipewire-devel clang
clang --version
```

Fedora 43 and newer ship clang 21 or later; export `CC=clang CXX=clang++`. On older releases use
the LLVM release tarball as described for Debian.

## Build and run

```bash
cargo build --workspace
cargo run -p xora-app
cargo run -p xora-token
```

Each binary currently prints its name and version and exits.

## Server

The token service and the media server run on one VM with Docker Compose. See
[deploy/README.md](deploy/README.md).

## License

[MIT](LICENSE)
