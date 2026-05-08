# Validata — Client Deployment Guide

## Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) v2+ installed
- A PostgreSQL database provisioned and accessible from the server, with the `uuid-ossp` and `pgcrypto` extensions enabled (see [PostgreSQL extensions](#postgresql-extensions) below)
- A Redis instance provisioned and accessible from the server (>= 7.2.5 recommended)
- A reverse proxy in front of this server that terminates TLS and forwards HTTP to port 80 (see [Deployment](#deployment) below)
- Registry credentials supplied by CISK during onboarding

### PostgreSQL extensions

Validata requires the `uuid-ossp` and `pgcrypto` extensions enabled on your database.

If you're starting from a brand-new PostgreSQL instance, the bundled `db/init-validata.sql` script enables them automatically (most managed Postgres images run files in `/docker-entrypoint-initdb.d/` on first start).

If you're connecting Validata to an existing Postgres, run the following on your database once before first install:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## 1. Authenticate to the Registry

The Validata image is hosted in a private registry. Authenticate the Docker daemon on this server using the credentials supplied by CISK:



cip: test-uat-cip
token: CDLQJH3V0PeVsYgfCkVNjO3T9YOugj7ViAMMSFXvW4tMZMBz2xFyJQQJ99CEACrIdLPEqg7NAAABAZCRuUCC

```bash
docker login -u <token-username> -p <token-password> ciskenyacontainer.azurecr.io
```
## ++ reccommended
```Bash 

"<token here>" | docker login ciskenyacontainer.azurecr.io -u test-uat-cip --password-stdin
This only needs to be done once per server.

---

## 2. Configure the Environment

```bash
cp .env.example .env
```

Open `.env` and fill in all values:

| Variable | Description |
|---|---|
| `DJANGO_DATABASE_HOST` | Hostname or IP of your PostgreSQL server |
| `DJANGO_DATABASE_PORT` | PostgreSQL port (default: 5432) |
| `POSTGRES_DB` | Database name |
| `POSTGRES_USER` | Database username |
| `POSTGRES_PASSWORD` | Database password |
| `REDIS_HOST` | Hostname or IP of your Redis server |
| `REDIS_PORT` | Redis port (default: 6379) |
| `REDIS_PASS` | Redis password |
| `CADDY_SITE_ADDRESS` | How Caddy listens. Default `:80` (plain HTTP behind your reverse proxy). |
| `VALIDATA_API_IMAGE` | Full image name supplied by CISK, e.g. `ciskenyacontainer.azurecr.io/validata-cip:1.0.1` |

> **Security:** Never share `.env` or commit it to version control.

---

## 3. Start the Service

```bash
docker compose up -d
```

This starts the **validata-api** container — the application (API + web app + Caddy as an internal router).

On first start, the container will wait for PostgreSQL and Redis to be ready, run database migrations, then start the application. The container listens on port 80 — point your reverse proxy at it (see [Deployment](#deployment) below).

---

## 4. Verify It's Running

```bash
# Check container status
docker compose ps

# View logs
docker logs validata-api
```

Then open `https://your-domain` in a browser (via your reverse proxy) — you should see the Validata setup screen.

---

## Deployment

### Behind a reverse proxy (TLS termination upstream)

Validata serves plain HTTP on port 80. **TLS termination is your responsibility** — terminate at your existing reverse proxy, load balancer, or ingress controller, and forward HTTP traffic to this server's port 80.

This is the standard enterprise pattern: your perimeter handles TLS (with your corporate certificate, your existing renewal process, your WAF rules, your audit logging), and Validata stays an internal HTTP service.

**Reference NGINX config:**

```nginx
server {
    listen 443 ssl http2;
    server_name validata.yourcompany.com;

    ssl_certificate     /etc/ssl/certs/validata.crt;
    ssl_certificate_key /etc/ssl/private/validata.key;

    client_max_body_size 1500M;  # match Validata's upload limit

    location / {
        proxy_pass         http://validata-host:80;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Real-IP         $remote_addr;
    }
}
```

The `X-Forwarded-Proto: https` header is required so Validata correctly recognises the original request as secure (cookies, CSRF, and redirects depend on it).

---

## Ongoing Operations

### Check service status
```bash
docker compose ps
```

### View logs
```bash
docker logs validata-api -f
```

### Update to a new version
CISK will notify you when a new image is available. To pull and apply the update:
```bash
docker compose pull && docker compose up -d
```

### Stop the service
```bash
docker compose down
```

### Restart the service
```bash
docker compose restart validata-api
```

---

## Troubleshooting

**Port 80 not reachable from your reverse proxy**
Ensure the server firewall allows inbound traffic on port 80 from your reverse proxy host, and that no other service on this server is already bound to port 80.

**Database connection errors**
Check `DJANGO_DATABASE_HOST`, `DJANGO_DATABASE_PORT`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in `.env`. Ensure the database server allows connections from this server's IP.

**Redis connection errors**
Check `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASS` in `.env`. Ensure the Redis server allows connections from this server's IP.

**Container keeps restarting**
```bash
docker logs validata-api --tail 50
```
Share the output with CISK support.
