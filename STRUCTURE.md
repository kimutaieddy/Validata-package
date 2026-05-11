# Project Structure

**Document Version:** 1.0  
**Last Updated:** May 11, 2026

Detailed explanation of the project folder structure, file organization, and purpose of each component.

---

## Table of Contents

- [Directory Tree](#directory-tree)
- [Root Level Files](#root-level-files)
- [Database Configuration](#database-configuration)
- [Docker Configuration](#docker-configuration)
- [Building Process](#building-process)
- [File Organization Guide](#file-organization-guide)
- [Adding New Components](#adding-new-components)

---

## Directory Tree

```
docker-deploy-package/
├── .git/                          # Git version control
├── .gitignore                     # Git ignore rules
├── .vscode/                       # VS Code settings
├── .qodo/                         # Qodo AI analysis data
├── db/                            # Database initialization
│   └── init-validata.sql         # PostgreSQL setup script
├── nginx/                         # Nginx configuration
│   └── ssl/                       # SSL certificates (optional)
├── .env                           # Environment variables (local)
├── .env.example                   # Environment template (committed)
├── docker-compose.yml             # Docker Compose orchestration
├── Dockerfile.validata-fix        # Validata API image (fixes + dependencies)
├── Dockerfile.nginx               # Nginx reverse proxy image
├── README.md                      # Project overview & quick start
├── ARCHITECTURE.md                # System design documentation
├── DEPLOYMENT.md                  # Deployment procedures
├── TROUBLESHOOTING.md             # Troubleshooting guide
├── STRUCTURE.md                   # This file - folder organization
└── Additional docs/               # Future documentation files
    ├── API.md                     # API endpoint documentation
    ├── SECURITY.md                # Security best practices
    ├── MAINTENANCE.md             # Operational maintenance
    └── .env.example               # Environment template
```

---

## Root Level Files

### `.env`

**Purpose:** Local environment configuration (DO NOT COMMIT)

**Location:** `docker-deploy-package/.env`

**Contains:**
- Database credentials
- Redis configuration
- Django settings
- Image references

**Example:**
```bash
DJANGO_DATABASE_HOST=postgres
DJANGO_DATABASE_PORT=5432
POSTGRES_DB=validata
POSTGRES_USER=validata
POSTGRES_PASSWORD=validata

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=

DJANGO_SECRET_KEY=development-secret-key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

VALIDATA_API_IMAGE=validata-fixed:local
```

**Security Notes:**
- ⚠️ **DO NOT COMMIT** to version control
- Listed in `.gitignore` to prevent accidental commits
- Use `.env.example` template in repository
- Production `.env` should have STRONG passwords (64+ characters)

---

### `.env.example`

**Purpose:** Template for environment configuration (COMMITTED to repo)

**Location:** `docker-deploy-package/.env.example`

**Usage:**
```bash
# Create local .env from template
cp .env.example .env

# Edit with local values
nano .env
```

**Contents:**
```bash
# ========== Database Configuration ==========
DJANGO_DATABASE_HOST=postgres
DJANGO_DATABASE_PORT=5432
POSTGRES_DB=validata
POSTGRES_USER=validata
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# ========== Redis Configuration ==========
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=CHANGE_ME_REDIS_PASSWORD

# ========== Django Settings ==========
DJANGO_SECRET_KEY=CHANGE_ME_RANDOM_SECRET_KEY
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,example.com

# ========== Security Settings ==========
SECURE_SSL_REDIRECT=False
SESSION_COOKIE_SECURE=False
CSRF_COOKIE_SECURE=False

# ========== Container Image ==========
VALIDATA_API_IMAGE=validata-fixed:local
```

---

### `docker-compose.yml`

**Purpose:** Define all services, networks, and volumes

**Location:** `docker-deploy-package/docker-compose.yml`

**Defines:**
- PostgreSQL database service
- Redis cache service
- Validata API service
- Nginx reverse proxy service
- Named volumes for data persistence
- Service dependencies and startup order
- Health checks for critical services

**Key Sections:**
```yaml
services:
  postgres:      # Database
  redis:         # Cache
  validata-api:  # Backend API
  nginx:         # Frontend & proxy

volumes:
  validata_postgres_data
  validata_redis_data
  validata_api_logs
  validata_api_media

networks:
  default:       # All services on same network
```

**How to use:**
```bash
docker compose up -d          # Start all services
docker compose down           # Stop all services
docker compose logs -f        # View logs
docker compose ps             # Show status
docker compose exec <svc> cmd # Execute command in service
```

---

### `Dockerfile.validata-fix`

**Purpose:** Build Docker image for Validata API with dependency fixes

**Location:** `docker-deploy-package/Dockerfile.validata-fix`

**Contains:**
- Patches to the original Validata image
- Installation of missing dependencies
- Configuration adjustments for Docker environment
- Setup of application entrypoint

**Referenced by:**
```yaml
# In docker-compose.yml
services:
  validata-api:
    image: ${VALIDATA_API_IMAGE}  # Set to validata-fixed:local via .env
```

**Build command:**
```bash
docker build -f Dockerfile.validata-fix -t validata-fixed:local .
```

---

### `Dockerfile.nginx`

**Purpose:** Build Nginx reverse proxy with frontend assets

**Location:** `docker-deploy-package/Dockerfile.nginx`

**Contains:**
- Multi-stage build configuration
  - Stage 1: Extract frontend files from Validata image
  - Stage 2: Create Nginx container with static assets
- Nginx configuration for:
  - Static file serving (frontend SPA)
  - API reverse proxy (/v1/* → backend)
  - Browser compatibility headers
  - Large file upload support (1500m limit)

**Key Functionality:**
```nginx
# Serves frontend assets from /usr/share/nginx/html/
location / {
    try_files $uri $uri/ /index.html;
}

# Proxies API requests to backend
location /v1/ {
    proxy_pass http://validata-api:9001;
    # Path preserved: /v1/endpoint → validata-api:9001/v1/endpoint
}
```

**Build command:**
```bash
docker build -f Dockerfile.nginx -t validata-nginx:latest .
```

---

## Database Configuration

### `db/` Directory

**Purpose:** Database initialization and management

**Location:** `docker-deploy-package/db/`

---

### `db/init-validata.sql`

**Purpose:** PostgreSQL initialization script run on first container startup

**Location:** `docker-deploy-package/db/init-validata.sql`

**Executed automatically by:**
```yaml
# In docker-compose.yml
services:
  postgres:
    volumes:
      - ./db/init-validata.sql:/docker-entrypoint-initdb.d/init-validata.sql
```

**Contents:**
```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS uuid-ossp;

-- Enable encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**When it runs:**
- First time PostgreSQL container starts
- Only if database doesn't already exist
- Runs as superuser

**To re-run (e.g., after reset):**
```bash
# 1. Delete volume
docker volume rm docker-deploy-package_validata_postgres_data

# 2. Restart PostgreSQL
docker compose up -d postgres

# 3. Wait for health check
docker compose ps postgres  # Should show (healthy)

# 4. Script runs automatically
docker compose logs postgres | tail -20
```

---

## Docker Configuration

### Root Docker Files

#### `Dockerfile.validata-fix`
- Extends Validata image
- Fixes dependency issues
- Installs missing packages
- Path: `./Dockerfile.validata-fix`

#### `Dockerfile.nginx`
- Multi-stage Nginx build
- Copies frontend from API image
- Configures reverse proxy
- Path: `./Dockerfile.nginx`

### `nginx/` Directory

**Purpose:** Nginx runtime configuration and SSL certificates

**Location:** `docker-deploy-package/nginx/`

**Subdirectories:**
```
nginx/
├── ssl/               # SSL/TLS certificates
│   ├── privkey.pem   # Private key
│   └── fullchain.pem # Certificate chain
└── nginx.conf        # Custom nginx config (optional)
```

**SSL Certificate Storage:**

For production with Let's Encrypt:
```bash
mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/example.com/privkey.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/example.com/fullchain.pem nginx/ssl/
sudo chmod 600 nginx/ssl/privkey.pem
```

---

## Building Process

### Build Order (Dependencies)

```
1. Dockerfile.validata-fix
   ↓
   validata-fixed:local image
   ↓
   ├─→ Used by docker-compose.yml (validata-api service)
   └─→ Copied in Dockerfile.nginx (for frontend extraction)
   
2. Dockerfile.nginx
   ↓
   validata-nginx image
   ↓
   Used by docker-compose.yml (nginx service)
```

### Build Commands

**Build all images:**
```bash
docker compose build --pull --no-cache

# --pull: Get latest base images
# --no-cache: Rebuild everything, don't use cached layers
```

**Build specific service:**
```bash
docker compose build validata-api
docker compose build nginx
```

**Rebuild after Dockerfile change:**
```bash
docker compose build --pull nginx
docker compose up -d nginx  # Restart with new image
```

---

## File Organization Guide

### Configuration Files (Git Committed)

| File | Purpose | Location |
|------|---------|----------|
| `.env.example` | Template for environment | Root |
| `.gitignore` | Git ignore rules | Root |
| `docker-compose.yml` | Service orchestration | Root |
| `Dockerfile.validata-fix` | API image build | Root |
| `Dockerfile.nginx` | Nginx image build | Root |

### Configuration Files (Local Only, NOT Committed)

| File | Purpose | Location | Gitignore |
|------|---------|----------|-----------|
| `.env` | Local environment | Root | ✓ Yes |
| `nginx/ssl/privkey.pem` | SSL private key | nginx/ssl/ | ✓ Yes |
| `nginx/ssl/fullchain.pem` | SSL certificate | nginx/ssl/ | ✓ Yes |

### Data Files (Volumes - NOT in Git)

| Data | Storage | Persistence |
|------|---------|-------------|
| PostgreSQL data | `validata_postgres_data` | Named volume |
| Redis data | `validata_redis_data` | Named volume |
| API logs | `validata_api_logs` | Named volume |
| Media uploads | `validata_api_media` | Named volume |

**View volumes:**
```bash
docker volume ls | grep validata
docker volume inspect docker-deploy-package_validata_postgres_data
```

### Database Files

| File | Purpose | Location | Usage |
|------|---------|----------|-------|
| `init-validata.sql` | DB initialization | `db/` | Runs once on first startup |

---

## Adding New Components

### Adding a New Service

**Example: Add message queue (RabbitMQ)**

1. **Update docker-compose.yml:**
```yaml
services:
  rabbitmq:
    image: rabbitmq:3.12-alpine
    container_name: validata-rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS}
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - validata_rabbitmq_data:/var/lib/rabbitmq

volumes:
  validata_rabbitmq_data:
    driver: local
```

2. **Update .env:**
```bash
RABBITMQ_USER=guest
RABBITMQ_PASS=guest
```

3. **Start service:**
```bash
docker compose up -d rabbitmq
```

### Adding Database Migration

1. **Create SQL file in db/ directory:**
```bash
cat > db/001-add-new-table.sql << 'EOF'
CREATE TABLE IF NOT EXISTS new_table (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
EOF
```

2. **Or run migration in container:**
```bash
docker compose exec postgres psql -U validata -d validata -f /docker-entrypoint-initdb.d/001-add-new-table.sql
```

### Adding Backend Dependencies

1. **Update in Dockerfile.validata-fix:**
```dockerfile
RUN pip install --upgrade pip && \
    pip install \
        new-package==1.0.0 \
        another-package==2.0.0
```

2. **Rebuild image:**
```bash
docker compose build --pull validata-api
docker compose up -d validata-api
```

### Adding Nginx Configuration

1. **Create custom config in nginx/ directory:**
```bash
cat > nginx/custom-locations.conf << 'EOF'
location /api/ {
    proxy_pass http://validata-api:9001;
}

location /health {
    access_log off;
    return 200 "OK";
}
EOF
```

2. **Include in Dockerfile.nginx:**
```dockerfile
COPY nginx/custom-locations.conf /etc/nginx/conf.d/
```

3. **Rebuild and restart:**
```bash
docker compose build nginx
docker compose up -d nginx
```

---

## File Modification Guidelines

### Safe Modifications

✅ **Safe to edit:**
- `.env` (local environment)
- `.env.example` (template)
- `docker-compose.yml` (for environment-specific changes)
- Database migration files

### Require Testing

⚠️ **Test before production:**
- `Dockerfile.validata-fix` (rebuild API image)
- `Dockerfile.nginx` (rebuild Nginx image)
- Nginx configuration changes

### Dangerous Modifications

❌ **Be very careful:**
- Service dependencies in `docker-compose.yml`
- Database schema changes (backup first!)
- Network configuration changes
- Volume mount paths

### Version Control

```bash
# Commit safe files
git add docker-compose.yml .env.example
git add Dockerfile.*
git add db/*.sql
git add DEPLOYMENT.md

# DO NOT commit
git add .env                           # ❌ Local only
git add nginx/ssl/                     # ❌ Certificates
```

---

## Directory Size Management

**Check sizes:**
```bash
# Container volumes
du -sh /var/lib/docker/volumes/*

# Specific volumes
du -sh /var/lib/docker/volumes/docker-deploy-package_validata_postgres_data

# Find large files
find /var/lib/docker/volumes -type f -size +100M
```

**Clean up unused data:**
```bash
# Remove unused volumes
docker volume prune

# Remove unused images
docker image prune

# Remove stopped containers
docker container prune
```

---

**End of Project Structure Guide**

For more information, see [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), or [DEPLOYMENT.md](DEPLOYMENT.md).
