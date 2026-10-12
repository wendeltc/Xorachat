# Contract: Binary startup (feature 001)

Applies to `xora-app` and `xora-token` until later features give them real behavior.

## Invocation

```text
xora-app
xora-token
```

No arguments, no environment variables required.

## Output

- stdout, one line: `<binary-name> <version>`, for example `xora-app 0.1.0`.
- Logging is initialized with `tracing-subscriber` reading `RUST_LOG`; with `RUST_LOG` unset nothing
  else is printed.

## Exit status

- `0` on success.
- Non-zero only if startup itself fails (for example the SDK cannot initialize); the error is
  printed to stderr through `anyhow`.
