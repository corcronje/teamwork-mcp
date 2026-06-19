# Teamwork MCP Server

Production-ready MCP (Model Context Protocol) server for Teamwork.com, built for coding assistants and automation agents.

Provides safe, reusable tools for task management, workflow automation, comments, time tracking, and file attachments. Implements robust error handling, structured logging, and MCP spec compliance.

## Features

- List assigned tasks
- List project tasks
- Read full task details
- Create and update tasks
- Move tasks by workflow stage IDs
- Move tasks by friendly stage aliases (`selected`, `in_progress`, `qa_ready`)
- Read and add task comments
- List notifications
- Add task time entries
- Upload local files to tasks
- List workflow stages

## Requirements

- Node.js 18+
- Teamwork site URL (for example, `https://your-teamwork-site.com`)
- Teamwork API token

## Install

```bash
git clone git@github.com:corcronje/teamwork-mcp.git
cd teamwork-mcp
npm install
```

## Configuration

### Environment Variables (Recommended)

Create an environment file:

```bash
cp .env.example .env
```

Set the following values in `.env`:

- `TEAMWORK_BASE_URL` - Teamwork site URL (e.g., `https://your-org.teamwork.com`)
- `TEAMWORK_API_VERSION` - API version (default: `v3`)
- `TEAMWORK_API_TOKEN` - Teamwork API authentication token
- `TEAMWORK_AUTH_MODE` - Auth method: `basic_token_x` (recommended for v3) or `bearer`
- `TEAMWORK_READ_ONLY` - Set to `true` to disable write operations (default: `false`)
- `TEAMWORK_ALLOWED_PROJECT_IDS` - Optional comma-separated project IDs for write restriction
- `TEAMWORK_REQUEST_TIMEOUT` - Request timeout in milliseconds (default: `30000`)
- `TEAMWORK_MAX_RETRIES` - Max retry attempts for transient errors (default: `3`)
- `LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, `error` (default: `info`)

### Configuration File (Optional)

Alternatively, create `mcp.config.json`:

```json
{
  "baseUrl": "https://your-org.teamwork.com",
  "apiVersion": "v3",
  "token": "your-api-token",
  "authMode": "basic_token_x",
  "readOnly": false,
  "allowedProjectIds": ["1234", "5678"],
  "requestTimeout": 30000,
  "maxRetries": 3,
  "logLevel": "info"
}
```

Then reference it with:
```bash
export TEAMWORK_CONFIG_FILE=/path/to/mcp.config.json
```

**Precedence:** Environment variables > Config file > Defaults

## Security Defaults

For production safety:

1. Start with `TEAMWORK_READ_ONLY=true`.
2. Verify read tools first.
3. Enable writes only when needed (`TEAMWORK_READ_ONLY=false`).
4. Restrict writes using `TEAMWORK_ALLOWED_PROJECT_IDS`.

Sensitive data policy:

- Never commit `.env`.
- Keep tokens only in runtime env files or secret stores.
- Rotate Teamwork tokens if exposed.

## VS Code MCP Registration

Create or edit your VS Code user MCP config file:

- macOS: `~/Library/Application Support/Code/User/mcp.json`

Use this format:

```json
{
  "servers": {
    "teamwork": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/teamwork-mcp/src/server.js"],
      "env": {
        "TEAMWORK_BASE_URL": "https://your-teamwork-site.com",
        "TEAMWORK_API_VERSION": "v3",
        "TEAMWORK_API_TOKEN": "YOUR_TOKEN",
        "TEAMWORK_AUTH_MODE": "basic_token_x",
        "TEAMWORK_READ_ONLY": "true",
        "TEAMWORK_ALLOWED_PROJECT_IDS": ""
      }
    }
  }
}
```

Some MCP clients use `mcpServers` instead of `servers`; both are common.

## Run

```bash
npm start
```

## Validation

```bash
npm run check
```

Local helper commands:

```bash
npm run task:create-mock
npm run task:move-stage -- --taskId <id> --stage <selected|in_progress|qa_ready>
```

## Tools Exposed

- `teamwork_get_my_tasks`
- `teamwork_get_project_tasks`
- `teamwork_get_task_detail`
- `teamwork_create_task`
- `teamwork_update_task`
- `teamwork_move_task`
- `teamwork_move_task_stage`
- `teamwork_get_workflow_stages`
- `teamwork_get_task_comments`
- `teamwork_add_task_comment`
- `teamwork_get_notifications`
- `teamwork_add_task_time_entry`
- `teamwork_upload_file_to_task`

## API Strategy

This server uses a pragmatic mixed-endpoint strategy because Teamwork capability can vary by account:

- Primary task/workflow operations: `/projects/api/v3`
- Time entries and file attach flow: `/projects/api/v1`
- Comment fallback for older accounts: `/projects/api/v1/tasks/{taskId}/comments.json`

## Troubleshooting & Logs

The server logs structured JSON to stderr to keep stdout clean for the MCP protocol.

### Enable Debug Logging

```bash
LOG_LEVEL=debug npm start
```

Logs include:
- `timestamp` - ISO 8601 timestamp
- `level` - Log level (debug, info, warn, error)
- `message` - Human-readable log message
- `context` - Structured context data
- `stack` - Stack trace for errors

### Common Error Codes

| Code | HTTP Status | Meaning | Action |
|------|-------------|---------|--------|
| `INVALID_REQUEST` | 400 | Input validation failed | Check parameter types and values |
| `AUTHENTICATION_FAILED` | 401 | API token invalid or expired | Verify `TEAMWORK_API_TOKEN` |
| `FORBIDDEN` | 403 | Operation not permitted | Check `TEAMWORK_READ_ONLY` and `TEAMWORK_ALLOWED_PROJECT_IDS` |
| `NOT_FOUND` | 404 | Resource doesn't exist | Verify IDs (taskId, projectId, etc.) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Server will auto-retry with backoff |
| `REQUEST_TIMEOUT` | 504 | Request took too long | Increase `TEAMWORK_REQUEST_TIMEOUT` or check network |
| `INTERNAL_ERROR` | 500+ | Unexpected server error | Check logs and Teamwork API status |

### Performance & Optimization

- **Timeouts:** Default 30 seconds. Increase for slow networks or large uploads:
  ```bash
  TEAMWORK_REQUEST_TIMEOUT=60000 npm start
  ```

- **Retries:** Automatic exponential backoff for transient errors (5xx, 429, timeouts)
  - Rate limit (429): Defaults to 60s retry after
  - Timeout: Retries up to 3 times with 1s, 2s, 4s delays

- **Rate Limiting:** Teamwork API has rate limits. Monitor logs for 429 responses. The server handles retries automatically.

## MCP Compliance

This server implements the Model Context Protocol specification with:

- **Version:** 2.0.0
- **MCP Spec Version:** 2024-11-05
- **Capabilities:**
  - Tools: Yes (13 task management tools)
  - Resources: Planned for v2.1
  - Prompts: No
  - Sampling: No
  - Logging: Yes (structured JSON)

### MCP Error Responses

All errors follow the MCP spec format:
```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "data": {
    "status": 400,
    "context": {...},
    "retryable": true,
    "retryAfterMs": 60000
  }
}
```

## Production Release Notes

This repository is prepared for a public release with:

- Secret-safe defaults (`.env` ignored)
- MCP spec compliance and structured error handling
- Robust retry logic with exponential backoff
- Structured logging for monitoring and debugging
- Safety controls for write scope
- Stable helper commands for stage moves and smoke tests

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md` for reporting guidance.

## License

MIT License. See `LICENSE`.
