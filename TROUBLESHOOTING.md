# Troubleshooting Guide

**Document Version:** 1.0  
**Last Updated:** May 11, 2026

Comprehensive troubleshooting guide for diagnosing and resolving common issues in the Validata Docker deployment.

---

## Table of Contents

- [Diagnostic Workflow](#diagnostic-workflow)
- [Container & Service Issues](#container--service-issues)
- [Networking Issues](#networking-issues)
- [Database Issues](#database-issues)
- [Redis Cache Issues](#redis-cache-issues)
- [API & Backend Issues](#api--backend-issues)
- [Frontend & Nginx Issues](#frontend--nginx-issues)
- [Performance Issues](#performance-issues)
- [Data Persistence Issues](#data-persistence-issues)
- [Common Error Messages](#common-error-messages)
- [Emergency Recovery](#emergency-recovery)

---

## Diagnostic Workflow

### Step 1: Check Overall System Health

```bash
# See status of all containers
docker compose ps

# Expected output:
# NAME                STATUS              PORTS
# validata-nginx      Up (healthy)        0.0.0.0:8080->80/tcp
# validata-api        Up                  80/tcp, 9001/tcp
# validata-postgres   Up (healthy)        0.0.0.0:5432:5432/tcp
# validata-redis      Up (healthy)        0.0.0.0:6379:6379/tcp
```

### Step 2: Check Recent Logs

```bash
# See last 50 lines from all services
docker compose logs --tail 50

# Check specific service (most common issues)
docker compose logs validata-api --tail 100
docker compose logs validata-postgres --tail 50
docker compose logs validata-redis --tail 30
docker compose logs nginx --tail 50
```

### Step 3: Verify Connectivity

```bash
# Test accessibility
curl -I http://localhost:8080/                    # Frontend
curl -I http://localhost:8080/v1/check-cip-setup/ # API

# Test database
docker compose exec postgres psql -U validata -d validata -c "SELECT 1"

# Test Redis
docker compose exec redis redis-cli ping
```

### Step 4: Check Resource Usage

```bash
# Docker resource consumption
docker stats

# Host system resources
free -h              # RAM
df -h                # Disk
top -bn1 | head -20  # CPU processes
```

### Step 5: Inspect Service Details

```bash
# Detailed container info
docker inspect validata-api

# Network details
docker network inspect docker-deploy-package_default

# Volume details
docker volume inspect docker-deploy-package_validata_postgres_data
```

---

## Container & Service Issues

### Issue: "docker compose: command not found"

**Symptoms:**
```
docker compose: command not found
```

**Diagnosis:**
- Docker Compose not installed or not in PATH
- Version mismatch between Docker and Compose

**Solution:**
```bash
# Check Docker Compose installation
docker compose --version  # Should be 2.x+

# Install Docker Compose (if missing)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker compose --version

# Alternative: Use older docker-compose (v1)
docker-compose --version
# Then replace all `docker compose` with `docker-compose`
```

---

### Issue: "Cannot connect to Docker daemon"

**Symptoms:**
```
Cannot connect to Docker daemon at unix:///var/run/docker.sock. 
Is the docker daemon running?
```

**Diagnosis:**
- Docker daemon not running
- User doesn't have Docker socket permissions

**Solution:**
```bash
# Start Docker daemon
sudo systemctl start docker        # Linux

# macOS: Start Docker Desktop app  (GUI)

# Windows: Start Docker Desktop app (GUI)

# Add user to docker group (Linux)
sudo usermod -aG docker $USER
newgrp docker
docker ps  # Test without sudo

# Verify daemon running
docker info
```

---

### Issue: Containers Won't Start / Keep Crashing

**Symptoms:**
```
docker compose ps
# Shows: "Exit (1)" or "Restarting"

docker compose logs validata-api --tail 100
# Shows startup errors
```

**Diagnosis:**

1. **Check container exit code:**
```bash
docker inspect validata-api | grep State -A 5
# "ExitCode": 137 → Out of memory
# "ExitCode": 1   → Application error
```

2. **Check logs for errors:**
```bash
docker compose logs validata-api --tail 200 | grep -i error
```

**Solutions:**

**If Exit Code 137 (Out of Memory):**
```yaml
# docker-compose.yml - increase memory limit
services:
  validata-api:
    deploy:
      resources:
        limits:
          memory: 3G  # Increase from 2G
```

**If Django import errors:**
```bash
# Check environment variables
docker compose exec validata-api env | grep DJANGO

# Check Python packages
docker compose exec validata-api pip list

# Verify dependencies
docker compose exec validata-api pip install -r requirements.txt
```

**If PostgreSQL won't start:**
```bash
# Check postgres health
docker compose logs postgres --tail 100 | grep -i error

# Reset postgres (WARNING: deletes data)
docker compose down postgres
docker volume rm docker-deploy-package_validata_postgres_data
docker compose up -d postgres
```

---

### Issue: "service started but health check failing"

**Symptoms:**
```
validata-postgres    Up 30s (health: starting)
```

**Diagnosis:**

```bash
# Get detailed health check output
docker compose exec postgres pg_isready -U validata -d validata

# Check PostgreSQL logs
docker compose logs postgres --tail 50 | grep -i error
```

**Solutions:**

**PostgreSQL health check failing:**
```bash
# 1. Wait longer (sometimes takes 30-60s)
docker compose logs postgres -f  # Watch startup

# 2. Check if database actually created
docker compose exec postgres psql -U validata -l

# 3. Reset and reinitialize
docker compose down postgres
docker volume rm docker-deploy-package_validata_postgres_data
docker compose up -d postgres
docker compose logs postgres -f
```

**Redis health check failing:**
```bash
# Test redis directly
docker compose exec redis redis-cli ping
# Expected: PONG

# If failing, check Redis logs
docker compose logs redis --tail 50

# Restart Redis
docker compose restart redis
docker compose logs redis -f
```

---

## Networking Issues

### Issue: "Cannot reach application at localhost:8080"

**Symptoms:**
```
curl: (7) Failed to connect to localhost port 8080: Connection refused
```

**Diagnosis:**
```bash
# Check Nginx is running
docker compose ps | grep nginx
# Expected: "validata-nginx ... Up ... 0.0.0.0:8080->80/tcp"

# Check port binding
netstat -tuln | grep 8080
# Expected: tcp  0  0  0.0.0.0:8080  0.0.0.0:*  LISTEN

# Try direct container
docker compose logs nginx --tail 20
```

**Solutions:**

**If Nginx not running:**
```bash
docker compose up -d nginx
docker compose logs nginx -f
```

**If port already in use:**
```bash
# Find what's using port 8080
lsof -i :8080          # macOS/Linux
Get-NetTCPConnection -LocalPort 8080  # Windows PowerShell

# Kill process or use different port
# In docker-compose.yml:
ports:
  - "8000:80"  # Use 8000 instead

# Then access: http://localhost:8000
```

**If firewall blocking:**
```bash
# Allow port 8080 (Linux)
sudo ufw allow 8080

# macOS: System Preferences > Security & Privacy > Firewall Options
# Windows: Windows Defender Firewall > Allow app through firewall
```

---

### Issue: "Service can reach other services, but not backend API"

**Symptoms:**
```
Frontend loads (GET http://localhost:8080 → 200)
But API call fails (GET http://localhost:8080/v1/check-cip-setup → 500 or timeout)
```

**Diagnosis:**
```bash
# Check if API container is running
docker compose ps validata-api
# Expected: "Up"

# Check if API is listening on port 9001
docker compose exec validata-api ss -tuln | grep 9001
# Expected: tcp  LISTEN  0.0.0.0:9001

# Test direct connection to API
docker compose exec nginx curl -I http://validata-api:9001/
# Expected: 200 or 404 (any HTTP response, not timeout)

# Check Nginx logs for proxy errors
docker compose logs nginx --tail 50 | grep -i "error\|proxy\|504"
```

**Solutions:**

**If API not responding on port 9001:**
```bash
# Restart API
docker compose restart validata-api
docker compose logs validata-api -f

# Check API logs for startup errors
docker compose logs validata-api --tail 100 | grep -i "error\|traceback\|exception"
```

**If Nginx proxy timeout:**
```yaml
# docker-compose.yml - increase proxy timeout in Dockerfile.nginx
# Edit Dockerfile.nginx and add:

location /v1/ {
    proxy_pass http://validata-api:9001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Add timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

---

### Issue: "502 Bad Gateway" errors in browser

**Symptoms:**
```
HTTP 502 Bad Gateway
Bad Gateway
Nginx error
```

**Diagnosis:**
```bash
# Check Nginx logs
docker compose logs nginx --tail 50 | grep -E "502|error|proxy"

# Check if backend is responding
docker compose exec nginx curl http://validata-api:9001/
# If timeout or refused → backend issue

# Check backend status
docker compose ps validata-api
```

**Solutions:**

**Backend container crashed:**
```bash
# Restart backend
docker compose restart validata-api

# Check why it crashed
docker compose logs validata-api --tail 200 | tail -50
```

**Backend not listening:**
```bash
# Check if Gunicorn started
docker compose exec validata-api ps aux | grep gunicorn
# Should show gunicorn processes

# If not, check logs
docker compose logs validata-api | grep -i "error\|gunicorn\|wsgi"
```

---

## Database Issues

### Issue: "Cannot connect to database"

**Symptoms:**
```
Backend logs:
OperationalError: could not translate host name "postgres" to address
ConnectionError: connection to server at "postgres" (172.18.0.3), port 5432 failed
```

**Diagnosis:**
```bash
# Check PostgreSQL container
docker compose ps postgres
# Should show "Up (healthy)"

# Try to connect from host
docker compose exec validata-api psql -U validata -h postgres -d validata -c "SELECT 1"

# Check Docker network
docker network inspect docker-deploy-package_default | grep postgres
```

**Solutions:**

**PostgreSQL not running:**
```bash
docker compose up -d postgres
docker compose logs postgres -f
```

**Network isolation issue:**
```bash
# Restart all services to refresh network
docker compose restart

# Or recreate network
docker compose down
docker compose up -d
```

**Wrong credentials in .env:**
```bash
# Check .env file
cat .env | grep POSTGRES

# Verify database exists
docker compose exec postgres psql -U validata -l

# If database missing, create it
docker compose exec postgres psql -U validata -c "CREATE DATABASE validata;"
```

---

### Issue: "Database out of disk space"

**Symptoms:**
```
PostgreSQL logs:
FATAL: could not write to file "pg_wal/xlogm..."
ERROR: there is not enough disk space to complete this transaction
```

**Diagnosis:**
```bash
# Check disk usage
df -h | grep docker

# Check volume size
docker volume inspect docker-deploy-package_validata_postgres_data

# See data usage
du -sh /var/lib/docker/volumes/docker-deploy-package_validata_postgres_data/
```

**Solutions:**

**Backup and reset database:**
```bash
# Backup current data
docker compose exec postgres pg_dump -U validata validata > backup.sql

# Stop services
docker compose down

# Remove old volume
docker volume rm docker-deploy-package_validata_postgres_data

# Restart (will recreate volume)
docker compose up -d postgres

# Restore from backup (optional)
docker compose exec -T postgres psql -U validata validata < backup.sql
```

**Clean up old data:**
```bash
# Vacuum database (reclaim space)
docker compose exec postgres vacuumdb -U validata validata

# Vacuum and analyze
docker compose exec postgres vacuumdb -U validata -a -z validata
```

---

### Issue: "Database migrations not applied"

**Symptoms:**
```
Backend error:
relation "auth_user" does not exist
ProgrammingError: relation "xxx_table" does not exist
```

**Diagnosis:**
```bash
# Check what tables exist
docker compose exec postgres psql -U validata -d validata -c "\dt"

# Check if migrations were run
docker compose exec postgres psql -U validata -d validata -c "SELECT * FROM django_migrations LIMIT 5;"
```

**Solutions:**

**Run migrations manually:**
```bash
# Connect to backend container
docker compose exec validata-api bash

# Run migrations
python manage.py migrate
python manage.py migrate authy
python manage.py migrate core

# Check migration status
python manage.py showmigrations
```

**Create initial schema:**
```bash
# Create superuser
docker compose exec validata-api python manage.py createsuperuser

# Load fixtures (if available)
docker compose exec validata-api python manage.py loaddata initial_data.json
```

---

## Redis Cache Issues

### Issue: "Redis connection refused"

**Symptoms:**
```
Backend logs:
redis.exceptions.ConnectionError: Error -5 connecting to redis:6379
ConnectionRefusedError: [Errno 111] Connection refused
```

**Diagnosis:**
```bash
# Check Redis status
docker compose ps redis
# Expected: "Up (healthy)"

# Try direct connection
docker compose exec redis redis-cli ping
# Expected: PONG
```

**Solutions:**

**Redis not running:**
```bash
docker compose up -d redis
docker compose logs redis -f

# Wait for health check to pass
docker compose ps redis  # Should show (healthy)
```

**Redis memory full:**
```bash
# Check Redis stats
docker compose exec redis redis-cli info memory

# If maxmemory reached, clear cache
docker compose exec redis redis-cli FLUSHALL

# Or increase memory limit in docker-compose.yml
# (Set maxmemory in Redis command)
```

---

### Issue: "Session data lost after restart"

**Symptoms:**
```
After docker compose restart:
- User sessions cleared
- Cache invalidated
- Temporary data gone
```

**Cause:** Redis is configured with AOF persistence, but on startup the RDB file may be old.

**Solution - Verify Persistence:**
```bash
# Check Redis persistence mode
docker compose exec redis redis-cli CONFIG GET appendonly
# Should show: "appendonly" "yes"

# Check RDB/AOF files exist
docker volume inspect docker-deploy-package_validata_redis_data

# Verify AOF file is being written
docker compose exec redis redis-cli LASTSAVE
```

**If data loss unacceptable:**
```yaml
# docker-compose.yml - ensure persistence is enabled
services:
  redis:
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - validata_redis_data:/data
```

---

## API & Backend Issues

### Issue: "500 Internal Server Error"

**Symptoms:**
```
Browser:
HTTP 500 Internal Server Error

Backend logs:
ERROR - Internal Server Error: /v1/cip-setup/
Traceback (most recent call last):
  ...
  [Exception details]
```

**Diagnosis:**

1. **Check exception type:**
```bash
docker compose logs validata-api --tail 100 | grep -A 20 "Traceback"
```

2. **Common 500 causes:**
   - Redis not available → ConnectionError
   - Database error → OperationalError, ProgrammingError
   - Missing environment variables → KeyError, ValueError
   - Code bug → AttributeError, TypeError, etc.

**Solutions:**

**If Redis connection error:**
```bash
docker compose up -d redis
docker compose restart validata-api
```

**If database error:**
```bash
# Check database health
docker compose exec postgres pg_isready

# Check user exists
docker compose exec postgres psql -U validata -c "\du"

# Check database exists
docker compose exec postgres psql -U validata -l
```

**If missing environment variable:**
```bash
# Check .env file has all required variables
cat .env

# View what's set in container
docker compose exec validata-api env | sort

# Add missing variable to .env
nano .env
# Then restart
docker compose restart validata-api
```

---

### Issue: "405 Method Not Allowed"

**Symptoms:**
```
HTTP 405 Method Not Allowed
POST not allowed, only GET

Backend logs:
WARNING - "POST" /v1/some-endpoint/ 405
```

**Cause:** Endpoint only supports certain HTTP methods.

**Solution:**
```bash
# Check what methods are allowed
curl -X OPTIONS -v http://localhost:8080/v1/endpoint/
# Response headers will show: Allow: GET, HEAD, OPTIONS

# Use correct method
curl -X GET http://localhost:8080/v1/endpoint/

# If you need to POST, check endpoint definition
# Some endpoints are read-only
```

---

### Issue: "400 Bad Request"

**Symptoms:**
```
HTTP 400 Bad Request
JSON parse error or validation error

Response:
{"errors": [{"field": ["This field is required"]}]}
```

**Diagnosis:**
```bash
# Check request payload
# Ensure Content-Type: application/json

# Validate JSON is well-formed
echo '{"key": "value"}' | python -m json.tool
```

**Solutions:**

**Missing required fields:**
- Check API documentation for required fields
- Ensure all mandatory fields present in POST body

**Invalid JSON format:**
```bash
# Test API call with correct JSON
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}' \
  http://localhost:8080/v1/auth/api/login/
```

---

## Frontend & Nginx Issues

### Issue: "Blazor app won't load" or "blank page"

**Symptoms:**
```
Browser shows blank page
DevTools console shows errors:
- "Cannot find module..."
- "Failed to load .wasm file"
- JavaScript errors
```

**Diagnosis:**
```bash
# Check if HTML loads
curl -I http://localhost:8080/
# Expected: 200 OK

# Check Nginx is serving static files
curl -s http://localhost:8080/ | head -20
# Should show HTML

# Check assets load
curl -I http://localhost:8080/service-worker.js
curl -I http://localhost:8080/_framework/blazor.webassembly.js
```

**Solutions:**

**Nginx not serving files correctly:**
```bash
# Check Nginx config
docker compose exec nginx cat /etc/nginx/conf.d/default.conf

# Verify frontend files copied
docker compose exec nginx ls -la /usr/share/nginx/html/ | head -20

# Should see: index.html, service-worker.js, _framework/, etc.
```

**If files missing, rebuild Nginx:**
```bash
docker compose down nginx
docker compose build --pull nginx
docker compose up -d nginx
```

---

### Issue: "CSS/JavaScript not loading" or "wrong styling"

**Symptoms:**
```
Page loads but:
- No CSS styling applied
- JavaScript features not working
- Page looks broken
```

**Diagnosis:**
```bash
# Check asset requests in browser DevTools
# Look for 404s in Network tab

# Check Nginx logs
docker compose logs nginx --tail 50 | grep 404

# Test asset loading
curl -I http://localhost:8080/style.css
curl -I http://localhost:8080/js/app.js
```

**Solutions:**

**Cache issue:**
```bash
# Clear browser cache
# Ctrl+Shift+Delete (Chrome)
# Cmd+Shift+Delete (Safari)

# Or use curl with no-cache
curl -H "Cache-Control: no-cache" http://localhost:8080/
```

**Assets not deployed:**
```bash
# Check if files exist in image
docker compose exec nginx ls -la /usr/share/nginx/html/_framework/ | head

# Rebuild Nginx (copies files from API image)
docker compose build --pull nginx
docker compose up -d nginx
```

---

## Performance Issues

### Issue: "Application is slow" or "requests timing out"

**Symptoms:**
```
GET http://localhost:8080/v1/endpoint/ takes 30+ seconds
504 Gateway Timeout errors

Backend logs show slow query time
```

**Diagnosis:**
```bash
# Check container resource usage
docker stats

# See if one service is bottleneck
# Compare CPU/Memory percentages

# Check database query performance
docker compose exec postgres psql -U validata -d validata -c "\timing"
# Then run query

# Enable Django query logging to see slow queries
# (Add to Django settings.py):
LOGGING = {
    'loggers': {
        'django.db.backends': {
            'level': 'DEBUG',
        },
    },
}
```

**Solutions:**

**Increase resources:**
```yaml
# docker-compose.yml
services:
  validata-api:
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G

  postgres:
    deploy:
      resources:
        limits:
          cpus: "1"
          memory: 1G
```

**Increase Gunicorn workers:**
```yaml
# docker-compose.yml
services:
  validata-api:
    command: gunicorn server.wsgi:application \
      --bind 0.0.0.0:9001 \
      --workers 8 \      # Increase from 4
      --timeout 120
```

**Optimize database queries:**
```bash
# Add database indexes (contact developer)
# Use Django QuerySet.select_related() and prefetch_related()
# Cache frequently accessed data in Redis
```

---

### Issue: "High memory usage" or "out of memory"

**Symptoms:**
```
docker stats shows memory usage > 80%
docker compose ps shows "Exited (137)"  # Kill by OOM

System starts swapping or becomes unresponsive
```

**Diagnosis:**
```bash
# Check memory limits
docker inspect validata-api | grep -i memory

# See current usage
docker stats --no-stream validata-api

# Check for memory leaks
# (requires enabling Django memory profiling)
```

**Solutions:**

**Increase container memory limit:**
```yaml
# docker-compose.yml
services:
  validata-api:
    deploy:
      resources:
        limits:
          memory: 3G  # Increase from 2G
```

**Reduce Gunicorn workers:**
```yaml
command: gunicorn server.wsgi:application \
  --bind 0.0.0.0:9001 \
  --workers 2 \        # Reduce from 4
  --timeout 120
```

**Clear Redis cache:**
```bash
docker compose exec redis redis-cli FLUSHALL
```

---

## Data Persistence Issues

### Issue: "Data lost after docker compose down"

**Symptoms:**
```
After running: docker compose down
Then: docker compose up -d

All data is gone:
- Database empty
- Files missing
- Sessions cleared
```

**Diagnosis:**

This is intentional if using `-v` flag:
```bash
docker compose down -v  # -v removes volumes
# THIS DELETES DATA
```

**Prevention:**
```bash
# Do NOT use -v unless you want to delete data
docker compose down          # Keeps data (safe)
docker compose down -v       # Deletes data (risky)

# To permanently preserve data, commit volume to backup:
docker run --rm -v validata_postgres_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/db-backup.tar.gz /data
```

---

### Issue: "Cannot find volume after system reboot"

**Symptoms:**
```
docker compose ps shows containers with no data
All data appears lost
```

**Cause:** Docker volumes stored on host filesystem. If host rebooted without proper shutdown, volumes might be inaccessible.

**Diagnosis:**
```bash
# List all volumes
docker volume ls | grep validata

# Inspect volume
docker volume inspect docker-deploy-package_validata_postgres_data

# Check if volume still has data
docker run --rm -v validata_postgres_data:/data alpine ls -la /data
```

**Solutions:**

**Recover from backup:**
```bash
# List available backups
ls -la /path/to/backups/

# Restore from backup
docker volume create validata_postgres_data_new
docker run --rm -v validata_postgres_data_new:/data -v /path/to/backups:/backups \
  alpine tar xzf /backups/db-backup.tar.gz -C /data

# Test restore
docker compose exec postgres pg_isready
```

---

## Common Error Messages

### "Address already in use"

```
Error: bind: address already in use
```

**Cause:** Port 8080 (or another) already in use by another process

**Fix:**
```bash
# Find what's using port
lsof -i :8080

# Kill process or use different port
```

---

### "no such image: validata-fixed:local"

```
ERROR: no such image: validata-fixed:local
```

**Cause:** Nginx Dockerfile references image that doesn't exist

**Fix:**
```bash
# Check available images
docker images | grep validata

# If missing, need to obtain it:
# 1. Pull from registry
docker pull yourregistry.azurecr.io/validata-cip:1.0.1
docker tag yourregistry.azurecr.io/validata-cip:1.0.1 validata-fixed:local

# 2. Or build from Dockerfile.validata-fix
docker build -f Dockerfile.validata-fix -t validata-fixed:local .
```

---

### "health check for service failed"

```
ERROR: health check for service postgres failed
container exited with code 1
```

**Cause:** Health check command failed

**Fix:**
```bash
# Test health check manually
docker compose exec postgres pg_isready -U validata -d validata

# If fails, check why
docker compose logs postgres --tail 50
```

---

### "CORS error" or "Cross-origin blocked"

```
Browser console:
Access to XMLHttpRequest at 'http://localhost:8080/v1/...'
from origin '...' has been blocked by CORS policy
```

**Cause:** Django not configured for CORS or wrong origin

**Fix - Check CORS settings:**
```bash
# Verify CORS headers in response
curl -I http://localhost:8080/v1/check-cip-setup/
# Should show: Access-Control-Allow-Origin header

# Add CORS to Django settings (.env)
CORS_ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000
```

---

## Emergency Recovery

### Complete System Reset (WARNING: DELETES ALL DATA)

```bash
# ⚠️ WARNING: This deletes all data!

# 1. Stop all services
docker compose down

# 2. Remove all volumes (PERMANENT DATA LOSS)
docker volume rm docker-deploy-package_validata_postgres_data
docker volume rm docker-deploy-package_validata_redis_data
docker volume rm docker-deploy-package_validata_api_logs
docker volume rm docker-deploy-package_validata_api_media

# 3. Rebuild images
docker compose build --pull --no-cache

# 4. Start fresh
docker compose up -d

# 5. Wait for health checks
docker compose ps
# All should show "healthy" or "Up"
```

---

### Backup Before Reset

```bash
# Backup database
docker compose exec postgres pg_dump -U validata validata > validata-backup-$(date +%Y%m%d-%H%M%S).sql

# Backup Redis
docker run --rm -v validata_redis_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/redis-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data

# Backup media files
docker run --rm -v validata_api_media:/media -v $(pwd):/backup \
  alpine tar czf /backup/media-backup-$(date +%Y%m%d-%H%M%S).tar.gz /media
```

---

### Getting Detailed Logs for Support

```bash
# Collect comprehensive diagnostics
docker compose logs > diagnostics-$(date +%Y%m%d-%H%M%S).log

# Include system info
echo "=== Docker Version ===" >> diagnostics.log
docker version >> diagnostics.log

echo "=== Compose Version ===" >> diagnostics.log
docker compose version >> diagnostics.log

echo "=== System Info ===" >> diagnostics.log
docker system df >> diagnostics.log

echo "=== Container Status ===" >> diagnostics.log
docker compose ps -a >> diagnostics.log

echo "=== Volume Info ===" >> diagnostics.log
docker volume ls >> diagnostics.log

# Share diagnostics.log with support team
```

---

**End of Troubleshooting Guide**

For more information, see [README.md](README.md) or [ARCHITECTURE.md](ARCHITECTURE.md).
