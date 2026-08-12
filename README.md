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
- **Add task time entries** (date format: YYYYMMDD or YYYY-MM-DD, auto-converts to YYYYMMDD)
- List notifications
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

## Time Entry Logging

### Adding Time Entries

Time entries require:
- **Date format**: YYYYMMDD (auto-converts from YYYY-MM-DD)
- **Time format**: HH:MM in 24-hour format (optional, defaults to 00:00 if omitted)
- **Hours & Minutes**: Duration of work logged
- **Description**: Work description

```javascript
// Complete example with time of day:
await client.addTaskTimeEntry({
  taskId: '48708771',
  date: '2026-08-12',      // or '20260812' - both work
  time: '14:30',           // 2:30 PM in 24-hour format (required for accurate logging)
  hours: 1,
  minutes: 30,
  description: 'Work completed'
});

// Minimal example (defaults to 00:00):
await client.addTaskTimeEntry({
  taskId: '48708771',
  date: '2026-08-12',
  hours: 1,
  minutes: 30,
  description: 'Work completed'
});
```

**Important**: Always include the `time` field in HH:MM format (24-hour) to log entries at the correct time of day. Without it, entries are logged at midnight (00:00).

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

## Quick Start with Task Class

For simplified task creation with proper date/time handling:

```javascript
import { Task, TaskPriority } from './src/Task.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const client = new TeamworkClient(config);

// Create and configure task (CTC Africa project)
const task = new Task('938241'); // Project ID
task.title = "My Task Title";
task.description = "Task description";
task.assigneeUserId = 108693; // Cor Cronje
task.priority = TaskPriority.HIGH;
task.dueDate = new Date('2026-08-31'); // Auto-formatted to YYYY-MM-DD
task.stageId = 182969; // In Progress

// Create task
const result = await client.createTask(task.toParams());
task.id = result.task.id;

// Add time entry (don't forget the time field in HH:MM!)
task.addTimeEntry({
  date: '2026-08-11',
  time: '14:30',  // IMPORTANT: always include time in HH:MM format
  hours: 2,
  minutes: 30,
  description: 'Implementation work'
});

const timeParams = task.getTimeEntryParams();
for (const entry of timeParams) {
  await client.addTaskTimeEntry(entry);
}
```

**See [Task Class Guide](docs/TASK_CLASS.md)** for quick reference (IDs, stage IDs, and copy-paste examples).

## Tools Exposed (27 methods)

### Task Management (9)
- `teamwork_create_task` - Create new task (v3 API)
- `teamwork_update_task` - Update task properties
- `teamwork_delete_task` - Delete task
- `teamwork_get_task_detail` - Get single task
- `teamwork_get_my_tasks` - Get assigned tasks
- `teamwork_get_project_tasks` - Get project tasks
- `teamwork_list_all_tasks` - List with pagination
- `teamwork_complete_task` - Mark task complete
- `teamwork_upload_file_to_task` - Attach file to task

### Task Filtering & Querying (8)
- `teamwork_filter_tasks_by_assignee` - Filter by user
- `teamwork_filter_tasks_by_priority` - Filter by priority level
- `teamwork_filter_tasks_by_status` - Filter by status
- `teamwork_filter_tasks_by_date_range` - Filter by due date range
- `teamwork_filter_tasks_without_due_date` - Find unscheduled tasks
- `teamwork_filter_active_tasks` - Get incomplete tasks
- `teamwork_filter_completed_tasks` - Get finished tasks
- `teamwork_search_tasks` - Full-text search

### Comment Management (4)
- `teamwork_get_task_comments` - List task comments
- `teamwork_add_task_comment` - Add comment
- `teamwork_update_task_comment` - Update comment
- `teamwork_delete_task_comment` - Delete comment

### Time Entry Management (3)
- `teamwork_add_task_time_entry` - Log time
- `teamwork_get_task_time_entries` - List time entries
- `teamwork_delete_time_entry` - Remove time entry

### Workflow & Organization (2)
- `teamwork_get_workflow_stages` - Get pipeline stages
- `teamwork_get_project_task_lists` - Get task lists

### Notifications (1)
- `teamwork_get_notifications` - Get user notifications

## API Strategy

This server uses the latest Teamwork API v3 for most operations, with v1 fallback for specific endpoints:

- **Task operations (CRUD)**: `/projects/api/v3/tasklists/{tasklistId}/tasks.json`
- **Workflow operations**: `/projects/api/v3` (reads, updates, moves)
- **Task Comments**: `/projects/api/v1/tasks/{taskId}/comments.json` (v1 only)
- **Time entries**: `/projects/api/v1/tasks/{taskId}/time_entries.json` (v1 required)
- **File attachments**: `/projects/api/v1` (tested with v3 compatibility)

All task creation goes through v3 API using the tasklistId endpoint for proper field handling and consistency.

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

## Documentation

- [Task Class Guide](docs/TASK_CLASS.md) - Helper class for task creation with date/time handling, time entries, and comments
- [TaskQueue Guide](docs/TASK_QUEUE.md) - Task prioritization, lane management, and work queue organization
- [Time Entry Implementation Guide](docs/TIME_ENTRY_IMPLEMENTATION.md) - Details on creating task time entries
- [Architecture Guide](ARCHITECTURE.md) - System design and module overview
- [VS Code Setup Guide](CLAUDE_CODE_SETUP.md) - Configure VS Code to use local MCP

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
