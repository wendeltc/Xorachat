FROM rust:1.97.1-slim-trixie AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p xora-token \
    && cp target/release/xora-token /usr/local/bin/xora-token

FROM debian:13-slim
COPY --from=build /usr/local/bin/xora-token /usr/local/bin/xora-token
USER nobody
ENTRYPOINT ["xora-token"]
