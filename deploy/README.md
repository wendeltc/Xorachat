# Xorachat server deployment

One VM runs three services with Docker Compose:

- **caddy**: HTTPS certificates and routing on port 443 (`livekit/caddyl4`)
- **livekit**: media server (SFU) with embedded TURN (`livekit/livekit-server`)
- **xora-token**: checks the invite code and issues room tokens (built from this repository)

The guide targets Oracle Cloud Always Free (Ampere A1, ARM64). Any Linux VM with a public IP works.

## 1. Domain names (DuckDNS)

1. Sign in at <https://www.duckdns.org>.
2. Create two subdomains, for example `xora` and `xora-turn`. They become `xora.duckdns.org`
   (token service and signaling) and `xora-turn.duckdns.org` (TURN).
3. After the VM exists (step 2), type its public IP in the `current ip` field of both subdomains
   and click "update ip".

The public IP of an Oracle instance only changes if the instance is recreated. In that case, update
both subdomains again.

## 2. Virtual machine (Oracle Cloud Always Free)

1. Create an account at <https://cloud.oracle.com> and pick **Brazil East (São Paulo)** as home
   region. Always Free resources only exist in the home region.
2. Create a compute instance: shape **VM.Standard.A1.Flex** (up to 2 OCPUs and 12 GB), image
   **Canonical Ubuntu 24.04** (aarch64), with a public IPv4 address and your SSH key.
3. Open the ports in the instance's VCN: *Networking → Virtual cloud networks → your VCN →
   Security Lists → Default → Add Ingress Rules*, source `0.0.0.0/0`:

   | Protocol | Ports | Purpose |
   |---|---|---|
   | TCP | 80 | certificate issuance |
   | TCP | 443 | HTTPS and TURN/TLS |
   | TCP | 7881 | WebRTC over TCP |
   | UDP | 3478 | TURN/UDP |
   | UDP | 50000-60000 | WebRTC over UDP |

4. Oracle's Ubuntu images also block traffic in the instance firewall. On the VM:

   ```bash
   sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443,7881 -j ACCEPT
   sudo iptables -I INPUT 6 -p udp --dport 3478 -j ACCEPT
   sudo iptables -I INPUT 6 -p udp --dport 50000:60000 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 3. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out and back in so the `docker` group applies.

## 4. Configuration

```bash
git clone https://github.com/wendeltc/Xorachat.git
cd Xorachat/deploy
cp .env.example .env
```

Edit `.env`:

| Variable | Value |
|---|---|
| `XORA_DOMAIN` | main subdomain, e.g. `xora.duckdns.org` |
| `XORA_TURN_DOMAIN` | TURN subdomain, e.g. `xora-turn.duckdns.org` |
| `LIVEKIT_API_KEY` | any identifier, e.g. `xora` |
| `LIVEKIT_API_SECRET` | at least 32 characters: `openssl rand -base64 32` |
| `XORA_INVITE_CODE` | the code friends type to join |

`.env` is ignored by Git. Never commit it.

## 5. Start

```bash
docker compose up -d --build
```

The first run builds `xora-token` on the VM (a few minutes on ARM) and Caddy requests the
certificates. Containers restart on their own after a reboot.

## 6. Check

From any machine:

```bash
curl https://xora.duckdns.org/health
```

Expected: `{"status":"ok"}`. If it fails, look at `docker compose logs caddy`: certificate errors
usually mean the DuckDNS IP or ports 80/443 are wrong.

## Rotate the invite code

Edit `XORA_INVITE_CODE` in `.env`, then:

```bash
docker compose up -d xora-token
```

Only new joins are affected; calls in progress continue.

## Update

```bash
git pull
docker compose up -d --build
```

## Logs and stop

```bash
docker compose logs -f livekit
docker compose down
```

## Idle reclamation

Oracle may reclaim Always Free instances that stay idle (CPU, network and memory under 20% for 7
days). If that happens, create a new instance (step 2), update DuckDNS (step 1) and repeat steps 3–5
with the same `.env` values. Keep a private copy of `.env`.
