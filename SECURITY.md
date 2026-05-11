# Security Best Practices

**Document Version:** 1.0  
**Last Updated:** May 11, 2026

Comprehensive security guidelines for deploying and operating the Validata system securely.

---

## Table of Contents

- [Security Overview](#security-overview)
- [Network Security](#network-security)
- [Authentication & Authorization](#authentication--authorization)
- [Data Protection](#data-protection)
- [Container Security](#container-security)
- [Database Security](#database-security)
- [API Security](#api-security)
- [Secrets Management](#secrets-management)
- [Monitoring & Auditing](#monitoring--auditing)
- [Incident Response](#incident-response)
- [Security Checklist](#security-checklist)

---

## Security Overview

### Security Principles

1. **Defense in Depth:** Multiple layers of security controls
2. **Least Privilege:** Grant minimum necessary permissions
3. **Encryption in Transit:** All data transmitted encrypted
4. **Encryption at Rest:** Sensitive data encrypted on disk
5. **Zero Trust:** Verify all requests, assume no trust
6. **Auditability:** Log and monitor all significant events

### Threat Model

**Consider these threats:**
- Unauthorized data access
- Man-in-the-middle attacks
- SQL injection and code injection
- DDoS attacks
- Container escape
- Supply chain attacks

---

## Network Security

### Firewall Configuration

**Block unauthorized traffic:**

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp        # SSH (management only)
sudo ufw allow 80/tcp        # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp       # HTTPS (production)
sudo ufw deny 5432/tcp       # PostgreSQL (internal only)
sudo ufw deny 6379/tcp       # Redis (internal only)
sudo ufw enable
```

**Cloud Provider Rules (AWS Security Groups, Azure NSG):**

```yaml
# Inbound
- Protocol: TCP
  Port: 443
  Source: 0.0.0.0/0 (or specific IPs)
  
- Protocol: TCP
  Port: 80
  Source: 0.0.0.0/0
  
- Protocol: TCP
  Port: 22
  Source: 10.0.0.0/8 (Management network only)

# Outbound
- Protocol: All
  Destination: 0.0.0.0/0
```

### Internal Network Isolation

**Docker Compose Network:**

```yaml
# docker-compose.yml
services:
  postgres:
    networks:
      - internal  # Only visible to internal network
    ports: []     # Don't expose to host
  
  redis:
    networks:
      - internal
    ports: []

  validata-api:
    networks:
      - internal
      - public
    ports: []

  nginx:
    networks:
      - public    # Only exposed service
    ports:
      - "443:443"
      - "80:80"

networks:
  internal:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
  
  public:
    driver: bridge
    ipam:
      config:
        - subnet: 172.21.0.0/16
```

### VPN/Bastion Host

For accessing databases remotely:

```bash
# Tunnel PostgreSQL through SSH
ssh -L 5432:postgres:5432 user@bastion-host

# Connect through tunnel
psql -h localhost -U validata -d validata
```

### TLS/SSL Configuration

**Nginx SSL Settings (Production):**

```nginx
# Dockerfile.nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# HSTS (enable after testing)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

---

## Authentication & Authorization

### Strong Password Requirements

**Enforce in Django:**

```python
# Django settings
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 12,  # Minimum 12 characters
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]
```

### Multi-Factor Authentication

**Enable 2FA in Django:**

```python
# Install django-otp
pip install django-otp qrcode

# Configure settings
INSTALLED_APPS = [
    ...
    'django_otp',
    'otp_plugins.otp_totp',
]

MIDDLEWARE = [
    ...
    'django_otp.middleware.OTPMiddleware',  # After AuthenticationMiddleware
]
```

### Session Security

**Secure Session Configuration:**

```python
# Django settings
SESSION_COOKIE_SECURE = True      # HTTPS only
SESSION_COOKIE_HTTPONLY = True    # No JavaScript access
SESSION_COOKIE_SAMESITE = 'Strict'  # CSRF protection
SESSION_COOKIE_AGE = 3600         # 1 hour
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
```

### JWT Token Security

**Token Configuration:**

```python
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': os.environ.get('DJANGO_SECRET_KEY'),
}
```

---

## Data Protection

### Encryption at Rest

**PostgreSQL Column Encryption:**

```sql
-- Enable pgcrypto (already enabled in init-validata.sql)
CREATE EXTENSION pgcrypto;

-- Encrypt sensitive columns
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    phone_encrypted BYTEA,  -- Encrypted phone number
    ssn_encrypted BYTEA,    -- Encrypted SSN
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert encrypted data
INSERT INTO users (id, email, phone_encrypted, ssn_encrypted)
VALUES (
    gen_random_uuid(),
    'user@example.com',
    encrypt('555-1234', 'encryption-key'::bytea, 'aes'),
    encrypt('123-45-6789', 'encryption-key'::bytea, 'aes')
);

-- Query encrypted data
SELECT email, decrypt(phone_encrypted, 'encryption-key'::bytea, 'aes')
FROM users
WHERE id = $1;
```

### Hashing Passwords

**Django automatic password hashing:**

```python
from django.contrib.auth import authenticate, get_user_model

User = get_user_model()

# Django automatically hashes passwords
user = User.objects.create_user(
    username='user@example.com',
    email='user@example.com',
    password='plaintext-password'  # Automatically hashed
)

# Verify password
user = authenticate(username='user@example.com', password='plaintext-password')
# Returns user if password correct, None otherwise
```

### Data Minimization

**Only collect necessary data:**

```python
# In Django models, only include required fields
class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    
    # Keep only essential data
    phone = models.CharField(max_length=20, blank=True)  # Optional
    address = models.TextField(blank=True)  # Optional
    
    # Don't store: credit cards, SSN, health records without encryption
```

### Data Retention Policy

```python
# Example: Delete user data after 90 days of inactivity
from django.utils import timezone
from datetime import timedelta

class DataRetentionTask:
    @staticmethod
    def delete_inactive_users():
        ninety_days_ago = timezone.now() - timedelta(days=90)
        
        inactive_users = User.objects.filter(
            last_login__lt=ninety_days_ago,
            is_active=False
        )
        
        # Delete with audit logging
        for user in inactive_users:
            AuditLog.objects.create(
                action='DELETE',
                model='User',
                object_id=user.id,
                reason='Data retention policy - 90 days inactive'
            )
            user.delete()
```

---

## Container Security

### Docker Image Security

**Scan for vulnerabilities:**

```bash
# Install trivy (vulnerability scanner)
sudo apt-get install wget apt-transport-https gnupg lsb-release
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | \
  sudo tee -a /etc/apt/sources.list.d/trivy.list
sudo apt-get update && sudo apt-get install trivy

# Scan Docker images
trivy image validata-fixed:local
trivy image validata-nginx:latest
trivy image postgres:16-alpine
trivy image redis:7.2-alpine
```

### Non-Root Containers

**Run containers as non-root user:**

```dockerfile
# Dockerfile.nginx
RUN useradd -m -u 1001 nginx-user
USER nginx-user

# Dockerfile.validata-fix
RUN useradd -m -u 1001 app-user
USER app-user
```

### Read-Only Filesystems

```yaml
# docker-compose.yml
services:
  validata-api:
    read_only: true  # Filesystem read-only
    tmpfs: ['/tmp', '/var/tmp']  # Temporary writable areas
    volumes:
      - validata_api_media:/app/media:rw  # Writable volume only
```

### Resource Limits

**Prevent resource exhaustion attacks:**

```yaml
services:
  validata-api:
    deploy:
      resources:
        limits:
          cpus: '2'           # Max 2 CPUs
          memory: 2G          # Max 2GB RAM
          pids_limit: 100     # Max 100 processes
        reservations:
          cpus: '1'
          memory: 1G
```

---

## Database Security

### PostgreSQL Configuration

**Secure PostgreSQL:**

```bash
# .env
POSTGRES_USER=validata_prod         # Not 'postgres'
POSTGRES_PASSWORD=STRONG-PASSWORD   # 64+ character random password

# PostgreSQL connection security
postgresql.conf:
ssl = on                        # Require SSL
ssl_cert_file = 'server.crt'   # Server certificate
ssl_key_file = 'server.key'    # Server key
password_encryption = 'scram-sha-256'  # Use SCRAM hashing

# Connection restrictions
pg_hba.conf:
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32           md5
host    all             all             ::1/128                md5
hostssl all             validata        172.20.0.0/16          scram-sha-256
```

### Row-Level Security

**Implement database-level access control:**

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY user_own_data ON users
    USING (user_id = current_user_id());

-- Policy: Admins can see all
CREATE POLICY admin_all ON users
    USING (is_admin = true);
```

### Audit Logging

**Log database changes:**

```sql
-- Create audit table
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address INET
);

-- Trigger function
CREATE OR REPLACE FUNCTION audit_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, operation, old_values, user_id)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), current_user_id());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, operation, old_values, new_values, user_id)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), row_to_json(NEW), current_user_id());
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, operation, new_values, user_id)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW), current_user_id());
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER users_audit
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION audit_changes();
```

---

## API Security

### CORS Configuration

**Restrict cross-origin requests:**

```python
# Django settings
from corsheaders.defaults import default_headers

CORS_ALLOWED_ORIGINS = [
    "https://example.com",
    "https://www.example.com",
    "https://app.example.com",
]

CORS_ALLOW_HEADERS = list(default_headers) + [
    'x-api-key',
]

CORS_ALLOW_METHODS = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
]

CORS_MAX_AGE = 600  # 10 minutes
```

### CSRF Protection

**Django CSRF protection (automatic):**

```python
# Django settings
MIDDLEWARE = [
    'django.middleware.csrf.CsrfViewMiddleware',  # Enabled by default
]

CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Strict'
CSRF_TRUSTED_ORIGINS = ['https://example.com']
```

### Input Validation

**Validate all inputs:**

```python
from rest_framework import serializers
from django.core.validators import EmailValidator, URLValidator

class UserSerializer(serializers.Serializer):
    email = serializers.EmailField(
        validators=[EmailValidator()],
        max_length=254
    )
    phone = serializers.RegexField(
        regex=r'^\+?1?\d{9,15}$',  # E.164 format
        required=False
    )
    website = serializers.URLField(
        validators=[URLValidator()],
        required=False
    )
    bio = serializers.CharField(
        max_length=500,
        allow_blank=True,
        required=False
    )

    def validate(self, data):
        # Cross-field validation
        if data.get('website') and data.get('bio'):
            if len(data['bio']) < 10:
                raise serializers.ValidationError(
                    "Bio must be at least 10 characters if provided"
                )
        return data
```

### SQL Injection Prevention

**Django ORM prevents SQL injection:**

```python
# ✅ SAFE - Django ORM parameterizes queries
users = User.objects.filter(email=email_input)

# ✅ SAFE - Using parameterized queries
from django.db import connection
cursor = connection.cursor()
cursor.execute("SELECT * FROM users WHERE email = %s", [email_input])

# ❌ DANGEROUS - Raw string concatenation (never do this!)
# cursor.execute(f"SELECT * FROM users WHERE email = '{email_input}'")
```

### Rate Limiting

**Install django-ratelimit:**

```bash
pip install django-ratelimit
```

**Apply to views:**

```python
from django_ratelimit.decorators import ratelimit

@ratelimit(key='user', rate='100/h', method='POST')
def login_view(request):
    # Limited to 100 POST requests per hour per user
    pass

@ratelimit(key='ip', rate='1000/h', method='GET')
def api_list_view(request):
    # Limited to 1000 GET requests per hour per IP
    pass
```

---

## Secrets Management

### Environment Variables

**Never hardcode secrets:**

```bash
# ✅ GOOD - Use environment variables
API_KEY = os.environ.get('API_KEY')
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

# ❌ BAD - Hardcoded secrets
API_KEY = 'abc123xyz789'
SECRET_KEY = 'my-secret-key-123'
```

### Secrets Vault (Production)

**Use Azure Key Vault:**

```python
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

credential = DefaultAzureCredential()
client = SecretClient(
    vault_url="https://my-vault.vault.azure.net/",
    credential=credential
)

# Retrieve secrets
database_password = client.get_secret("database-password").value
api_key = client.get_secret("api-key").value
```

**Or use AWS Secrets Manager:**

```python
import boto3

client = boto3.client('secretsmanager', region_name='us-east-1')

# Retrieve secret
response = client.get_secret_value(SecretId='database-password')
database_password = response['SecretString']
```

### Rotating Secrets

**Regular rotation schedule:**

```bash
#!/bin/bash
# rotate-secrets.sh

# Rotate database password
NEW_PASSWORD=$(openssl rand -base64 32)
ALTER USER validata WITH PASSWORD '$NEW_PASSWORD';

# Update secret in vault
az keyvault secret set --vault-name my-vault \
  --name database-password \
  --value "$NEW_PASSWORD"

# Update in .env (reload services)
echo "POSTGRES_PASSWORD=$NEW_PASSWORD" >> .env
docker compose restart validata-api postgres
```

**Schedule weekly rotation:**

```bash
# crontab
0 2 * * 0 /opt/validata/rotate-secrets.sh  # Every Sunday at 2 AM
```

---

## Monitoring & Auditing

### Access Logging

**Enable comprehensive logging:**

```python
# Django settings
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {name} {funcName}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': '/var/log/validata/access.log',
            'formatter': 'verbose',
        },
        'security_file': {
            'level': 'WARNING',
            'class': 'logging.FileHandler',
            'filename': '/var/log/validata/security.log',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django.security': {
            'handlers': ['security_file'],
            'level': 'WARNING',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['file'],
            'level': 'INFO',
        },
    },
}
```

### Intrusion Detection

**Monitor for suspicious activity:**

```bash
#!/bin/bash
# monitor-security.sh

# Check for multiple failed login attempts
FAILED_LOGINS=$(grep "invalid login attempt" /var/log/validata/security.log | \
  grep "$(date +%Y-%m-%d)" | wc -l)

if [ $FAILED_LOGINS -gt 10 ]; then
    echo "Alert: $FAILED_LOGINS failed logins in last 24 hours"
    # Send alert email/Slack
fi

# Check for unusual API activity
curl -s "http://localhost:8080/v1/api/stats/" | jq '.error_count'
if [ $(echo "$?" | jq '.') -gt 100 ]; then
    echo "Alert: High error rate detected"
fi
```

### Security Headers

**Add security headers to all responses:**

```nginx
# Dockerfile.nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" always;
```

---

## Incident Response

### Security Incident Procedure

**If breach is suspected:**

1. **Immediate Response (0-1 hour)**
   ```bash
   # 1. Stop compromised service
   docker compose down <service>
   
   # 2. Preserve logs
   docker compose logs > incident-logs-$(date +%s).txt
   
   # 3. Take snapshot
   docker volume inspect <volume> > volume-info.txt
   ```

2. **Investigation (1-24 hours)**
   - Review logs for when/how breach occurred
   - Identify affected data
   - Determine attacker identity/method

3. **Containment (24-48 hours)**
   ```bash
   # Change all credentials
   # Rotate database passwords
   # Revoke API keys
   # Reset user sessions
   docker compose exec postgres psql -U validata -d validata -c \
     "DELETE FROM auth_tokens;"
   ```

4. **Eradication (48-72 hours)**
   - Patch vulnerabilities
   - Rebuild containers from scratch
   - Update all dependencies
   - Re-deploy to clean infrastructure

5. **Recovery**
   - Restore from known-good backup
   - Verify no malicious code
   - Gradually bring systems online
   - Monitor for re-compromise

### Incident Communication

```markdown
# Security Incident Report

## Timeline
- 2024-05-11 10:30 UTC: Unauthorized access detected
- 2024-05-11 11:00 UTC: Services stopped and isolated
- 2024-05-11 14:00 UTC: Root cause identified

## Impact
- Affected Users: 150
- Data Exposed: User emails and phone numbers
- Data Accessed: No sensitive data (SSN/CC) exposed

## Actions Taken
- Reset all user sessions
- Forced password reset
- Enabled 2FA requirement
- Notified users via email

## Recommendations
- Review access logs regularly
- Implement WAF
- Conduct security audit
```

---

## Security Checklist

### Pre-Production

- [ ] Change default credentials (database, Redis, Django SECRET_KEY)
- [ ] Generate strong passwords (minimum 64 characters)
- [ ] Configure SSL/TLS certificates (Let's Encrypt or CA-signed)
- [ ] Enable firewall rules (block unnecessary ports)
- [ ] Configure network isolation (internal vs. public networks)
- [ ] Enable database encryption at rest
- [ ] Configure database backups (encrypted)
- [ ] Set up monitoring and alerting
- [ ] Scan containers for vulnerabilities (trivy)
- [ ] Run security audit (OWASP checklist)
- [ ] Implement rate limiting
- [ ] Enable request logging
- [ ] Configure CORS properly
- [ ] Enable HTTPS redirect
- [ ] Review Django security settings
- [ ] Test authentication mechanisms
- [ ] Document incident response plan

### Ongoing

- [ ] Review logs weekly for suspicious activity
- [ ] Rotate secrets monthly
- [ ] Update dependencies monthly
- [ ] Perform security scans (monthly/quarterly)
- [ ] Conduct access reviews (quarterly)
- [ ] Test disaster recovery (quarterly)
- [ ] Update security documentation
- [ ] Train team on security practices

---

**End of Security Best Practices**

For more information, see [README.md](README.md), [DEPLOYMENT.md](DEPLOYMENT.md), or [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
