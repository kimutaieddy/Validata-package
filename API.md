# API Reference

**Document Version:** 1.0  
**Last Updated:** May 11, 2026

Comprehensive API endpoint documentation with request/response formats, authentication, and integration patterns.

---

## Table of Contents

- [API Overview](#api-overview)
- [Authentication](#authentication)
- [Core Endpoints](#core-endpoints)
- [Request Formats](#request-formats)
- [Response Formats](#response-formats)
- [Error Handling](#error-handling)
- [Common Patterns](#common-patterns)
- [Integration Examples](#integration-examples)
- [Rate Limiting](#rate-limiting)
- [Webhooks](#webhooks)

---

## API Overview

### Base URL

**Development:**
```
http://localhost:8080/v1
```

**Staging:**
```
https://staging-api.example.com/v1
```

**Production:**
```
https://api.example.com/v1
```

### API Version

- **Current Version:** v1
- **Protocol:** HTTP/HTTPS
- **Format:** JSON
- **Character Encoding:** UTF-8

### Versioning Strategy

API endpoints are versioned with `/v1/`, `/v2/`, etc. New major versions are released when breaking changes occur. Old versions remain available for 12 months after deprecation notice.

---

## Authentication

### Authentication Methods

#### 1. Session-Based Authentication (for Web UI)

Used when accessing from browser:

```bash
# Login
curl -X POST http://localhost:8080/v1/auth/api/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Response includes session cookie in Set-Cookie header
# Subsequent requests include cookie automatically
```

#### 2. Token-Based Authentication (for API Clients)

For programmatic access:

```bash
# Obtain token
curl -X POST http://localhost:8080/v1/auth/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Response:
{
  "token": "abc123def456...",
  "expires_in": 3600,
  "user": {...}
}

# Use token in Authorization header
curl -X GET http://localhost:8080/v1/api/user/profile/ \
  -H "Authorization: Token abc123def456..."
```

#### 3. API Key Authentication (for Service-to-Service)

For service integrations:

```bash
# Request with API key
curl -X GET http://localhost:8080/v1/api/data/ \
  -H "X-API-Key: your-api-key-here"
```

### Authentication Headers

| Header | Purpose | Example |
|--------|---------|---------|
| `Authorization` | Bearer token | `Authorization: Token abc123...` |
| `X-API-Key` | API key | `X-API-Key: sk-live-abc123...` |
| `Content-Type` | Request format | `Content-Type: application/json` |

---

## Core Endpoints

### System Health

#### GET `/check-cip-setup/`

**Purpose:** Check if system is ready for CIP setup

**Request:**
```bash
curl -X GET http://localhost:8080/v1/check-cip-setup/
```

**Response (200 OK):**
```json
{
  "ready": true,
  "database": "connected",
  "cache": "connected",
  "services": {
    "database": "healthy",
    "cache": "healthy",
    "filestore": "healthy"
  }
}
```

**Response (503 Service Unavailable):**
```json
{
  "ready": false,
  "database": "disconnected",
  "cache": "disconnected",
  "error": "Required services not available"
}
```

---

### Authentication

#### POST `/auth/api/login/`

**Purpose:** Authenticate user and obtain session/token

**Request:**
```bash
curl -X POST http://localhost:8080/v1/auth/api/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "secure-password",
    "remember": false
  }'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User email address |
| `password` | string | Yes | User password (hashed on transmission) |
| `remember` | boolean | No | Keep session active longer |

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "permissions": ["read", "write", "admin"]
  },
  "token": "abc123def456...",
  "expires_in": 3600
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "errors": {
    "email": ["This field is required"],
    "password": ["Invalid password"]
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

#### POST `/auth/api/logout/`

**Purpose:** End user session

**Request:**
```bash
curl -X POST http://localhost:8080/v1/auth/api/logout/ \
  -H "Authorization: Token abc123..."
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### POST `/auth/api/refresh/`

**Purpose:** Refresh authentication token

**Request:**
```bash
curl -X POST http://localhost:8080/v1/auth/api/refresh/ \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "refresh-token-here"
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "new-token-abc123...",
  "expires_in": 3600
}
```

---

### CIP Setup

#### POST `/cip-setup/`

**Purpose:** Initialize CIP (Customer Information Platform) setup

**Request:**
```bash
curl -X POST http://localhost:8080/v1/cip-setup/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token abc123..." \
  -d '{
    "server_url": "https://cip-server.example.com",
    "api_key": "cip-api-key-here",
    "client_id": "client-id-here",
    "client_secret": "client-secret-here",
    "environment": "production"
  }'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `server_url` | string | Yes | CIP server endpoint |
| `api_key` | string | Yes | API key for CIP access |
| `client_id` | string | Yes | OAuth client ID |
| `client_secret` | string | Yes | OAuth client secret |
| `environment` | string | No | Environment (dev/staging/production) |

**Response (201 Created):**
```json
{
  "success": true,
  "setup_id": "uuid-here",
  "status": "initializing",
  "message": "CIP setup initiated"
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "errors": {
    "server_url": ["Invalid URL format"],
    "api_key": ["This field is required"]
  }
}
```

**Response (500 Internal Server Error):**
```json
{
  "success": false,
  "error": "Failed to connect to CIP server",
  "details": "Connection timeout after 30 seconds"
}
```

---

#### GET `/cip-setup/status/`

**Purpose:** Get current CIP setup status

**Request:**
```bash
curl -X GET http://localhost:8080/v1/cip-setup/status/ \
  -H "Authorization: Token abc123..."
```

**Response (200 OK):**
```json
{
  "setup_id": "uuid-here",
  "status": "completed",
  "progress": 100,
  "steps": [
    {
      "name": "Connect to CIP",
      "status": "completed",
      "timestamp": "2024-05-11T10:30:00Z"
    },
    {
      "name": "Validate credentials",
      "status": "completed",
      "timestamp": "2024-05-11T10:31:00Z"
    },
    {
      "name": "Load templates",
      "status": "completed",
      "timestamp": "2024-05-11T10:32:00Z"
    }
  ]
}
```

---

### User Management

#### GET `/api/user/profile/`

**Purpose:** Get current user profile

**Request:**
```bash
curl -X GET http://localhost:8080/v1/api/user/profile/ \
  -H "Authorization: Token abc123..."
```

**Response (200 OK):**
```json
{
  "id": "uuid-here",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "avatar": "https://example.com/avatars/user.jpg",
  "role": "admin",
  "permissions": ["read", "write", "delete", "admin"],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-05-11T10:00:00Z",
  "last_login": "2024-05-11T09:00:00Z"
}
```

---

#### PUT `/api/user/profile/`

**Purpose:** Update user profile

**Request:**
```bash
curl -X PUT http://localhost:8080/v1/api/user/profile/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token abc123..." \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+1987654320"
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {...}
}
```

---

#### POST `/api/user/change-password/`

**Purpose:** Change user password

**Request:**
```bash
curl -X POST http://localhost:8080/v1/api/user/change-password/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token abc123..." \
  -d '{
    "old_password": "current-password",
    "new_password": "new-secure-password",
    "confirm_password": "new-secure-password"
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## Request Formats

### JSON Request

Standard JSON format for all API requests:

```bash
curl -X POST http://localhost:8080/v1/endpoint/ \
  -H "Content-Type: application/json" \
  -d '{
    "key1": "value1",
    "key2": "value2",
    "nested": {
      "key3": "value3"
    }
  }'
```

### Form Data Request

For file uploads or form submissions:

```bash
curl -X POST http://localhost:8080/v1/upload/ \
  -H "Authorization: Token abc123..." \
  -F "file=@/path/to/file.pdf" \
  -F "description=My document"
```

### Query Parameters

For filtering and pagination:

```bash
# Single parameter
curl "http://localhost:8080/v1/items/?limit=10"

# Multiple parameters
curl "http://localhost:8080/v1/items/?limit=10&offset=20&sort=name&filter=active"

# Array parameter
curl "http://localhost:8080/v1/items/?ids=1&ids=2&ids=3"
```

---

## Response Formats

### Success Response (2xx)

```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "Item Name",
    "timestamp": "2024-05-11T10:30:00Z"
  },
  "message": "Operation completed successfully"
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [
    {"id": 1, "name": "Item 1"},
    {"id": 2, "name": "Item 2"}
  ],
  "pagination": {
    "page": 1,
    "page_size": 10,
    "total_items": 42,
    "total_pages": 5,
    "has_next": true,
    "has_previous": false
  }
}
```

### Error Response (4xx/5xx)

```json
{
  "success": false,
  "error": "Error type description",
  "details": "Detailed error message",
  "timestamp": "2024-05-11T10:30:00Z"
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Successful GET or PUT |
| 201 | Created | Successful POST creating resource |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid parameters or JSON |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource state conflict (duplicate, etc.) |
| 422 | Unprocessable | Validation errors |
| 500 | Server Error | Application error |
| 503 | Unavailable | Service temporarily down |

### Error Response Examples

**400 Bad Request (Validation Error):**
```json
{
  "success": false,
  "error": "Validation error",
  "errors": {
    "email": ["Invalid email format"],
    "password": ["Must be at least 8 characters"]
  }
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Authentication credentials are missing or invalid"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "You do not have permission to access this resource"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Not found",
  "message": "The requested resource does not exist"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Internal server error",
  "request_id": "req-uuid-here",
  "message": "An unexpected error occurred. Please contact support with request ID."
}
```

---

## Common Patterns

### Pagination

**Request:**
```bash
curl "http://localhost:8080/v1/items/?page=2&page_size=50"
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 2,
    "page_size": 50,
    "total_items": 150,
    "total_pages": 3
  }
}
```

### Filtering

**Request:**
```bash
curl "http://localhost:8080/v1/items/?status=active&role=admin&date_from=2024-01-01"
```

**Supported Operators:**
- `field=value` → Exact match
- `field__gt=value` → Greater than
- `field__lt=value` → Less than
- `field__gte=value` → Greater than or equal
- `field__lte=value` → Less than or equal
- `field__contains=value` → Contains
- `field__in=val1,val2,val3` → In list

### Sorting

**Request:**
```bash
curl "http://localhost:8080/v1/items/?sort=name&sort=-created_at"
# - prefix for descending
```

### Searching

**Request:**
```bash
curl "http://localhost:8080/v1/items/?search=keyword"
# Searches across name, description, etc.
```

---

## Integration Examples

### Python Integration

```python
import requests
import json

BASE_URL = "http://localhost:8080/v1"

# Login
response = requests.post(f"{BASE_URL}/auth/api/login/", json={
    "email": "user@example.com",
    "password": "password"
})
data = response.json()
token = data["token"]

# Make authenticated request
headers = {"Authorization": f"Token {token}"}
response = requests.get(f"{BASE_URL}/api/user/profile/", headers=headers)
profile = response.json()

print(json.dumps(profile, indent=2))
```

### JavaScript Integration

```javascript
const BASE_URL = "http://localhost:8080/v1";
let token;

// Login
async function login() {
  const response = await fetch(`${BASE_URL}/auth/api/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "user@example.com",
      password: "password"
    })
  });
  const data = await response.json();
  token = data.token;
}

// Make authenticated request
async function getProfile() {
  const response = await fetch(`${BASE_URL}/api/user/profile/`, {
    headers: { "Authorization": `Token ${token}` }
  });
  return await response.json();
}

await login();
const profile = await getProfile();
console.log(profile);
```

### cURL Examples

**Login and save token:**
```bash
TOKEN=$(curl -s -X POST http://localhost:8080/v1/auth/api/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.token')

echo $TOKEN
```

**Use token in subsequent requests:**
```bash
curl -X GET http://localhost:8080/v1/api/user/profile/ \
  -H "Authorization: Token $TOKEN"
```

---

## Rate Limiting

### Rate Limit Headers

Each response includes rate limit information:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1620000000
```

### Rate Limit Tiers

| Tier | Requests/Hour | Authentication | Use Case |
|------|---------------|---|----------|
| Public | 100 | None | Anonymous access |
| Authenticated | 1000 | Token | Logged-in users |
| Premium | 10000 | Premium token | Enterprise customers |

### Handling Rate Limits

When rate limited (HTTP 429):

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retry_after": 60
}
```

**Retry Strategy:**
```python
import time

def api_call_with_retry(url, headers):
    while True:
        response = requests.get(url, headers=headers)
        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 60))
            print(f"Rate limited. Retrying in {retry_after}s...")
            time.sleep(retry_after)
        else:
            return response
```

---

## Webhooks

### Webhook Events

Webhook notifications for important events:

- `user.created` → New user registered
- `user.updated` → User profile updated
- `setup.completed` → CIP setup finished
- `error.occurred` → System error happened

### Registering Webhook

**Request:**
```bash
curl -X POST http://localhost:8080/v1/webhooks/register/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token abc123..." \
  -d '{
    "url": "https://your-app.com/webhook",
    "events": ["user.created", "setup.completed"],
    "secret": "webhook-secret-key"
  }'
```

### Webhook Payload

```json
{
  "event": "user.created",
  "timestamp": "2024-05-11T10:30:00Z",
  "data": {
    "id": "uuid-here",
    "email": "new-user@example.com",
    "created_at": "2024-05-11T10:30:00Z"
  },
  "signature": "hmac-sha256-hash"
}
```

### Verifying Webhook Signature

```python
import hmac
import hashlib

def verify_webhook(payload, signature, secret):
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

---

**End of API Reference**

For more information, see [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), or [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
