# Contract: CI pipeline

File: `.github/workflows/ci.yml`, workflow name `CI`.

## Triggers

- `pull_request` with base `main`
- `push` to `main`

## Jobs

| Job id | Runs on | Container |
|---|---|---|
| `windows` | `windows-latest` | — |
| `linux` | `ubuntu-latest` | `debian:13` |

Both jobs run, in order:

1. `cargo build --workspace --locked`
2. `cargo clippy --workspace --all-targets --locked -- -D warnings`

## Guarantees

- No repository secrets are read; pull requests from forks run the same jobs.
- A failure in either command fails the job and the check shown on the PR.
- The job names `windows` and `linux` are stable, so they can be marked as required checks.
