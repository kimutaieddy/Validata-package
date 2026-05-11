# Validata Architecture & System Design

**Document Version:** 1.0  
**Last Updated:** May 11, 2026

Comprehensive guide to the Validata deployment architecture, system design, data flow, and component interactions.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Container Services](#container-services)
- [Networking Architecture](#networking-architecture)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Storage & Persistence](#storage--persistence)
- [Component Interactions](#component-interactions)
- [Request/Response Lifecycle](#requestresponse-lifecycle)
- [Service Dependencies](#service-dependencies)
- [Scalability Considerations](#scalability-considerations)
- [Performance Characteristics](#performance-characteristics)

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                  EXTERNAL USERS                          │
│           (Browsers, REST Clients, Devices)              │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTP/HTTPS
                     │ Port 8080
                     ▼
┌────────────────────────────────────────────────────────┐
│            PUBLIC INTERFACE LAYER                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │    Nginx Reverse Proxy (validata-nginx)          │  │
│  │  • SSL/TLS Termination                           │  │
│  │  • Static Content Serving (Blazor WASM)          │  │
│  │  • Request Routing (/v1/*)                       │  │
│  │  • Load Distribution                              │  │
│  │  • Response Caching                              │  │
│  │  • Request/Response Filtering                    │  │
│  └──────────────────────────────────────────────────┘  │
└────┬────────────────────────────────────────────────┬──┘
     │                                                │
     │ Internal Docker Network (172.x.x.x)           │
     │ HTTP Port 9001                                │
     │                                                │
     ▼                                                ▼
┌──────────────────────────┐                  ┌─────────────────────┐
│   APPLICATION LAYER      │                  │  ASSET LAYER        │
│  (Django Backend)        │                  │  (Blazor Frontend)  │
│                          │                  │                     │
│  ┌────────────────────┐  │                  │  ┌───────────────┐  │
│  │ Gunicorn Server    │  │                  │  │ Blazor WASM   │  │
│  │ • Python WSGI     │  │                  │  │ • .NET Runtime │  │
│  │ • 4 Workers       │  │                  │  │ • JavaScript   │  │
│  │ • Port 9001       │  │                  │  │ • CSS          │  │
│  │ • Timeout: 120s   │  │                  │  │ • Static Assets│  │
│  └────────────────────┘  │                  │  └───────────────┘  │
│                          │                  │                     │
│  ┌────────────────────┐  │                  │ From: /app/web      │
│  │ Django Framework   │  │                  │ (Original Image)    │
│  │ • URL Routing      │  │                  │                     │
│  │ • Middleware Stack │  │                  │ Copied to:          │
│  │ • ORM (Models)     │  │                  │ Nginx /app/web      │
│  │ • REST API         │  │                  │                     │
│  │ • Authentication   │  │                  │ Served as:          │
│  │ • Authorization    │  │                  │ http://host:8080/   │
│  └────────────────────┘  │                  │                     │
│                          │                  └─────────────────────┘
│ ┌─────────────────────┐  │
│ │ Validata Modules    │  │
│ │ • CIP Setup         │  │
│ │ • User Management   │  │
│ │ • Data Validation   │  │
│ │ • Template Engine   │  │
│ │ • Import/Export     │  │
│ └─────────────────────┘  │
└──┬───────────────────────┬─────────────────┘
   │                       │
   │                       │ Logs & Media
   │                       │ (Docker Volumes)
   │                       ▼
   │                 ┌──────────────┐
   │                 │ /app/logs    │
   │                 │ /app/media   │
   │                 └──────────────┘
   │
   ├──────────┬─────────────┬─────────────┐
   │          │             │             │
   │ Port:5432│ Port:6379   │ Lookup      │
   │          │             │             │
   ▼          ▼             ▼             ▼
┌────────┐ ┌────────┐  ┌──────────────┐
│PostgreSQL│ Redis  │  │ DNS/Network  │
│ Database │ Cache  │  │ Services     │
│ DB:      │ Session│  │ Gateway      │
│ validata │ Storage│  │ Resolution   │
│          │        │  │              │
└────────┘ └────────┘  └──────────────┘
```

---

## Container Services

### 1. Nginx (validata-nginx)

**Purpose:** Reverse proxy, static content server, request router

**Image:** `nginx:1.27-alpine`  
**Container Name:** `validata-nginx`  
**Exposed Ports:** `8080:80`  
**Internal Ports:** `80`

**Key Features:**
- **Reverse Proxy:** Routes `/v1/*` to Django backend (http://validata-api:9001)
- **Static Content:** Serves Blazor frontend from `/usr/share/nginx/html`
- **Fallback Routing:** Routes unknown URLs to `index.html` (SPA support)
- **Request Headers:** Preserves original client IP, protocol, hostname
- **Upload Support:** Accepts files up to 1500MB (`client_max_body_size: 1500m`)
- **Connection Pooling:** HTTP/1.1 keep-alive connections
- **Proxy Buffering:** Buffers large responses from backend

**Configuration Location:** Built-in via `Dockerfile.nginx` (not external nginx.conf)

**Proxy Rule:**
```nginx
location /v1/ {
    proxy_pass http://validata-api:9001;  # No trailing slash = preserves /v1
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Health:** `docker compose ps` shows `Up`

---

### 2. Django Backend (validata-api)

**Purpose:** Application business logic, API endpoints, data processing

**Image:** `validata-fixed:local` (derived from upstream `validata-cip:1.0.1`)  
**Container Name:** `validata-api`  
**Internal Ports:** `9001` (Gunicorn), `80` (supervisor), `443` (supervisor)  
**Process Manager:** Gunicorn

**Key Features:**
- **Web Server:** Gunicorn WSGI application server
  - 4 worker processes (sync)
  - Timeout: 120 seconds per request
  - Bind address: `0.0.0.0:9001`
  - Auto-restart on crash
  
- **Framework:** Django REST Framework
  - URL routing via `server/urls.py`
  - Middleware stack for authentication, CORS, rate limiting
  - ORM for database queries
  
- **Core Modules:**
  - `authy/` - User authentication and authorization
  - `cip_setup/` - Initial system configuration
  - `core/` - Core models and utilities
  - `data_templates/` - Template management
  - `error_logs/` - Error tracking
  - `permissions/` - Role-based access control
  - `tenants/` - Multi-tenancy support
  - `upload_manager/` - File upload handling
  - `download_manager/` - File download management
  - `stats/` - Analytics and statistics
  - `reports/` - Report generation
  - `notifications/` - Alert and notification system
  - `messenger/` - Internal messaging

- **Database Access:** PostgreSQL via Django ORM
- **Caching:** Redis for sessions, cache framework, task queues
- **Static Files:** Not served by this container (Nginx handles static)

**Startup Command:**
```bash
gunicorn server.wsgi:application \
  --bind 0.0.0.0:9001 \
  --workers 4 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
```

**Health:** Depends on PostgreSQL and Redis being healthy

---

### 3. PostgreSQL (validata-postgres)

**Purpose:** Primary data store for application state

**Image:** `postgres:16-alpine`  
**Container Name:** `validata-postgres`  
**Exposed Ports:** `5432:5432` (accessible from host for debugging)  
**Internal Port:** `5432`

**Key Features:**
- **Database:** Single database named `validata` (configurable via `POSTGRES_DB`)
- **User:** `validata` (default, configurable via `POSTGRES_USER`)
- **Password:** Configurable via `POSTGRES_PASSWORD`
- **Extensions Enabled:**
  - `uuid-ossp` - UUID generation functions
  - `pgcrypto` - Cryptographic functions for passwords/tokens
- **Data Volume:** `validata_postgres_data:/var/lib/postgresql/data`
- **Initialization:** Runs `db/init-validata.sql` on first start
- **Health Check:**
  - Command: `pg_isready -U validata -d validata`
  - Interval: 10 seconds
  - Timeout: 5 seconds
  - Retries: 5 (up to 50s to become healthy)

**Environment Variables:**
```env
POSTGRES_DB=validata
POSTGRES_USER=validata
POSTGRES_PASSWORD=<from .env>
```

**Connection Details:**
- Internal: `postgresql://validata:password@postgres:5432/validata`
- External (host): `postgresql://validata:password@localhost:5432/validata`

---

### 4. Redis (validata-redis)

**Purpose:** In-memory cache and session store

**Image:** `redis:7.2-alpine`  
**Container Name:** `validata-redis`  
**Exposed Ports:** `6379:6379` (accessible from host for debugging)  
**Internal Port:** `6379`

**Key Features:**
- **Persistence:** AOF (Append-Only File) mode enabled
  - Auto-save configuration: `appendonly yes`
  - Data file: `/data/appendonly.aof`
  - RDB base file: `/data/appendonly.aof.1.base.rdb`
  - Incremental file: `/data/appendonly.aof.1.incr.aof`
- **Data Volume:** `validata_redis_data:/data`
- **No Authentication:** Default (no `REDIS_PASS` required in local setup)
- **Health Check:**
  - Command: `redis-cli ping` (expect: PONG)
  - Interval: 10 seconds
  - Timeout: 5 seconds
  - Retries: 5 (up to 50s to become healthy)

**Use Cases:**
- Session storage (Django sessions)
- Cache framework (querysets, pages, functions)
- Task queue (Celery, if configured)
- Real-time data (leaderboards, counters)
- Temporary data (OTP codes, password reset tokens)

**Connection Details:**
- Internal: `redis://redis:6379/0`
- External (host): `redis://localhost:6379/0`
- CLI Access: `docker compose exec redis redis-cli`

---

## Networking Architecture

### Docker Network Model

```
┌─────────────────────────────────────────────────┐
│      Host Machine Network                       │
│      192.168.x.x or 10.x.x.x                    │
└──────────────────┬────────────────────────────┬─┘
                   │                            │
            localhost:8080                localhost:5432
                   │                            │
                   ▼                            ▼
            ┌────────────┐              ┌──────────────┐
            │  :8080     │              │  :5432       │
            │  (Docker)  │              │  (Docker)    │
            └─────┬──────┘              └──────┬───────┘
                  │                           │
                  ▼                           ▼
        ┌──────────────────────────────────────────────┐
        │  Docker Bridge Network (docker-deploy-package)
        │  Subnet: 172.18.0.0/16                       │
        │                                               │
        │  ┌─────────────┐  ┌─────────────┐            │
        │  │ validata-  │  │ validata-    │            │
        │  │ nginx      │  │ postgres     │            │
        │  │ 172.18.0.2 │  │ 172.18.0.3   │            │
        │  └──────┬──────┘  └──────────────┘            │
        │         │                                     │
        │         │ (internal connection)               │
        │         │ http://validata-api:9001            │
        │         ▼                                     │
        │  ┌──────────────────┐  ┌──────────────┐      │
        │  │ validata-api     │  │ validata-    │      │
        │  │ 172.18.0.4       │  │ redis        │      │
        │  │ :9001 (gunicorn) │  │ 172.18.0.5   │      │
        │  └──────────────────┘  └──────────────┘      │
        │                                               │
        └──────────────────────────────────────────────┘
```

### Service Discovery

**Docker Embedded DNS:**
- Services accessible by container name
- `validata-api` resolves to `172.18.0.4` (example)
- `postgres` resolves to `172.18.0.3` (example)
- `redis` resolves to `172.18.0.5` (example)

**Resolution Process:**
1. Application requests connection to `redis:6379`
2. Docker DNS resolver (127.0.0.11:53) intercepts
3. Resolves `redis` to container's IP within bridge network
4. Connection established over Docker bridge

### Port Mapping

| Service | Internal Port | External Port | Protocol | Accessibility |
|---------|---------------|---------------|----------|----------------|
| Nginx | 80 | 8080 | HTTP | Public (8080) |
| Gunicorn | 9001 | N/A | HTTP | Internal only |
| PostgreSQL | 5432 | 5432 | TCP | Host & local network |
| Redis | 6379 | 6379 | TCP | Host & local network |

**Important:** PostgreSQL and Redis ports are exposed for development/debugging. In production, these should not be publicly exposed.

---

## Data Flow Diagrams

### Frontend Request Flow (Static Assets)

```
Browser                          Nginx                Docker Network
  │                                │                        │
  ├─ GET /index.html               │                        │
  │─────────────────────────────────>                       │
  │                                 │                        │
  │                        ┌────────▼────────┐              │
  │                        │ Check location  │              │
  │                        │ /               │              │
  │                        │ (SPA fallback)  │              │
  │                        └────────┬────────┘              │
  │                                 │                        │
  │                        ┌────────▼────────┐              │
  │                        │ Load from       │              │
  │                        │ /usr/share/    │              │
  │                        │ nginx/html/     │              │
  │                        │ index.html      │              │
  │                        └────────┬────────┘              │
  │                                 │                        │
  │                        ┌────────▼────────┐              │
  │                        │ Add Cache-Control
  │                        │ headers         │              │
  │                        └────────┬────────┘              │
  │                                 │                        │
  │  <─ 200 OK + index.html ────────┤                       │
  ├─                                │                        │
  ├─ GET /_framework/blazor... (*.js, *.wasm)              │
  │─────────────────────────────────>                       │
  │                                 │                        │
  │  <─ 200 OK + cached assets ─────┤                       │
  │
  └─ (Browser initializes Blazor WASM runtime)
```

### API Request Flow (POST /v1/cip-setup/)

```
Browser                 Nginx           Django              PostgreSQL    Redis
  │                       │              │                    │             │
  ├─ POST /v1/cip-setup/  │              │                    │             │
  │─────────────────────────>            │                    │             │
  │  with JSON payload     │              │                    │             │
  │                        │              │                    │             │
  │               ┌────────▼────────┐    │                    │             │
  │               │ Route to        │    │                    │             │
  │               │ location /v1/   │    │                    │             │
  │               └────────┬────────┘    │                    │             │
  │                        │              │                    │             │
  │               ┌────────▼────────┐    │                    │             │
  │               │ Proxy to        │    │                    │             │
  │               │ validata-api:   │    │                    │             │
  │               │ 9001            │    │                    │             │
  │               │ (preserve /v1)  │    │                    │             │
  │               └────────┬────────┘    │                    │             │
  │                        │              │                    │             │
  │                        ├─ HTTP Request ──>               │             │
  │                        │  POST /v1/cip-setup/            │             │
  │                        │  Django processes               │             │
  │                        │                  │              │             │
  │                        │           ┌──────▼──────┐       │             │
  │                        │           │ Validate    │       │             │
  │                        │           │ Request     │       │             │
  │                        │           │ Payload     │       │             │
  │                        │           └──────┬──────┘       │             │
  │                        │                  │              │             │
  │                        │           ┌──────▼──────┐       │             │
  │                        │           │ Query DB    │       │             │
  │                        │           │ User exists?│───────>             │
  │                        │           │             │       │             │
  │                        │           └──────┬──────┘       │             │
  │                        │                  │              │             │
  │                        │           ┌──────▼──────┐       │             │
  │                        │           │ Store in    │       │             │
  │                        │           │ Redis       │─────────────────>   │
  │                        │           │ (sessions)  │       │             │
  │                        │           └──────┬──────┘       │             │
  │                        │                  │              │             │
  │                        │  <─ Response ─────┤              │             │
  │                        │    200/400/500    │              │             │
  │                        │                  │              │             │
  │ <─ HTTP Response ──────┤                  │              │             │
  │   JSON + Headers       │                  │              │             │
  │
  └─ (Browser updates UI)
```

### Error Request Flow (500 Error Case)

```
Browser                 Nginx           Django              Redis              Error
  │                       │              │                    │                  │
  ├─ POST /v1/auth/login/ │              │                    │                  │
  │─────────────────────────>            │                    │                  │
  │                        │              │                    │                  │
  │                        ├─ Proxy ──────>                   │                  │
  │                        │              │                    │                  │
  │                        │         ┌────▼───────┐            │                  │
  │                        │         │ Query      │            │                  │
  │                        │         │ Redis      │──────────────>               │
  │                        │         │ for session│            │                  │
  │                        │         └────┬───────┘            │                  │
  │                        │              │                    │                  │
  │                        │              │        [FAIL]      │                  │
  │                        │              │  redis:6379        │                  │
  │                        │              │  connection ──────────────────────> ConnectionError
  │                        │              │  refused           │                  │ "No address 
  │                        │         ┌────▼───────┐            │                  │  associated with
  │                        │         │ Exception  │            │                  │  hostname"
  │                        │         │ Bubble up  │            │                  │
  │                        │         └────┬───────┘            │                  │
  │                        │              │                    │                  │
  │                        │  <─ 500 Error ─┤                  │                  │
  │                        │    (stacktrace │                  │                  │
  │                        │     in logs)   │                  │                  │
  │                        │                │                  │                  │
  │ <─ 500 Internal ───────┤                │                  │                  │
  │   Server Error         │                │                  │                  │
  │
  └─ Check docker logs to diagnose
```

---

## Storage & Persistence

### Docker Volumes

**Named Volumes:**
```yaml
volumes:
  validata_postgres_data:      # PostgreSQL database files
  validata_redis_data:          # Redis persistence (AOF)
  validata_api_logs:            # Django application logs
  validata_api_media:           # Uploaded user files
```

### Data Persistence Flow

```
┌─ Application ─┐
│ Writing Data  │
└──────┬────────┘
       │
       ▼
┌──────────────────────────────┐
│ Gunicorn (validata-api)      │
│ ORM Queries                  │
└──────┬───────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ PostgreSQL (validata-postgres)      │
│ WAL (Write-Ahead Logs)              │
│ ┌────────────────────────────────┐ │
│ │ /var/lib/postgresql/data       │ │
│ │ (mounted from volume)          │ │
│ └────────────────────────────────┘ │
└──────────────┬──────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ Host Machine Storage               │
│ Docker Volume: validata_postgres   │
│ ┌─────────────────────────────────┤
│ │ /var/lib/docker/volumes/        │
│ │ validata_postgres_data/         │
│ │ _data/                          │
│ └─────────────────────────────────┤
└────────────────────────────────────┘
```

### Volume Mount Points

| Volume | Container Path | Purpose | Persistence |
|--------|-----------------|---------|-------------|
| `validata_postgres_data` | `/var/lib/postgresql/data` | Database files, indexes, WAL | Persistent |
| `validata_redis_data` | `/data` | Redis RDB + AOF files | Persistent |
| `validata_api_logs` | `/app/logs` | Application logs | Persistent |
| `validata_api_media` | `/app/media` | User uploads, exports | Persistent |

### Backup Strategy

**Daily Backup (Example Cron):**
```bash
# Backup PostgreSQL to host
0 2 * * * docker compose exec -T postgres pg_dump -U validata validata | gzip > /backups/validata-$(date +\%Y\%m\%d).sql.gz

# Backup Redis persistence
0 2 * * * docker run --rm -v validata_redis_data:/data -v /backups:/backup alpine tar czf /backup/redis-$(date +\%Y\%m\%d).tar.gz /data
```

---

## Component Interactions

### Service Startup Sequence

```
1. PostgreSQL Container Starts
   ├─ Initialize data directory
   ├─ Load PostgreSQL binary
   ├─ Run init-validata.sql
   │  ├─ CREATE EXTENSION uuid-ossp
   │  └─ CREATE EXTENSION pgcrypto
   └─ Status: HEALTHY (health check passing)
        │
        ▼
2. Redis Container Starts
   ├─ Load Redis binary
   ├─ Mount /data volume
   ├─ Load AOF + RDB if exist
   └─ Status: HEALTHY (redis-cli ping returns PONG)
        │
        ▼
3. Django Backend Starts (depends_on healthy)
   ├─ Initialize gunicorn server
   ├─ Load Django wsgi.py
   │  ├─ Import Django settings
   │  ├─ Load installed apps
   │  ├─ Check database connection
   │  ├─ Run migrations (if configured)
   │  └─ Load fixtures (if configured)
   ├─ Start worker processes (4)
   ├─ Bind to 0.0.0.0:9001
   └─ Status: UP (listening on port 9001)
        │
        ▼
4. Nginx Starts (depends_on validata-api started)
   ├─ Load Nginx binary
   ├─ Parse /etc/nginx/conf.d/default.conf
   ├─ Initialize worker processes
   ├─ Bind to 0.0.0.0:80
   └─ Status: UP (listening on port 80, forwarding to 8080 on host)

All services ready for traffic in ~30-60 seconds
```

### Authentication Flow

```
1. User enters credentials in browser
   │
2. Browser sends POST /v1/auth/api/login/
   │
3. Nginx receives request, proxies to Django
   │
4. Django.AuthView processes request
   ├─ Validate email/password
   ├─ Query PostgreSQL (users table)
   │  ├─ Find user record
   │  ├─ Verify password hash (bcrypt/PBKDF2)
   │  └─ Get user permissions from DB
   ├─ Generate session token
   ├─ Store session in Redis
   │  ├─ Key: session_id
   │  └─ Value: user data + permissions
   └─ Return JWT/Token to browser
        │
5. Browser stores token (localStorage/sessionStorage)
   │
6. Subsequent requests include token in Authorization header
   │
7. Django verifies token
   ├─ Extract token from header
   ├─ Lookup session in Redis
   ├─ Validate permissions
   └─ Allow/deny request
```

### Database Query Flow

```
Django ORM Code:
  user = User.objects.get(email='admin@example.com')

    │
    ▼
Django ORM Layer
  └─ Generate SQL:
     SELECT * FROM auth_user WHERE email = 'admin@example.com'

    │
    ▼
psycopg2 (Django PostgreSQL Adapter)
  └─ Convert Python objects to SQL
  └─ Send query to PostgreSQL TCP socket

    │
    ▼
PostgreSQL TCP Connection (localhost:5432)
  └─ Receive SQL query
  └─ Parse query
  └─ Query planner (optimize)
  └─ Execute against table
  └─ Return result set

    │
    ▼
psycopg2 Receives Result
  └─ Convert database rows to Python objects

    │
    ▼
Django ORM converts to Model Instance
  └─ user = <User: admin@example.com>
  └─ Accessible as: user.email, user.first_name, etc.
```

### Cache Access Flow

```
Django Cache Request:
  from django.core.cache import cache
  user_data = cache.get('user_admin')

    │
    ▼
Cache Backend Check (Redis)
  └─ Connect to Redis TCP socket (6379)
  └─ Send HGET user_admin * or GET user_admin

    │
    ├─ CACHE HIT: Return cached data
    │     └─ Redis returns serialized Python object
    │     └─ Deserialized by Django
    │     └─ Return to application
    │
    └─ CACHE MISS: Fetch from database
          └─ Execute database query
          └─ Store in Redis (with TTL)
          └─ Return to application
```

---

## Request/Response Lifecycle

### Complete HTTP Request Lifecycle

```
┌─────────────────────────────────────┐
│ 1. CLIENT REQUEST                   │
│ Browser sends: GET / HTTP/1.1       │
│ Headers: Host, Cookie, User-Agent   │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 2. NETWORK TRANSPORT                │
│ TCP connection from client to host:80
│ (mapped from external 8080)         │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 3. NGINX RECEPTION                  │
│ Nginx listening on 0.0.0.0:80       │
│ Receives HTTP request                │
│ Parses headers & body               │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 4. NGINX ROUTING DECISION           │
│ Match request URI against locations  │
│ ┌─────────────────────────────────┐ │
│ │ GET / matches location /        │ │
│ │ → try_files logic applies       │ │
│ │ → Search for $uri, $uri/, or    │ │
│ │   fallback to /index.html       │ │
│ └─────────────────────────────────┘ │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 5. NGINX STATIC FILE LOOKUP         │
│ Search: /usr/share/nginx/html/      │
│ ├─ index.html found                 │
│ └─ Load from filesystem              │
│ (No Django involvement)              │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 6. NGINX RESPONSE CONSTRUCTION      │
│ Add HTTP headers:                    │
│ ├─ Content-Type: text/html           │
│ ├─ Content-Length: 2584              │
│ ├─ Cache-Control: max-age=...        │
│ ├─ ETag: "abc123..."                 │
│ └─ Other headers                     │
│ Append file content as body          │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 7. NGINX SENDS RESPONSE             │
│ HTTP/1.1 200 OK                      │
│ [Headers]                            │
│ [HTML Content]                       │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 8. CLIENT RECEIVES RESPONSE         │
│ Browser receives HTTP 200 OK        │
│ Parses HTML                          │
│ Discovers embedded assets:           │
│ ├─ /_framework/blazor.boot.json    │
│ ├─ /service-worker.js              │
│ ├─ /_framework/blazor.webassembly.js
│ ├─ /style.css                       │
│ └─ Other resources                  │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 9. BROWSER RESOURCE LOADING         │
│ Makes parallel requests for assets  │
│ (Steps 3-7 repeat for each)         │
│ Builds DOM tree                     │
│ Executes JavaScript                 │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 10. BLAZOR INITIALIZATION           │
│ /service-worker.js installed        │
│ /blazor.boot.json loaded             │
│ .NET runtime initialized             │
│ Blazor components instantiated      │
│ Event handlers attached              │
└────────────┬────────────────────────┘

             ▼

┌─────────────────────────────────────┐
│ 11. API REQUEST (from Blazor)       │
│ GET /v1/check-cip-setup/            │
│ (Backend API call)                   │
│ Headers include:                     │
│ ├─ Authorization: Bearer <token>    │
│ ├─ Content-Type: application/json    │
│ └─ Custom headers                    │
└────────────┬────────────────────────┘

[Continue to Django backend processing...]
```

---

## Service Dependencies

### Dependency Graph

```
validata-nginx
  └─ depends_on: validata-api (started)
       └─ depends_on: validata-postgres (healthy)
       └─ depends_on: validata-redis (healthy)

Critical Path:
  postgres (healthy) ──┐
                      ├─> validata-api (up) ──> validata-nginx (up)
  redis (healthy) ─────┘
```

### Startup Timing

| Service | Startup Time | Dependency | Health Status |
|---------|--------------|------------|----------------|
| PostgreSQL | 5-10s | None | healthy check |
| Redis | 2-5s | None | healthy check |
| Django API | 10-15s | Postgres healthy + Redis healthy | none (just "started") |
| Nginx | 3-5s | API started | none (just "started") |
| **Total** | **30-60s** | - | - |

---

## Scalability Considerations

### Current Limitations

1. **Single Nginx Instance**
   - Reverse proxy becomes bottleneck at high throughput
   - No built-in load balancing across replicas
   - SSL/TLS termination centralized

2. **Single Django Backend**
   - 4 Gunicorn workers (fixed)
   - Each worker handles one request at a time
   - Max concurrent: 4 requests
   - Queueing happens on 5th+ simultaneous request

3. **Single Database**
   - PostgreSQL in single container
   - No replication or failover
   - All writes go to single instance
   - No read replicas for load distribution

4. **Single Redis Instance**
   - No Redis clustering
   - No sentinel for HA
   - All cache/session data in one instance
   - Loss of data if container crashes

### Scaling Strategies

#### Horizontal Scaling (Multiple Instances)

```yaml
# docker-compose.yml modification for local testing
services:
  validata-api-1:
    image: validata-fixed:local
    environment:
      INSTANCE_ID: "1"
    
  validata-api-2:
    image: validata-fixed:local
    environment:
      INSTANCE_ID: "2"

  nginx:
    # Update upstream to include both backends
    upstream backend {
      server validata-api-1:9001;
      server validata-api-2:9001;
      server validata-api-3:9001;
    }
```

**For production, use:**
- Kubernetes with multiple replicas
- Docker Swarm with service scaling
- AWS ECS with task scaling
- Load balancer (ALB, NLB, HAProxy)

#### Vertical Scaling (Larger Resources)

```yaml
# docker-compose.yml with resource limits
services:
  validata-api:
    deploy:
      resources:
        limits:
          cpus: "4"
          memory: 4G
        reservations:
          cpus: "2"
          memory: 2G

  postgres:
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
```

#### Connection Pooling

```python
# Django settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'CONN_MAX_AGE': 300,  # Connection pooling
        'OPTIONS': {
            'connect_timeout': 10,
        }
    }
}
```

---

## Performance Characteristics

### Latency Profile

```
Request: GET /index.html

Breakdown (typical):
├─ Network latency: 1-5ms (localhost)
├─ Nginx parsing: <1ms
├─ Nginx routing: <1ms
├─ File lookup: <1ms
├─ File read: 1-5ms
├─ Nginx serialization: <1ms
└─ Network transit: 1-5ms
────────────────────────
Total: 5-20ms (local), 50-200ms (network)
```

### Memory Usage

```
Typical Memory Consumption:

PostgreSQL:
├─ Base image: 50MB
├─ Shared buffers: 128MB (default alpine)
├─ Work memory: Variable per query
└─ Total: 200-500MB depending on data size

Redis:
├─ Base image: 30MB
├─ In-memory data: Depends on usage
└─ Total: 50-200MB typical

Django + Gunicorn (4 workers):
├─ Base Python: 50MB per process
├─ Django framework: 100MB per process
├─ Loaded data: Variable
└─ Total: 600MB-2GB depending on dataset size

Nginx:
├─ Base image: 10MB
├─ Per connection: ~5KB
└─ Total: 20-100MB depending on concurrency
```

### Throughput Capacity

**Conservative Estimates (4 Gunicorn Workers):**
- Sequential requests: ~4 req/s per worker = ~16 req/s max
- Assuming: 60ms per request (DB query + processing)
- Concurrent connections (HTTP keep-alive): ~100s
- Before queue backup

**Monitoring:**
```bash
# Check Gunicorn worker status
docker compose exec validata-api ps aux | grep gunicorn

# Monitor connections
docker compose exec validata-api ss -tuln | grep 9001

# Check Django ORM queries (enable query logging)
# Set LOGGING in Django settings to track query count/duration
```

---

**End of Architecture Documentation**

For more information, see [README.md](README.md), [CONFIGURATION.md](CONFIGURATION.md), or [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
