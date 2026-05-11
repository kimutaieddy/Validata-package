# Validata Docker Deployment

**Version:** 1.0  
**Last Updated:** May 11, 2026  
**Status:** Production-Ready

A complete containerized deployment of the Validata application stack using Docker Compose, featuring PostgreSQL 16, Redis 7.2, a Django backend (Gunicorn), and a Blazor WebAssembly frontend served through Nginx.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [System Requirements](#system-requirements)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Monitoring & Logs](#monitoring--logs)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)
- [Security Considerations](#security-considerations)
- [Deployment to Production](#deployment-to-production)
- [Common Issues & Solutions](#common-issues--solutions)
- [Additional Documentation](#additional-documentation)

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop (or Docker Engine + Docker Compose)
- Git
- Text editor or IDE
- 4GB+ available RAM
- 10GB+ disk space for data volumes

### One-Command Setup

```bash
# 1. Clone or download the project
git clone <repo-url>
cd docker-deploy-package

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your credentials (see CONFIGURATION.md)

# 3. Start all services
docker compose up -d

# 4. Access the application
# Frontend: http://localhost:8080
# API: http://localhost:8080/v1/
# PostgreSQL: localhost:5432
# Redis: localhost:6379
```

### Verify Services Are Running

```bash
docker compose ps
docker compose logs -f
```

Expected output: All containers showing `Up` or `Healthy` status.

---

## 📦 System Requirements

### Minimum
- **CPU:** 2 cores
- **RAM:** 4GB
- **Disk:** 10GB available space
- **Docker:** Version 20.10+
- **Docker Compose:** Version 2.0+

### Recommended
- **CPU:** 4+ cores
- **RAM:** 8GB
- **Disk:** 50GB+ (for data growth)
- **Network:** Stable connection, 10+ Mbps bandwidth
- **OS:** Ubuntu 20.04+, macOS 10.15+, or Windows 10/11 (WSL2)

### Network Requirements
- Port `8080` (Nginx frontend/API)
- Port `5432` (PostgreSQL - local only)
- Port `6379` (Redis - local only)
- Port `9001` (Gunicorn backend - internal Docker network only)

---

## 📁 Project Structure

```
docker-deploy-package/
├── README.md                          # This file - main documentation
├── ARCHITECTURE.md                    # Detailed system architecture & data flow
├── CONFIGURATION.md                   # Environment configuration guide
├── TROUBLESHOOTING.md                 # Error diagnosis and solutions
├── DEPLOYMENT.md                      # Production deployment guide
├── MAINTENANCE.md                     # Operational procedures
├── .env                               # Environment variables (DO NOT commit)
├── .env.example                       # Example environment template
├── .gitignore                         # Git ignore patterns
│
├── docker-compose.yml                 # Main Docker Compose orchestration file
├── Dockerfile.nginx                   # Nginx reverse proxy configuration
├── Dockerfile.validata-fix            # Validata API image patches
│
├── db/
│   └── init-validata.sql             # PostgreSQL initialization script
│       └── Creates uuid-ossp & pgcrypto extensions
│
├── .qodo/                             # Code quality automation (internal)
├── .vscode/                           # VS Code workspace settings
└── .git/                              # Git repository metadata
```

### Key Files Explained

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Defines all services, networking, volumes, and dependencies |
| `Dockerfile.nginx` | Builds custom Nginx image with Blazor frontend copied from API image |
| `Dockerfile.validata-fix` | Patches upstream Validata image with compatibility fixes |
| `.env` | **REQUIRED:** Contains all environment-specific configuration |
| `db/init-validata.sql` | Creates PostgreSQL extensions on first start |

---

## 🏗️ Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       External Client                            │
│                     (Browser/REST Client)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                  HTTP/HTTPS  │ :8080
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NGINX Reverse Proxy                           │
│                   (validata-nginx:80)                            │
├─────────────────────────────────────────────────────────────────┤
│ • Serves Blazor WebAssembly Frontend                             │
│ • Routes /v1/* → Backend API                                     │
│ • Static asset caching (CSS, JS, WASM)                           │
│ • Request/response manipulation                                  │
│ • Max upload size: 1500MB                                        │
└─────┬─────────────────────────────────────────────────────────┬─┘
      │                                                           │
      │ HTTP :9001 (internal)    ┌────────────────────────────┐  │
      │                          │ Frontend Assets (/app/web) │  │
      │                          └────────────────────────────┘  │
      │                                                           │
      ▼                                                           ▼
┌──────────────────────────┐                        ┌─────────────────────┐
│   Django Backend         │                        │  Validata API Image │
│   (validata-api:9001)    │                        │  (Source of assets) │
├──────────────────────────┤                        └─────────────────────┘
│ • Gunicorn (4 workers)   │
│ • Django REST Framework  │
│ • Authentication/Auth    │
│ • CIP Setup              │
│ • Data Processing        │
└──┬───────────┬──────────┬─┘
   │           │          │
   │    :5432  │ :6379    │ Logs/Media
   ▼           ▼          ▼
┌──────┐   ┌─────┐   ┌────────────┐
│ PgSQL│   │Redis│   │ Volumes    │
│ :5432│   │:6379│   │/app/logs   │
│      │   │     │   │/app/media  │
└──────┘   └─────┘   └────────────┘
```

### Service Dependencies

```
nginx (port 8080)
  ↑
  └── depends_on: validata-api (healthy)
        ↑
        └── depends_on: postgres (healthy) + redis (healthy)

postgres → init-validata.sql → uuid-ossp & pgcrypto
redis → AOF persistence (/data)
```

### Request Flow

**Frontend → API Request:**
1. Browser requests: `POST http://localhost:8080/v1/cip-setup/`
2. Nginx receives on `:80`
3. Matches location `/v1/` rule
4. Proxies to `http://validata-api:9001/v1/cip-setup/` (preserves `/v1/` prefix)
5. Django handles request, accesses PostgreSQL & Redis
6. Response returned through Nginx to client

**Static Asset Request:**
1. Browser requests: `GET http://localhost:8080/_framework/blazor.boot.json`
2. Nginx receives, tries to match files in `/usr/share/nginx/html`
3. File found, returned with caching headers
4. No Django involvement

---

## 🔧 Installation & Setup

### Step 1: Prerequisites Check

```bash
# Verify Docker is installed
docker --version          # Should be 20.10+
docker compose version    # Should be 2.0+

# Check available resources
docker system df          # See disk usage and cleanup options
free -h                   # Check RAM (Linux)
```

### Step 2: Clone/Download Project

```bash
git clone <repository-url> docker-deploy-package
cd docker-deploy-package
```

### Step 3: Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit with your credentials (see CONFIGURATION.md for details)
nano .env
# OR
code .env
```

**Essential variables to set:**
```env
DJANGO_DATABASE_HOST=postgres
DJANGO_DATABASE_PORT=5432
POSTGRES_DB=validata
POSTGRES_USER=validata
POSTGRES_PASSWORD=<secure-password>
REDIS_HOST=redis
REDIS_PORT=6379
VALIDATA_API_IMAGE=validata-fixed:local
```

### Step 4: Registry Authentication (if using private images)

```bash
docker login yourregistry.azurecr.io
# Enter username and password when prompted
```

### Step 5: Build Custom Images

```bash
# Build Nginx image with embedded frontend
docker compose build

# Or build specific service
docker compose build nginx
docker compose build validata-api
```

### Step 6: Start Services

```bash
# Start all services in detached mode
docker compose up -d

# Verify services started
docker compose ps

# Watch logs for startup issues
docker compose logs -f
```

---

## ⚙️ Configuration

See [CONFIGURATION.md](CONFIGURATION.md) for detailed environment variable reference.

### Key Configuration Areas

#### Database Connection
```env
DJANGO_DATABASE_HOST=postgres
DJANGO_DATABASE_PORT=5432
POSTGRES_DB=validata
POSTGRES_USER=validata
POSTGRES_PASSWORD=your_secure_password_here
```

#### Redis Configuration
```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=
```

#### Application Image
```env
VALIDATA_API_IMAGE=validata-fixed:local
# For production, use: yourregistry.azurecr.io/validata-cip:x.x.x
```

#### Application-Specific Settings
Add Django settings to `.env`:
```env
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
```

---

## 🎯 Running the Application

### Start Services

```bash
# Start all services
docker compose up -d

# Start specific service
docker compose up -d postgres redis validata-api nginx
```

### Access Application

- **Frontend:** http://localhost:8080
- **API Root:** http://localhost:8080/v1/
- **PostgreSQL:** `localhost:5432` (client tools only)
- **Redis:** `localhost:6379` (CLI tools only)

### Stop Services

```bash
# Stop all services (preserves data)
docker compose down

# Stop and remove volumes (DELETES DATA)
docker compose down -v

# Restart specific service
docker compose restart validata-api
```

### View Logs

```bash
# All services, recent 50 lines
docker compose logs --tail 50

# Specific service, follow live
docker compose logs -f validata-api

# With timestamps
docker compose logs --timestamps

# Last 200 lines of backend
docker compose logs validata-api --tail 200
```

---

## 📡 API Endpoints

### Health & Status

```bash
# Check setup status
GET http://localhost:8080/v1/check-cip-setup/

# Expected response:
# {"setup_required": true}  or  {"setup_required": false}
```

### Authentication

```bash
# User login
POST http://localhost:8080/v1/auth/api/login/
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}

# Response:
# {"token": "abc123...", "user": {...}}
```

### Setup

```bash
# Initialize setup
POST http://localhost:8080/v1/cip-setup/
Content-Type: application/json

{
  "setup_email": "admin@example.com",
  "setup_otp": "123456",
  "first_name": "Admin",
  "last_name": "User"
}
```

### Other Endpoints

Refer to the API documentation or explore via:
- Swagger/OpenAPI: `http://localhost:8080/v1/swagger/` (if enabled)
- DRF browsable API: Visit any endpoint in browser

---

## 📊 Monitoring & Logs

### Container Health

```bash
# Check health status
docker compose ps

# Expected healthy services:
# validata-postgres - healthy
# validata-redis - healthy (after ~5s startup)
# validata-api - up
# validata-nginx - up
```

### View Service Logs

```bash
# Frontend/Nginx errors
docker compose logs nginx --tail 100 | grep -i error

# Backend API errors
docker compose logs validata-api --tail 100 | grep -i error

# Database startup logs
docker compose logs postgres --tail 50

# Real-time monitoring
docker compose logs -f --all
```

### Docker Container Inspection

```bash
# Inspect running container
docker inspect validata-api

# Execute commands inside container
docker compose exec validata-api ls -la /app
docker compose exec postgres psql -U validata -d validata -c "SELECT * FROM auth_user;"

# Container resource usage
docker stats
```

---

## 🐛 Troubleshooting

### Common Issues

#### Issue: `docker compose: command not found`
**Solution:** Install Docker Compose separately or upgrade Docker Desktop.
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### Issue: Port 8080 already in use
**Solution:** Change the port in `docker-compose.yml`:
```yaml
ports:
  - "8000:80"  # Use 8000 instead of 8080
```
Then access at: `http://localhost:8000`

#### Issue: 500 Internal Server Error
**See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed diagnosis.**

Common causes:
1. Redis not running → `docker compose up -d redis`
2. PostgreSQL connection failed → Check `POSTGRES_PASSWORD` in `.env`
3. Django secret key missing → Add `DJANGO_SECRET_KEY` to `.env`

#### Issue: Cannot connect to PostgreSQL
**Solution:**
```bash
# Check if postgres is healthy
docker compose logs postgres

# Test connection
docker compose exec postgres psql -U validata -d validata -c "SELECT 1"

# Reset postgres (WARNING: DELETES DATA)
docker compose down -v
docker compose up -d postgres
```

#### Issue: Redis connection refused
**Solution:**
```bash
# Start redis if missing
docker compose up -d redis

# Check redis is accepting connections
docker compose exec redis redis-cli ping
# Expected: PONG
```

For more detailed troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## 🔒 Security Considerations

### Development vs. Production

**DO NOT use development settings in production:**
- Set `DJANGO_DEBUG=False`
- Use strong database passwords
- Generate secure `DJANGO_SECRET_KEY`
- Use HTTPS/SSL in production
- Restrict PostgreSQL/Redis to internal network only

### Credentials Management

```bash
# NEVER commit .env to git
# Example .env.example provided for reference
cat .gitignore | grep env

# Use secure methods:
# - HashiCorp Vault
# - AWS Secrets Manager
# - Azure Key Vault
# - Kubernetes Secrets
```

### Network Security

```yaml
# In production docker-compose.yml:
services:
  postgres:
    ports: []  # No public port exposure
    # Only accessible via Docker network

  redis:
    ports: []  # No public port exposure
    # Only accessible via Docker network

  nginx:
    ports:
      - "443:443"  # HTTPS only
      - "80:80"    # Redirect to HTTPS
```

### Docker Security Best Practices

1. **Use specific image versions** (not `latest`)
   ```yaml
   image: postgres:16-alpine  # ✓ Good
   image: postgres:latest     # ✗ Avoid
   ```

2. **Run containers as non-root**
   ```yaml
   user: "1000:1000"
   ```

3. **Use read-only filesystems where possible**
   ```yaml
   read_only: true
   tmpfs:
     - /tmp
   ```

4. **Restrict resource consumption**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: "2"
         memory: 2G
   ```

---

## 🚀 Deployment to Production

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive production deployment guide.

### Quick Checklist

- [ ] Use production image from registry
- [ ] Set `DJANGO_DEBUG=False`
- [ ] Configure HTTPS/SSL with valid certificate
- [ ] Use strong passwords and secrets
- [ ] Set up database backups
- [ ] Configure monitoring and alerting
- [ ] Use managed PostgreSQL/Redis (AWS RDS, Azure Database, etc.)
- [ ] Implement CI/CD pipeline
- [ ] Set up log aggregation (ELK, Splunk, CloudWatch)
- [ ] Test disaster recovery procedures

### Production Environment Example

```bash
# .env.production
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<use-vault>
POSTGRES_PASSWORD=<use-vault>
VALIDATA_API_IMAGE=yourregistry.azurecr.io/validata-cip:1.0.1
NGINX_WORKERS=8
DATABASE_BACKUP_ENABLED=true
```

---

## 🛠️ Maintenance

See [MAINTENANCE.md](MAINTENANCE.md) for operational procedures.

### Regular Tasks

#### Daily
- Monitor error logs
- Check service health
- Monitor disk space

#### Weekly
- Review application logs
- Check for security updates
- Test backup restoration

#### Monthly
- Update container images
- Review access logs
- Audit credentials

### Backup Procedures

```bash
# Backup PostgreSQL
docker compose exec postgres pg_dump -U validata validata > backup.sql

# Backup Redis
docker compose exec redis redis-cli --rdb /tmp/dump.rdb

# Backup volumes
docker run --rm -v validata_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data
```

### Updates & Upgrades

```bash
# Pull latest images
docker compose pull

# Rebuild with latest base images
docker compose build --pull

# Graceful restart
docker compose up -d

# Verify health
docker compose ps
docker compose logs --tail 50
```

---

## 📚 Additional Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system design, data flow, and component interactions
- **[CONFIGURATION.md](CONFIGURATION.md)** - Complete environment variable reference
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Error diagnosis, common issues, and solutions
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment strategies and best practices
- **[MAINTENANCE.md](MAINTENANCE.md)** - Operational procedures, backups, updates

---

## 🤝 Support & Feedback

- Review logs: `docker compose logs -f`
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) first
- Consult [ARCHITECTURE.md](ARCHITECTURE.md) for system design details
- Verify [CONFIGURATION.md](CONFIGURATION.md) for environment setup

---

## 📝 Assumptions & Limitations

### Assumptions
1. Docker and Docker Compose are installed and working
2. Port 8080 is available on the host
3. Sufficient disk space (10GB+) for databases and logs
4. Network connectivity to pull images from registry
5. Users have basic familiarity with Docker and CLI tools

### Limitations
1. Development setup uses local volumes (not suitable for multi-host)
2. No built-in high availability or load balancing
3. Single Nginx reverse proxy (becomes bottleneck under extreme load)
4. Gunicorn with 4 workers (adjust in docker-compose.yml for larger workloads)
5. No automatic database failover
6. Frontend caching: Static assets cached in Nginx (set cache headers accordingly)

### Important Notes
- **Data Persistence:** All data stored in Docker volumes. Use external backup systems for production.
- **Networking:** All services communicate via Docker internal network (172.x.x.x). External access only through Nginx on port 8080.
- **Logging:** Django logs to stdout (captured by Docker). For production, set up centralized logging.
- **Secrets:** Never commit `.env` file. Use environment-specific secret management systems.

---

## 📄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | May 11, 2026 | Initial release with complete documentation |

---

## 📞 Quick Reference Commands

```bash
# Start/Stop
docker compose up -d              # Start all services
docker compose down               # Stop all services
docker compose restart            # Restart all services

# Monitoring
docker compose ps                 # Service status
docker compose logs -f            # Follow all logs
docker compose logs SERVICE_NAME  # Service-specific logs
docker stats                      # Resource usage

# Maintenance
docker compose pull               # Pull latest images
docker compose build              # Build custom images
docker compose exec SERVICE cmd   # Execute command in service

# Cleanup
docker compose down -v            # Remove containers & volumes
docker system prune               # Remove unused Docker resources

# Database
docker compose exec postgres psql -U validata -d validata
# Connect to PostgreSQL

docker compose exec redis redis-cli
# Connect to Redis CLI
```

---

**For more detailed information, refer to the accompanying documentation files.**
