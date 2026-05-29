# Teamwork MCP Server

Production-ready MCP server for Teamwork.com, built for coding assistants and automation agents.

It provides safe, reusable tools for creating and managing tasks, moving workflow stages, posting comments, logging time, and attaching files.

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

Create an environment file:

```bash
cp .env.example .env
```

Set the following values in `.env`:

- `TEAMWORK_BASE_URL`
- `TEAMWORK_API_VERSION` (default `v3`)
- `TEAMWORK_API_TOKEN`
- `TEAMWORK_AUTH_MODE` (`basic_token_x` recommended for Teamwork v3)
- `TEAMWORK_READ_ONLY` (`true` or `false`)
- `TEAMWORK_ALLOWED_PROJECT_IDS` (optional comma-separated write allowlist)

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

## Production Release Notes

This repository is prepared for a public release with:

- Secret-safe defaults (`.env` ignored)
- Public documentation for setup and operations
- Safety controls for write scope
- Stable helper commands for stage moves and smoke tests

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md` for reporting guidance.

## License

MIT License. See `LICENSE`.
