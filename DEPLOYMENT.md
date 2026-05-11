# Deployment Guide

**Document Version:** 1.0  
**Last Updated:** May 11, 2026

Comprehensive guide for deploying and operating the Validata system in development, staging, and production environments.

---

## Table of Contents

- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Development Deployment](#development-deployment)
- [Staging Deployment](#staging-deployment)
- [Production Deployment](#production-deployment)
- [Environment Configuration](#environment-configuration)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Backup & Recovery](#backup--recovery)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Scaling & Performance Tuning](#scaling--performance-tuning)
- [Updating & Patching](#updating--patching)

---

## Pre-Deployment Checklist

### System Requirements

**Hardware (Minimum):**
- **CPU:** 2 cores (4+ cores recommended for production)
- **RAM:** 4 GB (8+ GB recommended for production)
- **Disk:** 50 GB SSD (100+ GB for production with data growth)
- **Network:** 100 Mbps (1 Gbps for production)

**Software:**
- Docker Engine 20.10+ or Docker Desktop 4.5+
- Docker Compose v2.3+
- `curl` or `wget` for testing
- `openssl` for certificate generation (if using SSL)

**Ports Required:**
- 8080 (Nginx - configurable)
- 5432 (PostgreSQL - internal only, or expose if needed)
- 6379 (Redis - internal only, or expose if needed)

### Pre-Flight Validation

```bash
# 1. Verify Docker installation
docker --version                 # Should be 20.10+
docker compose version           # Should be v2.x

# 2. Verify system resources
free -h                          # Check available RAM
df -h                            # Check disk space
nproc                            # Check CPU count

# 3. Verify network connectivity
ping 8.8.8.8                     # Internet access
curl -I https://hub.docker.com   # Docker registry access

# 4. Verify port availability
lsof -i :8080 || echo "Port 8080 available"
lsof -i :5432 || echo "Port 5432 available"
lsof -i :6379 || echo "Port 6379 available"
```

---

## Development Deployment

### Quick Start (Local Machine)

```bash
# 1. Clone or extract project
cd docker-deploy-package

# 2. Create .env file
cat > .env << 'EOF'
# Database
DJANGO_DATABASE_HOST=postgres
DJANGO_DATABASE_PORT=5432
POSTGRES_DB=validata
POSTGRES_USER=validata
POSTGRES_PASSWORD=validata

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=

# Django
DJANGO_SECRET_KEY=dev-secret-key-change-in-production
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# Image
VALIDATA_API_IMAGE=validata-fixed:local
EOF

# 3. Start services
docker compose up -d

# 4. Wait for health checks
docker compose ps
# All services should show "Up (healthy)" or "Up"

# 5. Access application
open http://localhost:8080  # macOS
xdg-open http://localhost:8080  # Linux
start http://localhost:8080  # Windows
```

### Development with Code Changes

If modifying backend code locally:

```bash
# 1. Mount source code into container
# Edit docker-compose.yml:
services:
  validata-api:
    volumes:
      - ./app:/app  # Mount source code
      - validata_api_logs:/var/log/validata
      - validata_api_media:/app/media

# 2. Rebuild and restart
docker compose up -d --build validata-api

# 3. Watch logs for changes
docker compose logs -f validata-api

# 4. Reload code (development server will auto-reload if configured)
# Or restart container when done editing:
docker compose restart validata-api
```

### Development Debugging

**Enable Django Debug Mode:**

```bash
# .env
DJANGO_DEBUG=True
DJANGO_DEBUG_TOOLBAR=True

# Then view debug toolbar at /?debug or logs
docker compose logs validata-api -f
```

**Django Shell Access:**

```bash
# Access Django management shell
docker compose exec validata-api python manage.py shell

# Example commands:
from django.contrib.auth.models import User
User.objects.all().count()

# Create test user
User.objects.create_superuser('admin', 'admin@example.com', 'password')
```

**Database Inspection:**

```bash
# Access PostgreSQL directly
docker compose exec postgres psql -U validata -d validata

# Useful commands in psql:
\dt                              # List tables
\d table_name                    # Describe table
SELECT COUNT(*) FROM table_name; # Count rows
```

---

## Staging Deployment

### Staging Environment Setup

Staging should mirror production but with non-critical data.

```bash
# 1. Create staging directory
mkdir -p /opt/validata-staging
cd /opt/validata-staging

# 2. Copy project files
cp -r /path/to/docker-deploy-package/* .

# 3. Create staging .env
cat > .env << 'EOF'
# Database (staging credentials)
DJANGO_DATABASE_HOST=postgres
DJANGO_DATABASE_PORT=5432
POSTGRES_DB=validata_staging
POSTGRES_USER=validata_staging
POSTGRES_PASSWORD=staging-password-change-me

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=

# Django
DJANGO_SECRET_KEY=staging-secret-key-change-me
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=staging.example.com,staging-api.example.com

# Image
VALIDATA_API_IMAGE=validata-fixed:staging-tag

# Staging overrides
LOG_LEVEL=INFO
EOF

# 4. Start staging deployment
docker compose -f docker-compose.yml up -d

# 5. Verify
docker compose ps
curl -I https://staging.example.com/
```

### Staging Testing Procedures

```bash
# 1. API endpoint testing
curl -X GET https://staging.example.com/v1/check-cip-setup/
curl -X POST https://staging.example.com/v1/auth/api/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"test@staging.com","password":"testpass"}'

# 2. Database health check
docker compose exec postgres pg_isready
docker compose exec postgres psql -U validata_staging -d validata_staging -c "SELECT COUNT(*) FROM information_schema.tables;"

# 3. Cache health check
docker compose exec redis redis-cli ping
redis-cli -h staging.example.com info stats

# 4. Frontend verification
curl -I https://staging.example.com/
# Should return 200 with HTML content
```

---

## Production Deployment

### Production Environment Setup

**CRITICAL: Production must be hardened and secure.**

```bash
# 1. Create production directory with restricted permissions
sudo mkdir -p /opt/validata-production
sudo chmod 700 /opt/validata-production
cd /opt/validata-production

# 2. Copy and configure
sudo cp -r /path/to/docker-deploy-package/* .
sudo chown -R nobody:nogroup .
sudo chmod 600 docker-compose.yml .env

# 3. Create production .env with STRONG credentials
sudo cat > .env << 'EOF'
# Database (CHANGE ALL PASSWORDS!)
DJANGO_DATABASE_HOST=postgres
DJANGO_DATABASE_PORT=5432
POSTGRES_DB=validata
POSTGRES_USER=validata_prod
POSTGRES_PASSWORD=CHANGE-ME-STRONG-PASSWORD-64-CHARS-MIN
POSTGRES_ROOT_PASSWORD=CHANGE-ME-STRONG-ROOT-PASSWORD-64-CHARS-MIN

# Redis (use password in production)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=CHANGE-ME-STRONG-REDIS-PASSWORD-64-CHARS-MIN

# Django
DJANGO_SECRET_KEY=CHANGE-ME-VERY-LONG-RANDOM-SECRET-KEY
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=example.com,www.example.com,api.example.com
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True

# Image
VALIDATA_API_IMAGE=myregistry.azurecr.io/validata:v1.0.0

# Production settings
LOG_LEVEL=WARNING
SENTRY_DSN=https://sentry-key@sentry.io/project-id
EOF

sudo chmod 400 .env
```

**Generate Strong Passwords:**

```bash
# Generate 64-character random password
openssl rand -base64 32  # 32 bytes = 44 chars in base64
# Or use:
head -c 32 /dev/urandom | base64
```

### Production Docker Compose Configuration

Edit `docker-compose.yml` for production:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: validata-postgres
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U validata"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s
    volumes:
      - validata_postgres_data:/var/lib/postgresql/data
      - ./db/init-validata.sql:/docker-entrypoint-initdb.d/init-validata.sql
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "-c log_statement=all -c log_duration=on -c log_min_duration_statement=1000"
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  redis:
    image: redis:7.2-alpine
    container_name: validata-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASS}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5
    volumes:
      - validata_redis_data:/data
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 1G
        reservations:
          cpus: '0.25'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  validata-api:
    image: ${VALIDATA_API_IMAGE}
    container_name: validata-api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DJANGO_DATABASE_HOST: ${DJANGO_DATABASE_HOST}
      DJANGO_DATABASE_PORT: ${DJANGO_DATABASE_PORT}
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      REDIS_HOST: ${REDIS_HOST}
      REDIS_PORT: ${REDIS_PORT}
      REDIS_PASS: ${REDIS_PASS}
      DJANGO_SECRET_KEY: ${DJANGO_SECRET_KEY}
      DJANGO_DEBUG: ${DJANGO_DEBUG:-False}
      DJANGO_ALLOWED_HOSTS: ${DJANGO_ALLOWED_HOSTS}
      SECURE_SSL_REDIRECT: ${SECURE_SSL_REDIRECT:-True}
      SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE:-True}
      CSRF_COOKIE_SECURE: ${CSRF_COOKIE_SECURE:-True}
    volumes:
      - validata_api_logs:/var/log/validata
      - validata_api_media:/app/media
    command: |
      gunicorn server.wsgi:application \
        --bind 0.0.0.0:9001 \
        --workers 8 \
        --worker-class sync \
        --timeout 120 \
        --keep-alive 5 \
        --access-logfile - \
        --error-logfile -
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 3G
        reservations:
          cpus: '1'
          memory: 2G
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "10"

  nginx:
    build: 
      context: .
      dockerfile: Dockerfile.nginx
    container_name: validata-nginx
    restart: unless-stopped
    depends_on:
      - validata-api
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx_cache:/var/cache/nginx
    environment:
      NGINX_WORKER_PROCESSES: auto
      NGINX_WORKER_CONNECTIONS: 4096
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

volumes:
  validata_postgres_data:
    driver: local
  validata_redis_data:
    driver: local
  validata_api_logs:
    driver: local
  validata_api_media:
    driver: local
  nginx_cache:
    driver: local
```

### Initial Production Deployment

```bash
# 1. Build all images
docker compose build --pull --no-cache

# 2. Start services
docker compose up -d

# 3. Wait for startup (may take 2-5 minutes)
docker compose ps
# Check all services are healthy

# 4. Run database migrations
docker compose exec validata-api python manage.py migrate
docker compose exec validata-api python manage.py collectstatic --noinput

# 5. Create admin user
docker compose exec validata-api python manage.py createsuperuser

# 6. Verify operations
curl -I https://example.com/
curl -I https://example.com/v1/check-cip-setup/
```

---

## Environment Configuration

### Critical Environment Variables

| Variable | Purpose | Development | Production |
|----------|---------|-------------|-----------|
| `DJANGO_SECRET_KEY` | Django session encryption | dev-key | **RANDOM 50+ CHAR** |
| `DJANGO_DEBUG` | Debug mode | `True` | **`False`** |
| `DJANGO_ALLOWED_HOSTS` | Allowed domains | `localhost` | `example.com` |
| `POSTGRES_PASSWORD` | Database password | `validata` | **STRONG 64+ CHAR** |
| `REDIS_PASS` | Redis password | empty | **STRONG 64+ CHAR** |
| `SECURE_SSL_REDIRECT` | Force HTTPS | `False` | `True` |
| `SESSION_COOKIE_SECURE` | HTTPS-only cookies | `False` | `True` |
| `CSRF_COOKIE_SECURE` | HTTPS-only CSRF | `False` | `True` |

### Environment-Specific Files

Create separate .env files for each environment:

```bash
# Development
.env.dev

# Staging
.env.staging

# Production
.env.production

# Use with:
docker compose --env-file .env.production up -d
```

---

## SSL/TLS Configuration

### Generating Self-Signed Certificate (Development/Staging)

```bash
# Create certificate directory
mkdir -p nginx/ssl

# Generate private key and certificate
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem \
  -out nginx/ssl/fullchain.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=example.com"

# Permissions
chmod 600 nginx/ssl/privkey.pem
chmod 644 nginx/ssl/fullchain.pem
```

### Using Let's Encrypt (Production)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --standalone \
  -d example.com \
  -d www.example.com \
  -d api.example.com

# Certificate location
/etc/letsencrypt/live/example.com/

# Copy to project
sudo cp /etc/letsencrypt/live/example.com/privkey.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/example.com/fullchain.pem nginx/ssl/
sudo chmod 600 nginx/ssl/privkey.pem
```

### Nginx SSL Configuration

Update `Dockerfile.nginx`:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com www.example.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Rest of configuration...
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name _;
    return 301 https://$host$request_uri;
}
```

---

## Backup & Recovery

### Automated Daily Backups

Create backup script:

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/opt/validata/backups"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup database
docker compose exec -T postgres pg_dump -U validata validata \
  | gzip > "$BACKUP_DIR/db-backup-$DATE.sql.gz"

# Backup Redis
docker run --rm \
  -v validata_redis_data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/redis-backup-$DATE.tar.gz /data

# Backup media files
docker run --rm \
  -v validata_api_media:/media \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/media-backup-$DATE.tar.gz /media

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR"
```

**Schedule daily backups:**

```bash
# Add to crontab
0 2 * * * /opt/validata/backup.sh >> /opt/validata/backup.log 2>&1

# View scheduled jobs
crontab -l
```

### Point-in-Time Recovery

```bash
# 1. Stop services
docker compose down

# 2. Remove current volumes
docker volume rm docker-deploy-package_validata_postgres_data

# 3. Create new volume
docker volume create docker-deploy-package_validata_postgres_data

# 4. Restore database
docker run --rm \
  -v docker-deploy-package_validata_postgres_data:/var/lib/postgresql/data \
  -v /opt/validata/backups:/backups \
  postgres:16-alpine \
  /bin/bash -c "cd /var/lib/postgresql/data && \
  gunzip < /backups/db-backup-20240511-020000.sql.gz | psql -U validata -d validata"

# 5. Restart services
docker compose up -d

# 6. Verify
docker compose logs postgres | tail -20
```

---

## Monitoring & Health Checks

### Container Health Monitoring

```bash
#!/bin/bash
# monitor.sh - Check service health

STATUS_OK=0
STATUS_WARN=1
STATUS_CRIT=2

# Check PostgreSQL
docker compose exec postgres pg_isready -U validata > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ PostgreSQL: Healthy"
else
    echo "✗ PostgreSQL: Failed"
    STATUS=$STATUS_CRIT
fi

# Check Redis
docker compose exec redis redis-cli ping | grep -q "PONG"
if [ $? -eq 0 ]; then
    echo "✓ Redis: Healthy"
else
    echo "✗ Redis: Failed"
    STATUS=$STATUS_CRIT
fi

# Check Nginx
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q "200"
if [ $? -eq 0 ]; then
    echo "✓ Nginx: Healthy"
else
    echo "✗ Nginx: Failed"
    STATUS=$STATUS_CRIT
fi

# Check API
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/v1/check-cip-setup/ | grep -q -E "^200|400"
if [ $? -eq 0 ]; then
    echo "✓ API: Healthy"
else
    echo "✗ API: Failed"
    STATUS=$STATUS_CRIT
fi

exit $STATUS
```

**Run health check:**

```bash
chmod +x monitor.sh
./monitor.sh

# Schedule monitoring every 5 minutes
*/5 * * * * /opt/validata/monitor.sh >> /var/log/validata-monitor.log 2>&1
```

### Log Aggregation

```bash
# View all logs in real-time
docker compose logs -f --tail 100

# View specific service logs
docker compose logs -f validata-api

# Export logs to file
docker compose logs --timestamps > logs-$(date +%Y%m%d).txt
```

---

## Scaling & Performance Tuning

### Horizontal Scaling

For high traffic, scale API instances:

```yaml
# docker-compose.yml
services:
  validata-api:
    deploy:
      replicas: 3  # Run 3 instances
    # Nginx will load balance across replicas
```

### Vertical Scaling (Resource Limits)

```yaml
services:
  validata-api:
    deploy:
      resources:
        limits:
          cpus: '4'        # Maximum 4 CPUs
          memory: 4G       # Maximum 4GB RAM
        reservations:
          cpus: '2'        # Reserve 2 CPUs
          memory: 2G       # Reserve 2GB RAM
```

### Database Query Optimization

```bash
# Enable query logging
docker compose exec postgres psql -U validata -d validata -c \
  "ALTER SYSTEM SET log_statement = 'all';"

# Check slow queries
docker compose exec postgres psql -U validata -d validata -c \
  "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

### Connection Pool Optimization

```yaml
# In Django settings (via .env or code)
DATABASES = {
    'default': {
        'CONN_MAX_AGE': 600,  # 10 minute persistent connection
        'OPTIONS': {
            'connect_timeout': 10,
        }
    }
}
```

---

## Updating & Patching

### Regular Updates

```bash
# 1. Pull latest images
docker compose pull

# 2. View changes
docker compose config

# 3. Update with zero downtime (rolling update)
docker compose up -d --no-deps postgres
docker compose up -d --no-deps redis
docker compose up -d --no-deps validata-api
docker compose up -d --no-deps nginx

# 4. Verify
docker compose ps
```

### Major Version Upgrade

```bash
# 1. Backup everything
./backup.sh

# 2. Test in staging first
# ... deploy to staging environment ...
# ... run full test suite ...

# 3. Schedule maintenance window
# Notify users of planned downtime

# 4. Backup production
./backup.sh

# 5. Update and restart
docker compose down
docker compose pull
docker compose build --pull
docker compose up -d

# 6. Run migrations
docker compose exec validata-api python manage.py migrate

# 7. Verify functionality
curl -I https://example.com/
```

### Emergency Rollback

```bash
# If update causes issues, revert quickly:

# 1. Stop current services
docker compose down

# 2. Use previous image version
VALIDATA_API_IMAGE=myregistry.azurecr.io/validata:v1.0.0 docker compose up -d

# 3. Restore previous database if needed
# (use backup restoration procedure)
```

---

**End of Deployment Guide**

For more information, see [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), or [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
