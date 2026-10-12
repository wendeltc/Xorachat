# Data Model: Workspace Foundation

No runtime data is stored. The "entities" are the workspace components and their build metadata.

## Component

| Name | Kind | Depends on | Role |
|---|---|---|---|
| `xora-media` | library | — | OS-specific capture (`src/windows/`, `src/linux/` behind `cfg(target_os)`) |
| `xora-core` | library | `xora-media`, `livekit`, `tokio` | Session and room logic, no UI |
| `xora-app` | binary | `xora-core`, `eframe` | Desktop program |
| `xora-token` | binary | `axum`, `livekit-api`, `tokio` | Server program issuing room tokens |

Validation rules:

- `xora-token` MUST NOT depend on `xora-app`, `xora-core` or `xora-media`.
- `xora-core` MUST NOT depend on `eframe`/`egui` or any UI crate.
- Every component sets `version.workspace = true`, `edition.workspace = true`,
  `license.workspace = true`, `repository.workspace = true`.

## Project version

- Single field `[workspace.package] version = "0.1.0"` in the root `Cargo.toml`.
- Read at runtime through `env!("CARGO_PKG_VERSION")`.

## Build pipeline

| Job | Runner | Environment | Steps |
|---|---|---|---|
| `windows` | `windows-latest` | MSVC | build, clippy |
| `linux` | `ubuntu-latest` | container `debian:13`, LLVM 21.1.8, Debian packages from research R4 | build, clippy |

State per run: `queued → running → passed | failed`, reported as a required check on the PR.
