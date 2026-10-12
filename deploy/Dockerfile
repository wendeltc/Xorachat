FROM rust:1.97.1-slim-trixie AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p xora-token

FROM debian:13-slim
COPY --from=build /src/target/release/xora-token /usr/local/bin/xora-token
USER nobody
ENTRYPOINT ["xora-token"]
