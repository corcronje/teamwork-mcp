# Deployment & Operations Guide

## Production Deployment Checklist

### Pre-Deployment

- [ ] Generate new Teamwork API token (rotate if reusing old token)
- [ ] Determine project IDs for write allowlist (if restricting writes)
- [ ] Choose authentication mode (`basic_token_x` for v3, `bearer` for legacy)
- [ ] Decide on read-only vs. read-write mode
- [ ] Plan request timeout based on network conditions
- [ ] Set up log aggregation (if applicable)
- [ ] Test with read-only mode first before enabling writes

### Environment Setup

#### Option 1: Environment Variables (Recommended)

```bash
export TEAMWORK_BASE_URL=https://your-org.teamwork.com
export TEAMWORK_API_VERSION=v3
export TEAMWORK_API_TOKEN=your_secret_token_here
export TEAMWORK_AUTH_MODE=basic_token_x
export TEAMWORK_READ_ONLY=true          # Start with read-only
export TEAMWORK_ALLOWED_PROJECT_IDS=    # Restrict writes to specific projects
export TEAMWORK_REQUEST_TIMEOUT=30000
export TEAMWORK_MAX_RETRIES=3
export LOG_LEVEL=info
```

#### Option 2: Configuration File

Create `mcp.config.json`:

```json
{
  "baseUrl": "https://your-org.teamwork.com",
  "apiVersion": "v3",
  "token": "your_secret_token_here",
  "authMode": "basic_token_x",
  "readOnly": true,
  "allowedProjectIds": [],
  "requestTimeout": 30000,
  "maxRetries": 3,
  "logLevel": "info"
}
```

Then reference it:
```bash
export TEAMWORK_CONFIG_FILE=/etc/teamwork-mcp/mcp.config.json
```

### Starting the Server

```bash
npm install
npm start
```

Expected startup output (on stderr):
```json
{
  "timestamp": "2026-06-19T10:00:00.000Z",
  "level": "info",
  "name": "teamwork-mcp",
  "message": "Teamwork MCP server initialized",
  "version": "2.0.0",
  "readOnly": true,
  "allowedProjectIds": "none"
}
```

## Monitoring & Health Checks

### Log Monitoring

Monitor stderr for issues:

```bash
# Watch all logs
npm start 2>&1 | grep -E 'error|warn'

# Count errors by type
npm start 2>&1 | jq -r '.code' | sort | uniq -c

# Find slow requests
npm start 2>&1 | jq 'select(.durationMs > 5000)' 
```

### Health Check Script

Create `scripts/health-check.sh`:

```bash
#!/bin/bash

# Test Teamwork connectivity
RESPONSE=$(curl -s -H "Authorization: Bearer $TEAMWORK_API_TOKEN" \
  "$TEAMWORK_BASE_URL/projects/api/v3/me.json")

if echo "$RESPONSE" | jq . > /dev/null 2>&1; then
  echo "OK: Teamwork API reachable"
  exit 0
else
  echo "FAIL: Teamwork API unreachable"
  exit 1
fi
```

Run periodically:
```bash
*/5 * * * * /path/to/health-check.sh
```

## Log Aggregation

### CloudWatch (AWS)

Install CloudWatch agent and configure:

```json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/teamwork-mcp/*.log",
            "log_group_name": "/teamwork-mcp",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
```

### Datadog

Add Datadog agent configuration:

```yaml
logs:
  - type: file
    path: /var/log/teamwork-mcp/server.log
    service: teamwork-mcp
    source: nodejs
    tags:
      - env:production
```

### ELK Stack (Elasticsearch, Logstash, Kibana)

Filebeat configuration:

```yaml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/teamwork-mcp/server.log
  json.message_key: message
  json.keys_under_root: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "teamwork-mcp-%{+yyyy.MM.dd}"
```

## Scaling Considerations

### Single Server

Sufficient for:
- Small teams (< 20 users)
- Casual usage (< 100 requests/hour)
- Non-critical operations

Configuration:
```bash
TEAMWORK_MAX_RETRIES=3
TEAMWORK_REQUEST_TIMEOUT=30000
LOG_LEVEL=info
```

### Multiple Servers (Load Balanced)

For high availability:

1. Deploy multiple instances behind a load balancer (round-robin)
2. Share configuration via:
   - Shared config file on mounted NFS
   - Environment variables from CI/CD system
   - Secrets manager (AWS Secrets Manager, HashiCorp Vault)

3. Log aggregation becomes critical

Example Docker Compose:

```yaml
version: '3'
services:
  teamwork-mcp-1:
    image: node:20-alpine
    command: npm start
    env_file: .env
    restart: always
    
  teamwork-mcp-2:
    image: node:20-alpine
    command: npm start
    env_file: .env
    restart: always
    
  nginx:
    image: nginx:latest
    ports:
      - "9000:9000"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - teamwork-mcp-1
      - teamwork-mcp-2
```

## Performance Tuning

### Request Timeout

Increase if experiencing timeouts with slow networks:

```bash
# 60 second timeout
TEAMWORK_REQUEST_TIMEOUT=60000 npm start
```

Monitor logs for timeout errors and adjust accordingly.

### Retry Logic

For unreliable networks, increase retries:

```bash
TEAMWORK_MAX_RETRIES=5 npm start
```

Trade-off: More resilience but slower failure detection.

### Rate Limiting

Teamwork API has rate limits. Monitor for:

```bash
# Watch for rate limit errors
npm start 2>&1 | jq 'select(.code == "RATE_LIMIT_EXCEEDED")'
```

If frequent:
1. Reduce request volume from clients
2. Implement client-side batching
3. Contact Teamwork support for increased limits

## Troubleshooting

### Server Won't Start

**Error:** `Invalid Teamwork MCP configuration`

Check all required environment variables:
- `TEAMWORK_BASE_URL` - Valid HTTPS URL
- `TEAMWORK_API_TOKEN` - Non-empty string
- `TEAMWORK_API_VERSION` - Usually `v3`

### High Error Rate

**Error:** `RATE_LIMIT_EXCEEDED`

Solution: Server auto-retries, but if persistent:
- Check Teamwork API status page
- Reduce client request frequency
- Increase `TEAMWORK_MAX_RETRIES`

**Error:** `REQUEST_TIMEOUT`

Solution:
- Increase `TEAMWORK_REQUEST_TIMEOUT`
- Check network connectivity
- Check Teamwork API performance

### Authentication Failures

**Error:** `AUTHENTICATION_FAILED`

Solutions:
- Verify `TEAMWORK_API_TOKEN` is correct
- Check token hasn't expired
- Verify `TEAMWORK_BASE_URL` is correct
- For v3 API, ensure `TEAMWORK_AUTH_MODE=basic_token_x`

### Write Operations Blocked

**Error:** `Write action blocked: TEAMWORK_READ_ONLY=true`

Solution: Set `TEAMWORK_READ_ONLY=false` to enable writes

**Error:** `Write action blocked: project X is not in TEAMWORK_ALLOWED_PROJECT_IDS`

Solution: Add project ID to `TEAMWORK_ALLOWED_PROJECT_IDS`

## Upgrading

### From v1.x to v2.0

Breaking changes:
- Error response format changed (see README MCP Compliance section)
- Clients must handle new error structure: `{ code, message, data }`

Steps:
1. Review error handling code in clients
2. Update error message parsing if applicable
3. Test with read-only mode first
4. Deploy new version
5. Monitor logs for any issues

## Backup & Recovery

### Configuration Backup

```bash
# Backup config
cp mcp.config.json mcp.config.json.backup
cp .env .env.backup

# Restore if needed
cp mcp.config.json.backup mcp.config.json
```

### Token Rotation

```bash
# Generate new token in Teamwork
# Update environment
export TEAMWORK_API_TOKEN=new_token_here

# Restart server
pkill -f 'npm start'
npm start &

# Verify connectivity
curl -H "Authorization: Bearer $TEAMWORK_API_TOKEN" \
  "$TEAMWORK_BASE_URL/projects/api/v3/me.json"
```

## Security Best Practices

1. **Never commit secrets** - `.env` and `mcp.config.json` in `.gitignore`
2. **Rotate tokens regularly** - Every 90 days recommended
3. **Use `TEAMWORK_READ_ONLY=true`** - Start with read-only, enable writes only for needed projects
4. **Restrict with `TEAMWORK_ALLOWED_PROJECT_IDS`** - Limit writes to necessary projects
5. **Monitor logs** - Set up alerts for authentication failures
6. **Keep dependencies updated** - Run `npm audit` and `npm update` regularly
7. **Use HTTPS only** - Ensure `TEAMWORK_BASE_URL` uses HTTPS

## Support & Debugging

### Enable Debug Logging

```bash
LOG_LEVEL=debug npm start 2>&1 | tee server.log
```

Logs include:
- All API requests/responses
- Retry attempts
- Error details and stack traces
- Configuration values (without secrets)

### Report Issues

Include:
1. Server version: `npm list teamwork-mcp`
2. Node version: `node --version`
3. Recent logs with `LOG_LEVEL=debug`
4. Steps to reproduce
5. Configuration (without tokens)
