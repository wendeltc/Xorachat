# Quickstart: Workspace Foundation validation

Manual validation (constitution Principle III). Prerequisites per platform are in the root
`README.md`; this guide only lists what to check.

## 1. Fresh clone builds (US1)

On each of Windows 10/11, Debian 13 and Fedora:

```bash
git clone https://github.com/wendeltc/Xorachat.git && cd Xorachat
git switch 001-workspace-foundation
cargo build --workspace --locked
```

Expected: build finishes without errors. The first build downloads prebuilt libwebrtc and takes
several minutes.

Fedora is not covered by CI: record the Fedora release and the build result in the PR description.

## 2. Binaries start and exit (US1)

```bash
cargo run -q -p xora-app
cargo run -q -p xora-token
```

Expected, matching [contracts/cli.md](contracts/cli.md):

```text
xora-app 0.1.0
xora-token 0.1.0
```

and exit status `0` (`echo $?` on Linux, `echo $LASTEXITCODE` on PowerShell).

## 3. Version defined once (FR-003)

```bash
grep -rn 'version = "0.1.0"' --include Cargo.toml .
```

Expected: only the root `Cargo.toml`; every crate uses `version.workspace = true`.

## 4. Lint clean

```bash
cargo clippy --workspace --all-targets --locked -- -D warnings
```

Expected: no warnings.

## 5. CI (US2)

- Open the PR for this branch: jobs `windows` and `linux` run and pass
  ([contracts/ci.md](contracts/ci.md)).
- Negative check, local only: add `let unused = 1;` to `main` in `crates/xora-app/src/main.rs`, run
  `cargo clippy --workspace --all-targets --locked -- -D warnings` and confirm it fails; the CI job
  runs the same command, so it fails the same way. Revert with
  `git checkout -- crates/xora-app/src/main.rs`.

## 6. Legacy preserved (US3)

```bash
ls legacy/
git log --follow --oneline legacy/index.html | tail -3
ls docs/PROJETO.md
ls .github/workflows/
```

Expected: `legacy/` holds `index.html`, `xorachat-desktop/`, `xorachat-desktop.zip`,
`build-appimage.yml`; the log shows commits from before the move; `docs/PROJETO.md` exists;
`.github/workflows/` contains only `ci.yml`.
