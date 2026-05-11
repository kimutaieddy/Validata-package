# Maintenance & Operations

**Document Version:** 1.0  
**Last Updated:** May 11, 2026

Comprehensive operational procedures for monitoring, maintaining, and managing the Validata system in production.

---

## Table of Contents

- [Operational Overview](#operational-overview)
- [Daily Operations](#daily-operations)
- [Weekly Maintenance](#weekly-maintenance)
- [Monthly Maintenance](#monthly-maintenance)
- [Quarterly Operations](#quarterly-operations)
- [Log Management](#log-management)
- [Performance Tuning](#performance-tuning)
- [Backup & Restore](#backup--restore)
- [Upgrade Procedures](#upgrade-procedures)
- [Capacity Planning](#capacity-planning)

---

## Operational Overview

### Service Levels

**Expected Uptime:** 99.5% (43.8 minutes downtime per month)

**Response Times:**
- API endpoints: <200ms (p95)
- Frontend load: <2s (p95)
- Database queries: <100ms (p95)

### On-Call Rotation

**Establish on-call schedule:**

```
Week 1: Team Member A
Week 2: Team Member B
Week 3: Team Member C
Week 4: Team Member A (rotates)
```

**On-call contact information:**
```bash
# Create contact list
cat > on-call.txt << 'EOF'
Primary: Team Lead (+1-555-0001)
Secondary: Senior Ops (+1-555-0002)
Tertiary: Developer (+1-555-0003)
Escalation: Management (+1-555-0004)
EOF
```

### Incident Severity Levels

| Level | Response Time | Resolution SLA | Example |
|-------|---|---|---|
| P1 - Critical | 15 minutes | 2 hours | Complete service outage |
| P2 - High | 1 hour | 4 hours | Partial service degradation |
| P3 - Medium | 4 hours | 24 hours | Feature not working as expected |
| P4 - Low | 24 hours | 1 week | Documentation error |

---

## Daily Operations

### Morning Checklist (Start of Day)

```bash
#!/bin/bash
# daily-morning-check.sh

echo "=== Daily Morning Health Check ==="
echo ""

# 1. Check all services running
echo "1. Checking service status..."
docker compose ps
SERVICES=$(docker compose ps --services)

for service in $SERVICES; do
  STATUS=$(docker compose ps $service --format "{{.State}}")
  if [ "$STATUS" != "running" ]; then
    echo "⚠️  WARNING: $service is $STATUS"
  fi
done

# 2. Check disk usage
echo ""
echo "2. Checking disk usage..."
DISK_USAGE=$(df /var/lib/docker | awk 'NR==2 {print int($5)}')
if [ $DISK_USAGE -gt 80 ]; then
  echo "⚠️  WARNING: Disk usage at ${DISK_USAGE}%"
else
  echo "✓ Disk usage at ${DISK_USAGE}%"
fi

# 3. Check database connections
echo ""
echo "3. Checking database..."
docker compose exec postgres pg_isready -U validata
if [ $? -eq 0 ]; then
  echo "✓ Database healthy"
else
  echo "✗ Database down"
fi

# 4. Check Redis
echo ""
echo "4. Checking Redis..."
docker compose exec redis redis-cli ping
if [ $? -eq 0 ]; then
  echo "✓ Redis healthy"
else
  echo "✗ Redis down"
fi

# 5. Check API endpoint
echo ""
echo "5. Checking API..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/v1/check-cip-setup/)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✓ API healthy (HTTP $HTTP_CODE)"
else
  echo "⚠️  API returned HTTP $HTTP_CODE"
fi

echo ""
echo "=== End Daily Check ==="
```

**Run daily:**
```bash
chmod +x daily-morning-check.sh
./daily-morning-check.sh
```

### Log Review

**Check for errors daily:**

```bash
#!/bin/bash
# daily-log-review.sh

echo "=== Daily Log Review ==="
echo ""

# Check for critical errors in past 24 hours
echo "Critical errors in past 24 hours:"
docker compose logs --since 24h | grep -i "critical\|error\|exception" | tail -20

# Check for 5xx errors
echo ""
echo "API 5xx errors in past 24 hours:"
docker compose logs nginx --since 24h | grep "5[0-9][0-9] " | wc -l

# Check for unauthorized access attempts
echo ""
echo "Authentication failures:"
docker compose logs validata-api --since 24h | grep -i "authentication\|unauthorized" | wc -l

echo ""
echo "=== End Log Review ==="
```

### Monitoring Dashboard

**Create basic monitoring dashboard:**

```bash
#!/bin/bash
# monitor-dashboard.sh - Real-time monitoring

while true; do
  clear
  echo "╔════════════════════════════════════════════════╗"
  echo "║         VALIDATA SYSTEM STATUS MONITOR         ║"
  echo "║         $(date)                  ║"
  echo "╚════════════════════════════════════════════════╝"
  echo ""
  
  echo "Container Status:"
  docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
  
  echo ""
  echo "Service Health:"
  docker compose ps --format "table {{.Service}}\t{{.Status}}"
  
  echo ""
  echo "Recent Errors:"
  docker compose logs --tail 5 | grep -i error || echo "No errors"
  
  echo ""
  echo "Press Ctrl+C to exit | Refreshing in 30s..."
  sleep 30
done
```

---

## Weekly Maintenance

### Weekly Tasks

**Every Monday:**

```bash
#!/bin/bash
# weekly-maintenance.sh

echo "=== Weekly Maintenance Tasks ==="

# 1. Review security logs
echo "1. Reviewing security logs..."
grep -i "unauthorized\|forbidden\|denied" /var/log/validata/*.log | wc -l
echo "   (unauthorized access attempts)"

# 2. Test backup
echo "2. Testing backup restoration..."
docker compose exec postgres pg_dump -U validata validata | \
  wc -l && echo "   ✓ Backup test successful"

# 3. Review database size
echo "3. Database size..."
docker compose exec postgres psql -U validata -d validata -c \
  "SELECT pg_size_pretty(pg_database_size('validata'));"

# 4. Vacuum database
echo "4. Vacuuming database..."
docker compose exec postgres vacuumdb -U validata -a -z

# 5. Update container images
echo "5. Checking for image updates..."
docker compose pull

# 6. Review disk usage
echo "6. Disk usage analysis..."
du -sh /var/lib/docker/volumes/*

# 7. User activity report
echo "7. Weekly activity summary..."
docker compose logs --since 7 days | grep -i "login\|error" | wc -l
echo "   (login attempts and errors)"

echo ""
echo "=== Weekly Maintenance Complete ==="
```

### Capacity Planning Review

**Weekly review:**

```bash
#!/bin/bash
# capacity-review.sh

echo "=== Capacity Planning Review ==="
echo ""

# CPU usage trend
echo "CPU Usage:"
docker stats --no-stream --format "{{.Container}}: {{.CPUPerc}}"

# Memory usage trend
echo ""
echo "Memory Usage:"
docker stats --no-stream --format "{{.Container}}: {{.MemUsage}}"

# Disk usage trend
echo ""
echo "Disk Space:"
df -h /var/lib/docker | tail -1
echo ""
echo "Docker Volumes:"
du -sh /var/lib/docker/volumes/* | sort -h

# Database growth
echo ""
echo "Database Growth Rate (last 7 days):"
# Requires historical tracking - implement separately

# Network I/O
echo ""
echo "Network Statistics:"
docker stats --no-stream --format "{{.Container}}: (In: {{.NetInput}}, Out: {{.NetOutput}})"

echo ""
echo "Recommendations:"
if [ $(docker stats --no-stream --format "{{.CPUPerc}}" | head -1 | sed 's/%//') -gt 80 ]; then
  echo "- Consider increasing CPU resources"
fi

if [ $(df /var/lib/docker | awk 'NR==2 {print $5}' | sed 's/%//') -gt 80 ]; then
  echo "- Consider increasing disk space"
fi

echo ""
echo "=== End Capacity Review ==="
```

---

## Monthly Maintenance

### Full System Health Assessment

**First of each month:**

```bash
#!/bin/bash
# monthly-assessment.sh

echo "=== Monthly System Health Assessment ==="
echo ""

# 1. Security audit
echo "1. Security Audit"
echo "   - Review access logs"
docker compose logs --since 30 days | grep -i "denied\|unauthorized" | wc -l

echo "   - Check for failed logins"
docker compose logs --since 30 days | grep -i "login failed" | wc -l

# 2. Performance metrics
echo ""
echo "2. Performance Metrics"
echo "   - Average API response time"
# Parse logs for timing data

echo "   - Error rate"
docker compose logs --since 30 days | grep -c "ERROR"

# 3. Dependency updates
echo ""
echo "3. Dependency Updates Available"
docker compose build --dry-run 2>&1 | grep -i "update\|newer" | wc -l

# 4. Storage efficiency
echo ""
echo "4. Storage Analysis"
docker volume ls --format "table {{.Name}}\t{{.Driver}}"

# 5. Configuration validation
echo ""
echo "5. Configuration Validation"
docker compose config > /dev/null 2>&1 && echo "   ✓ docker-compose.yml valid"

# 6. Backup verification
echo ""
echo "6. Backup Verification"
BACKUP_AGE=$(($(date +%s) - $(stat -f%m /opt/validata/backups/latest.sql.gz 2>/dev/null || echo 0)))
if [ $BACKUP_AGE -lt 86400 ]; then
  echo "   ✓ Recent backup available"
else
  echo "   ⚠️  No recent backup"
fi

# 7. Generate report
echo ""
echo "7. Monthly Report"
echo "   - Generating performance report..."

cat > monthly-report-$(date +%Y%m).md << 'REPORT'
# Monthly Operational Report

## System Status
- Uptime: ?
- Error Rate: ?
- Average Response Time: ?

## Incidents
- Critical: 0
- High: 1
- Medium: 2

## Capacity
- Disk Usage: ?
- Memory Peak: ?
- CPU Peak: ?

## Security
- Unauthorized Access Attempts: ?
- Policy Violations: 0
- Vulnerabilities Found: 0

## Recommendations
1. Continue monitoring
2. Plan capacity upgrade if needed
3. Review security logs
REPORT

echo "   ✓ Report saved to monthly-report-$(date +%Y%m).md"

echo ""
echo "=== End Monthly Assessment ==="
```

### Software Updates

**Plan updates for monthly maintenance:**

```bash
#!/bin/bash
# monthly-updates.sh

echo "=== Monthly Software Updates ==="
echo ""

# 1. Pull latest base images
echo "1. Pulling latest base images..."
docker pull postgres:16-alpine
docker pull redis:7.2-alpine
docker pull nginx:1.27-alpine

# 2. Check for dependency updates
echo ""
echo "2. Checking for dependency updates..."
# For each Dockerfile, check for available updates

# 3. Review and test
echo ""
echo "3. Review Updates"
echo "   - Review changelog for breaking changes"
echo "   - Test in staging environment first"
echo "   - Get approval before production deployment"

# 4. Schedule update window
echo ""
echo "4. Scheduling Update Window"
echo "   - Plan 2-hour maintenance window"
echo "   - Notify users in advance"
echo "   - Prepare rollback plan"

# 5. Execute update (after approval)
# docker compose build --pull
# docker compose up -d

echo ""
echo "=== Monthly Updates Planned ==="
```

---

## Quarterly Operations

### Full System Audit

**Every 3 months:**

```bash
#!/bin/bash
# quarterly-audit.sh

echo "=== Quarterly System Audit ==="
echo ""

# 1. Security audit
echo "1. Comprehensive Security Audit"
docker compose logs --since 90 days | grep -i "error\|warning\|exception" | wc -l
echo "   - Review logs for anomalies"

# 2. Database integrity check
echo ""
echo "2. Database Integrity Check"
docker compose exec postgres psql -U validata -d validata << EOF
  SELECT schemaname, tablename, 
         pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
  FROM pg_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
EOF

# 3. Data consistency verification
echo ""
echo "3. Data Consistency"
echo "   - Check for orphaned records"
echo "   - Verify referential integrity"
echo "   - Review deleted records"

# 4. Capacity planning
echo ""
echo "4. Capacity Planning Review"
echo "   - Analyze usage trends"
echo "   - Project resource needs"
echo "   - Plan for growth"

# 5. Disaster recovery test
echo ""
echo "5. Disaster Recovery Test"
echo "   - Test backup restoration"
echo "   - Verify recovery time objective (RTO)"
echo "   - Verify recovery point objective (RPO)"

# 6. Documentation review
echo ""
echo "6. Documentation Review"
echo "   - Update runbooks"
echo "   - Review procedures"
echo "   - Document lessons learned"

echo ""
echo "=== Quarterly Audit Complete ==="
```

### Disaster Recovery Drill

**Every 90 days:**

```bash
#!/bin/bash
# dr-drill.sh - Disaster Recovery Drill

echo "=== Disaster Recovery Drill ==="
echo ""

echo "PHASE 1: Preparation"
echo "- Target: Restore to separate environment"
echo "- Time: $(date)"
echo ""

echo "PHASE 2: Data Retrieval"
# Retrieve latest backup
BACKUP_FILE="/opt/validata/backups/latest.sql.gz"
if [ -f "$BACKUP_FILE" ]; then
  echo "✓ Backup found: $BACKUP_FILE"
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "  Size: $BACKUP_SIZE"
  BACKUP_AGE=$(($(date +%s) - $(stat -f%m "$BACKUP_FILE" 2>/dev/null)))
  echo "  Age: $((BACKUP_AGE / 3600)) hours"
else
  echo "✗ Backup not found"
  exit 1
fi

echo ""
echo "PHASE 3: Restoration"
START_TIME=$(date +%s)

# Create temporary database
docker exec validata-postgres psql -U validata -c \
  "CREATE DATABASE validata_dr;"

# Restore from backup
gunzip < "$BACKUP_FILE" | \
  docker exec -i validata-postgres psql -U validata -d validata_dr

END_TIME=$(date +%s)
RESTORE_TIME=$((END_TIME - START_TIME))

echo "✓ Restoration complete"
echo "  Recovery Time: ${RESTORE_TIME}s"
echo "  RTO Target: 1800s (30 minutes)"
if [ $RESTORE_TIME -lt 1800 ]; then
  echo "  Status: PASS"
else
  echo "  Status: FAIL - Exceeds RTO"
fi

echo ""
echo "PHASE 4: Verification"
# Verify data
docker exec validata-postgres psql -U validata -d validata_dr -c \
  "SELECT COUNT(*) FROM users;" 

echo ""
echo "PHASE 5: Cleanup"
# Drop temporary database
docker exec validata-postgres psql -U validata -c \
  "DROP DATABASE validata_dr;"

echo "✓ Drill complete"
echo ""
echo "=== End DR Drill ==="
```

---

## Log Management

### Log Rotation

**Prevent log files from growing indefinitely:**

```yaml
# docker-compose.yml
services:
  validata-api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"        # Rotate when file reaches 10MB
        max-file: "10"         # Keep last 10 rotated logs
        labels: "service=api"
  
  postgres:
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
        labels: "service=database"
  
  redis:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service=cache"
  
  nginx:
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "7"
        labels: "service=proxy"
```

### Log Archival

**Archive and compress old logs:**

```bash
#!/bin/bash
# archive-logs.sh - Run weekly

ARCHIVE_DIR="/opt/validata/log-archive"
mkdir -p "$ARCHIVE_DIR"

# Find logs older than 7 days
find /var/lib/docker/containers -name "*.log" -mtime +7 | while read logfile; do
  gzip "$logfile"
  mv "${logfile}.gz" "$ARCHIVE_DIR/"
done

# Remove archives older than 90 days
find "$ARCHIVE_DIR" -name "*.gz" -mtime +90 -delete

echo "✓ Logs archived"
```

### Log Analysis

**Regular log analysis:**

```bash
#!/bin/bash
# analyze-logs.sh

echo "=== Log Analysis Report ==="
echo ""

# API errors by type
echo "Top API Errors:"
docker compose logs validata-api --since 24h | \
  grep -i "error" | \
  cut -d: -f2 | \
  sort | uniq -c | sort -rn | head -10

# Database slow queries
echo ""
echo "Slow Database Queries:"
docker compose logs postgres --since 24h | \
  grep "duration:" | \
  awk '{print $NF}' | \
  sort -n | tail -5

# HTTP status codes
echo ""
echo "HTTP Status Code Distribution:"
docker compose logs nginx --since 24h | \
  grep -oE '"[0-9]{3}"' | \
  sort | uniq -c | sort -rn

# Disk space warnings
echo ""
echo "Resource Warnings:"
docker compose logs --since 24h | \
  grep -i "disk\|memory\|cpu" | wc -l
echo "   (resource warnings)"

echo ""
echo "=== End Analysis ==="
```

---

## Performance Tuning

### Database Query Optimization

**Monitor slow queries:**

```bash
#!/bin/bash
# monitor-slow-queries.sh

# Enable slow query logging
docker compose exec postgres psql -U validata -c \
  "ALTER SYSTEM SET log_min_duration_statement = 1000;"  # 1 second threshold

# Reload configuration
docker compose exec postgres psql -U validata -c \
  "SELECT pg_reload_conf();"

# View slow queries
docker compose exec postgres psql -U validata -c \
  "SELECT query, calls, mean_time FROM pg_stat_statements 
   WHERE mean_time > 1000 
   ORDER BY mean_time DESC LIMIT 10;"
```

### Caching Strategy

**Optimize cache usage:**

```bash
#!/bin/bash
# cache-optimization.sh

echo "=== Cache Analysis ==="
echo ""

# Redis memory usage
echo "Redis Memory Usage:"
docker compose exec redis redis-cli INFO memory | grep "used_memory_human"

# Cache hit rate
echo ""
echo "Cache Statistics:"
docker compose exec redis redis-cli INFO stats | grep -E "hits|misses"

# Eviction policy
echo ""
echo "Eviction Policy:"
docker compose exec redis redis-cli CONFIG GET maxmemory-policy

# Cache recommendations
echo ""
echo "Cache Optimization Recommendations:"
echo "1. Monitor hit/miss ratio"
echo "2. Adjust maxmemory if needed"
echo "3. Review eviction policy"
echo "4. Use cache-aside pattern for expensive queries"

echo ""
echo "=== End Cache Analysis ==="
```

### Connection Pool Optimization

**Django database connection pooling:**

```python
# Django settings
import os
from django.conf import settings

if os.environ.get('USE_PGBOUNCER'):
    # Using PgBouncer connection pooler
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': 'validata',
            'USER': 'validata',
            'PASSWORD': os.environ.get('DATABASE_PASSWORD'),
            'HOST': 'pgbouncer',
            'PORT': '6432',
            'CONN_MAX_AGE': 0,  # Disable persistent connections
            'OPTIONS': {
                'connect_timeout': 10,
            }
        }
    }
else:
    # Using direct connections with pooling
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': 'validata',
            'USER': 'validata',
            'PASSWORD': os.environ.get('DATABASE_PASSWORD'),
            'HOST': 'postgres',
            'PORT': '5432',
            'CONN_MAX_AGE': 600,  # 10 minute persistent connections
            'OPTIONS': {
                'connect_timeout': 10,
            }
        }
    }
```

---

## Backup & Restore

### Automated Backup Schedule

```bash
#!/bin/bash
# automated-backup.sh - Run via cron

BACKUP_DIR="/opt/validata/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db-backup-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Backup database
docker compose exec -T postgres pg_dump -U validata validata \
  | gzip > "$BACKUP_FILE"

# Backup Redis
docker run --rm \
  -v validata_redis_data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/redis-backup-$TIMESTAMP.tar.gz /data

# Verify backup
if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✓ Backup complete: $BACKUP_FILE ($SIZE)"
  
  # Keep only last 30 days
  find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete
else
  echo "✗ Backup failed"
  exit 1
fi
```

**Schedule in crontab:**

```bash
# Run daily at 2 AM
0 2 * * * /opt/validata/automated-backup.sh >> /var/log/validata-backup.log 2>&1

# Run weekly backup to remote storage
0 3 * * 0 /opt/validata/backup-to-remote.sh >> /var/log/validata-backup.log 2>&1
```

### Restore Procedure

**Detailed restore steps:**

```bash
#!/bin/bash
# restore-backup.sh <backup_file>

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

echo "=== Restoring from backup ==="
echo "File: $BACKUP_FILE"
echo ""

# 1. Verify backup exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "✗ Backup file not found"
  exit 1
fi

echo "1. Stopping services..."
docker compose down

echo "2. Removing old database..."
docker volume rm docker-deploy-package_validata_postgres_data

echo "3. Creating new volume..."
docker volume create docker-deploy-package_validata_postgres_data

echo "4. Starting PostgreSQL..."
docker compose up -d postgres

# Wait for database to be ready
echo "5. Waiting for database to initialize..."
for i in {1..60}; do
  if docker compose exec postgres pg_isready -U validata > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "6. Restoring database..."
gunzip < "$BACKUP_FILE" | \
  docker compose exec -T postgres psql -U validata validata

echo "7. Verifying restoration..."
docker compose exec postgres psql -U validata -d validata -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema');"

echo "8. Starting remaining services..."
docker compose up -d

echo ""
echo "✓ Restoration complete"
echo ""
echo "Verification:"
docker compose ps
```

---

## Upgrade Procedures

### Planning an Upgrade

**Pre-upgrade checklist:**

```markdown
# Upgrade Planning Checklist

## Before Upgrade
- [ ] Schedule maintenance window (notify users)
- [ ] Create full backup
- [ ] Document current version
- [ ] Review changelog for breaking changes
- [ ] Test in staging environment
- [ ] Prepare rollback plan
- [ ] Notify on-call team

## During Upgrade
- [ ] Stop accepting new requests
- [ ] Execute backup
- [ ] Update images
- [ ] Rebuild containers
- [ ] Run migrations
- [ ] Verify functionality
- [ ] Monitor error logs

## After Upgrade
- [ ] Verify all services running
- [ ] Run smoke tests
- [ ] Monitor for anomalies
- [ ] Document changes
- [ ] Update documentation
- [ ] Notify completion

## Rollback (if needed)
- [ ] Stop services
- [ ] Restore from pre-upgrade backup
- [ ] Roll back image versions
- [ ] Restart services
- [ ] Verify operations
```

### Minor Version Upgrade

**Safe upgrade for patch versions:**

```bash
#!/bin/bash
# upgrade-minor.sh

echo "=== Minor Version Upgrade ==="
echo ""

# 1. Backup
echo "1. Creating backup..."
docker compose exec -T postgres pg_dump -U validata validata | \
  gzip > backup-pre-upgrade-$(date +%s).sql.gz

# 2. Pull new images
echo "2. Pulling latest images..."
docker compose pull

# 3. Rebuild
echo "3. Rebuilding containers..."
docker compose build --pull

# 4. Update services one by one
echo "4. Updating services..."
for service in postgres redis validata-api nginx; do
  echo "   Updating $service..."
  docker compose up -d --no-deps $service
  sleep 10
done

# 5. Verify
echo "5. Verifying..."
docker compose ps

# 6. Check status
echo ""
curl -I http://localhost:8080/v1/check-cip-setup/

echo ""
echo "✓ Upgrade complete"
```

### Major Version Upgrade

**Requires more careful planning:**

```bash
#!/bin/bash
# upgrade-major.sh

echo "=== Major Version Upgrade ==="
echo ""

echo "PRE-UPGRADE CHECKS"
echo "1. Full backup created?"
read -p "   Confirm (y/n): " confirm
[ "$confirm" != "y" ] && echo "Cancelled" && exit 1

echo "2. Staging test completed?"
read -p "   Confirm (y/n): " confirm
[ "$confirm" != "y" ] && echo "Cancelled" && exit 1

echo "3. Breaking changes reviewed?"
read -p "   Confirm (y/n): " confirm
[ "$confirm" != "y" ] && echo "Cancelled" && exit 1

echo ""
echo "PROCEEDING WITH UPGRADE"

# Stop all services
docker compose down

# Update images
docker compose build --pull --no-cache

# Start services
docker compose up -d

# Wait for health checks
echo "Waiting for services to be healthy..."
for i in {1..60}; do
  HEALTHY=$(docker compose ps --format "{{.Health}}" | grep -c "healthy")
  if [ $HEALTHY -eq 3 ]; then
    echo "✓ All services healthy"
    break
  fi
  sleep 5
done

# Run migrations
echo "Running migrations..."
docker compose exec validata-api python manage.py migrate

# Verify
echo "Verification:"
docker compose ps
curl -I http://localhost:8080/

echo ""
echo "✓ Major upgrade complete"
```

---

## Capacity Planning

### Monitoring Resource Usage

```bash
#!/bin/bash
# resource-monitor.sh

# Track CPU usage
echo "CPU Usage: $(docker stats --no-stream --format '{{.CPUPerc}}' | head -1)"

# Track Memory usage
echo "Memory Usage: $(docker stats --no-stream --format '{{.MemUsage}}' | head -1)"

# Track Disk usage
echo "Disk Usage: $(df /var/lib/docker | awk 'NR==2 {printf "%.0f%%\n", $5}')"

# Track Database size
echo "Database Size:"
docker compose exec postgres psql -U validata -d validata -c \
  "SELECT pg_size_pretty(pg_database_size('validata'));"
```

### Scaling Recommendations

**When to scale:**

| Metric | Current | Recommended Action |
|--------|---------|---|
| CPU | >80% consistently | Add more CPU cores, reduce workers |
| Memory | >85% | Increase container memory limits |
| Disk | >80% | Clean up logs, increase volume size |
| Database connections | >80 of max | Scale read replicas, optimize queries |
| API response time | >500ms | Scale API instances, cache more |

---

**End of Maintenance & Operations Guide**

For more information, see [README.md](README.md), [DEPLOYMENT.md](DEPLOYMENT.md), or [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
