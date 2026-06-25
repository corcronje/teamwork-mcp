# Claude Code & VS Code MCP Setup Guide

This guide explains how to configure Claude Code and VS Code to use the local Teamwork MCP server as the default instead of the cloud-based version.

## Requirements

- Node.js 18+
- Git (for this repository)
- VS Code or Claude Code IDE
- Valid Teamwork API credentials

## Installation

1. Clone this repository:
```bash
git clone git@github.com:corcronje/teamwork-mcp.git
cd teamwork-mcp
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

3. Edit `.env` with your credentials:
```env
TEAMWORK_BASE_URL=https://your-teamwork-site.com
TEAMWORK_API_TOKEN=your-api-token
TEAMWORK_API_VERSION=v3
TEAMWORK_AUTH_MODE=basic_token_x
TEAMWORK_READ_ONLY=false
LOG_LEVEL=info
```

## VS Code Configuration

### macOS
Edit `~/Library/Application Support/Code/User/mcp.json`:

```json
{
  "servers": {
    "teamwork-local": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/teamwork-mcp/src/server.js"],
      "env": {
        "TEAMWORK_BASE_URL": "https://your-org.teamwork.com",
        "TEAMWORK_API_VERSION": "v3",
        "TEAMWORK_API_TOKEN": "YOUR_TOKEN",
        "TEAMWORK_AUTH_MODE": "basic_token_x",
        "TEAMWORK_READ_ONLY": "false",
        "TEAMWORK_ALLOWED_PROJECT_IDS": ""
      }
    }
  }
}
```

### Linux
Edit `~/.config/Code/User/mcp.json` with the same configuration.

### Windows
Edit `%APPDATA%\Code\User\mcp.json` with the same configuration.

## Claude Code Configuration

The MCP server will be automatically available when configured in VS Code. Claude Code reads the VS Code MCP configuration.

## Verifying the Setup

1. Start VS Code with the MCP configured:
```bash
code
```

2. Open the Claude Code extension

3. Try one of these commands to verify the MCP is loaded:
- List assigned tasks
- Get task details
- Create a task comment

## Available Tools

Once configured, you'll have access to:

- `teamwork_get_my_tasks` - List your assigned tasks
- `teamwork_get_project_tasks` - List tasks in a project
- `teamwork_get_task_detail` - Get full task details
- `teamwork_create_task` - Create a new task
- `teamwork_update_task` - Update an existing task
- `teamwork_move_task` - Move task between lists
- `teamwork_move_task_stage` - Move task to workflow stage
- `teamwork_get_workflow_stages` - List workflow stages
- `teamwork_get_task_comments` - Get task comments
- `teamwork_add_task_comment` - Add comment to task
- `teamwork_add_task_time_entry` - Add time entry to task
- `teamwork_get_notifications` - Get notifications
- `teamwork_upload_file_to_task` - Attach file to task

## Troubleshooting

### MCP Server Won't Start

```bash
# Test the configuration
npm run check

# Run in debug mode
LOG_LEVEL=debug npm start
```

### Tools Not Available

1. Verify the MCP JSON configuration points to the correct server path
2. Ensure environment variables are set correctly
3. Check that the API token is valid and has appropriate permissions

### Time Entry Issues

The time entry endpoint requires:
- Valid taskId
- Valid date format (YYYY-MM-DD)
- Valid hours/minutes values

## Performance Notes

- Default request timeout: 30 seconds
- Auto-retry on transient errors (429, 5xx, timeouts)
- Structured JSON logging for debugging

## Security

- Always keep `.env` in `.gitignore`
- Use environment variables for sensitive data
- Set `TEAMWORK_READ_ONLY=true` for safety if only reading
- Rotate API tokens periodically

## Support

For issues or questions:
1. Check the logs with `LOG_LEVEL=debug npm start`
2. Verify your Teamwork API token is valid
3. Ensure your network can reach the Teamwork API
4. Review the README.md for additional configuration options
