# Architecture & Design

## System Overview

```
MCP Client (Claude, Hermes, etc.)
    ↓ (stdio protocol)
Teamwork MCP Server
    ├─ Server (server.js)
    ├─ Client (teamworkClient.js)
    ├─ Logger (logger.js)
    ├─ Error Handler (errors.js)
    ├─ Config (config.js)
    └─ Resources (resources.js)
    ↓ (HTTP REST API)
Teamwork.com API
    ├─ /projects/api/v3 (primary)
    ├─ /projects/api/v1 (fallback)
    └─ S3 (file upload presigned URLs)
```

## Core Modules

### `server.js` - MCP Protocol Handler

**Responsibility:** Implement MCP server protocol, route tool requests, format responses.

**Key Components:**
- `Server` instance from `@modelcontextprotocol/sdk`
- Tool definitions and schemas (Zod)
- Request handler that:
  1. Validates input against schema
  2. Calls TeamworkClient method
  3. Formats response per MCP spec
  4. Catches errors and formats as MCP errors

**Data Flow:**
```
Request → Validate Input → Call Client → Log Result → Format Response
  ↓           ↓                ↓            ↓            ↓
MCP Proto  Zod Schema     Teamwork API  Logger.info  JSON/Error
```

### `teamworkClient.js` - Teamwork API Client

**Responsibility:** Communicate with Teamwork API, handle resilience, manage authentication.

**Key Components:**
- `TeamworkClient` class
- Request methods: `request()`, `requestLegacy()`
- Retry logic with exponential backoff
- Timeout handling with AbortController
- Error parsing and mapping

**Resilience Features:**
- **Timeout:** AbortController stops requests after `requestTimeout` (default 30s)
- **Retries:** Exponential backoff on transient errors (5xx, 429, timeouts)
- **Backoff:** 1s → 2s → 4s delays with random jitter
- **Error Mapping:** Teamwork API errors → MCPError types

**Fallback Strategy:**
Some operations try multiple API endpoints:
1. Try v3 API first (modern)
2. Fall back to v1 API (legacy)
3. Fall back to specific v1 endpoint (oldest)

Example: Create task
```
POST /projects/api/v3/tasks
  → Failed? Try: POST /projects/api/v3/tasks.json
  → Failed? Try: POST /projects/api/v1/tasks.json
  → Failed? Try: POST /projects/api/v1/tasklists/{taskListId}/tasks.json
  → All failed? Return error
```

### `logger.js` - Structured Logging

**Responsibility:** Provide observability via structured JSON logging.

**Features:**
- JSON output to stderr (keeps stdout clean for MCP protocol)
- Log levels: `debug`, `info`, `warn`, `error`
- Configurable via `LOG_LEVEL` environment variable
- Automatic stack traces for Error objects
- Context object for structured data

**Log Entry Format:**
```json
{
  "timestamp": "2026-06-19T10:00:00.000Z",
  "level": "error",
  "name": "teamwork-mcp",
  "message": "API request failed: GET /tasks/123",
  "method": "GET",
  "url": "https://...",
  "status": 500,
  "durationMs": 1234,
  "stack": "Error: ...",
  "errorMessage": "..."
}
```

### `errors.js` - MCP-Compliant Error Handling

**Responsibility:** Define error types and convert to MCP response format.

**Error Types:**
- `MCPError` - Base class
- `ValidationError` (400) - Input validation failed
- `AuthenticationError` (401) - Invalid API token
- `AuthorizationError` (403) - Operation denied by policy
- `NotFoundError` (404) - Resource doesn't exist
- `ServerError` (500) - Unexpected failure
- `TimeoutError` (504) - Request timeout
- `RateLimitError` (429) - Rate limit exceeded

**MCP Error Format:**
```json
{
  "code": "INVALID_REQUEST",
  "message": "taskId: invalid_type, expected number, received string",
  "data": {
    "status": 400,
    "context": { "field": "taskId", "value": "abc" },
    "retryable": false,
    "retryAfterMs": null
  }
}
```

### `config.js` - Configuration Management

**Responsibility:** Load and validate configuration from multiple sources.

**Sources (in precedence order):**
1. Environment variables (`TEAMWORK_*`)
2. Config file (if `TEAMWORK_CONFIG_FILE` specified)
3. Defaults

**Configuration Options:**
- `baseUrl` - Teamwork site URL
- `apiVersion` - API version (v3 or v1)
- `token` - API authentication token
- `authMode` - Auth scheme (bearer or basic_token_x)
- `readOnly` - Disable write operations
- `allowedProjectIds` - Whitelist for writes
- `requestTimeout` - Request timeout ms
- `maxRetries` - Retry count
- `logLevel` - Log verbosity

**Validation:**
- Uses Zod schemas
- Validates types and constraints
- Throws detailed error messages

### `resources.js` - MCP Resource Definitions

**Responsibility:** Define introspectable resources (planned for v2.1).

**Planned Resources:**
- `task://<taskId>` - Task details and context
- `project://<projectId>` - Project and task lists
- `workflow://<workflowId>` - Workflow and stages

Currently a placeholder for future implementation.

## Data Flow Examples

### Get My Tasks

```
Client Request
  ↓ MCP Protocol
Server.CallToolHandler("teamwork_get_my_tasks")
  ↓
Validate input with schemas.getMyTasks
  ↓
Call client.getMyTasks({ page, pageSize, includeCompleted })
  ↓
TeamworkClient.request("GET", "/tasks.json", query: { assignedToMe: true, ... })
  ↓
fetch() with timeout 30s, retry on 5xx/429/timeout
  ↓
Parse response, log API call
  ↓
Return data to Server
  ↓
Server formats as textResult()
  ↓
MCP Client receives JSON response
```

### Create Task with Workflow Move

```
Client Request with { projectId, title, workflowId, stageId }
  ↓
Validate input
  ↓
Check TEAMWORK_READ_ONLY and TEAMWORK_ALLOWED_PROJECT_IDS
  ↓
Call client.createTask()
  ↓
  ├─ POST /tasks (try v3 first)
  ├─ POST /tasks.json (fallback)
  └─ POST /tasklists/{id}/tasks.json (fallback)
  ↓
Extract task ID from response
  ↓
Call client.moveTaskToWorkflowStage(taskId, workflowId, stageId)
  ↓
Verify stage move with client.getTask(taskId)
  ↓
Return { createResult, stageMove } to client
```

### Error Handling Flow

```
API Request
  ↓ (error occurs)
Timeout? → TimeoutError(504)
Not OK? → parseTeamworkError() 
  ├─ 401 → AuthenticationError
  ├─ 403 → AuthorizationError
  ├─ 404 → NotFoundError
  ├─ 429 → RateLimitError (with retryAfterMs)
  ├─ 5xx → ServerError (retryable)
  └─ 4xx → ValidationError
  ↓
Should retry?
  ├─ Yes → Wait backoff ms → Retry
  └─ No → Throw error
  ↓
Server.CallToolHandler catches error
  ↓
formatMCPError() converts to MCP format
  ↓
Return { content, isError: true } to client
```

## Authentication Strategies

### Bearer Token (Legacy)

```bash
Authorization: Bearer <token>
```

Used with:
- Older Teamwork accounts
- Some legacy integrations

### Basic Token X (Recommended for v3)

```bash
Authorization: Basic base64(token:x)
```

Used with:
- Modern Teamwork API (v3)
- More secure, scoped tokens
- Recommended for new deployments

## API Fallback Strategy

The client uses a fallback strategy because Teamwork API capability varies by account version:

**Priority Order:**
1. v3 API (modern, preferred)
2. v1 API with alternative endpoint (v1 fallback)
3. v1 API with legacy response handling

**Why Fallbacks?**
- Legacy Teamwork accounts may not support v3
- Some v3 endpoints may not exist in all account types
- v1 is stable and universally available

**Example: Get Task Comments**
```
GET /projects/api/v3/tasks/123/comments.json
  → Failed? Try: GET /projects/api/v1/tasks/123/comments.json
  → Success (v1 response format)
```

## Extensibility Points

### Adding New Tools

1. Define Zod schema in `server.js`
2. Add tool definition to `tools` array
3. Implement case in `CallToolRequestSchema` handler
4. Call `client.methodName()`

Example:
```javascript
// 1. Schema
schemas.newTool = z.object({
  param1: z.string(),
});

// 2. Tool def
{
  name: "teamwork_new_tool",
  description: "Do something",
  inputSchema: { ... }
}

// 3. Handler
case "teamwork_new_tool": {
  const parsed = schemas.newTool.safeParse(args);
  const data = await client.newToolMethod(parsed.data);
  return textResult(data);
}

// 4. Client method
newToolMethod({ param1 }) {
  return this.request("POST", "/endpoint", { body: { ... } });
}
```

### Adding New Error Types

1. Define class in `errors.js` extending `MCPError`
2. Set appropriate `code` and `status`
3. Use in server or client handlers

```javascript
export class CustomError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      code: "CUSTOM_ERROR",
      status: 418,
      retryable: false,
      ...options,
    });
  }
}
```

### Custom Logging

Use logger methods anywhere:

```javascript
import { logger } from "./logger.js";

logger.debug("Detailed info", { userId: 123 });
logger.info("User action", { action: "create_task" });
logger.warn("Might be a problem", { retries: 3 });
logger.error("Failed", { error });
```

## Performance Characteristics

### Request Latency

Typical end-to-end latency:
- Simple read (get task): 200-500ms
- Write (create task): 500-1000ms
- File upload: 2-10 seconds (depends on file size)

With retries:
- 1 attempt: ~200ms (best case)
- 1 timeout + 1 retry: ~65 seconds (1s backoff + 60s attempt)

### Throughput

Single server can handle:
- 100+ requests/second (read-only)
- 50+ requests/second (mixed read/write)
- Limited by Teamwork API rate limits (typically 600 requests/minute)

### Resource Usage

Memory:
- Base: ~100MB (Node.js)
- Per request: ~1-2MB (varies by response size)
- Example: 10 concurrent requests ≈ 120MB total

CPU:
- Mostly I/O bound (waiting for network)
- Low CPU usage (< 5% on idle)
- Spikes during JSON parsing (large responses)

Connections:
- Typically 1-10 concurrent HTTP connections
- No persistent connections (each request is independent)

## Security Architecture

### Authentication

Token handling:
- Stored in environment variables or config file
- Never logged (secrets scrubbing in version.js)
- Converted to Basic auth or Bearer scheme per request

### Authorization

Three-layer approach:
1. **API Token** - Teamwork validates access
2. **Read-Only Mode** - Server blocks all writes if enabled
3. **Project Allowlist** - Server only allows writes to specified projects

Example:
```
POST /tasks with projectId=999
  ↓
Check TEAMWORK_READ_ONLY? → Deny
Check projectId in TEAMWORK_ALLOWED_PROJECT_IDS? → Deny
  ↓
Allowed (send to Teamwork)
```

### Data in Transit

- HTTPS only (enforced by using `TEAMWORK_BASE_URL`)
- Basic auth credentials base64-encoded (not a password, but still over HTTPS)
- Bearer tokens in Authorization header

### Data at Rest

- No persistent storage on server
- Configuration held in environment only
- Logs can contain sensitive data (taskId, projectId) but not tokens

## Testing Strategy

See `DEPLOYMENT.md` for operational testing and health checks.

Unit test coverage (planned):
- `src/__tests__/errors.test.js` - Error type creation and MCP formatting
- `src/__tests__/config.test.js` - Config loading and validation
- `src/__tests__/teamworkClient.test.js` - Client retry logic, timeout handling

Integration testing:
- `scripts/integration-test.js` - Smoke test against real Teamwork API
- Health checks - Periodic connectivity validation

## Version Management

Current state:
- Version: 2.0.0
- MCP Spec: 2024-11-05
- Node.js: 18+
- SDK: @modelcontextprotocol/sdk ^1.12.0

Planned deprecations:
- None currently

Breaking changes in v2.0:
- Error response format (see CHANGELOG)

## Future Improvements

### v2.1 (Next)
- Resource definitions (task://, project://, workflow://)
- Pagination filters and sorting

### v3.0 (Later)
- Prompt definitions
- More advanced filtering
- Bulk operations

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Teamwork API Documentation](https://developer.teamwork.com/)
- [Node.js Best Practices](https://nodejs.org/en/docs/guides/nodejs-performance-best-practices/)
