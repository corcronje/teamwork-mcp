# Time Entry Implementation Guide

## Overview

The Teamwork MCP now supports creating time entries on tasks through the `teamwork_add_task_time_entry` tool. This guide documents the implementation and how to use it.

## Endpoint Details

### API Endpoint
- **v1 API Endpoint**: `/projects/{projectId}/timelogs.json`
- **Method**: POST
- **Authentication**: Basic Auth (token:x format)

### Request Structure

```json
{
  "time-entry": {
    "logged-date": "YYYY-MM-DD",
    "task-id": "string",
    "hours": number,
    "minutes": number,
    "isbillable": boolean,
    "description": "string (optional)",
    "time": "HH:MM (optional)",
    "user-id": "string (optional)"
  }
}
```

### Key Implementation Details

1. **Hyphenated Field Names**: The Teamwork v1 API requires hyphenated field names (`logged-date`, `task-id`, `user-id`)
2. **Project ID Requirement**: Project ID must be fetched from task details before creating a time entry
3. **Date Format**: Must be in ISO 8601 format (YYYY-MM-DD)
4. **Fallback Mechanism**: The implementation tries multiple endpoint variations for compatibility:
   - `/projects/{projectId}/timelogs.json` (primary)
   - `/projects/{projectId}/time_entries.json`
   - `/tasks/{taskId}/time_entries.json`
   - `/timelogs.json`

## Usage Example

```javascript
const client = new TeamworkClient(config);

const result = await client.addTaskTimeEntry({
  taskId: "48034474",
  description: "Implementation work",
  date: "2026-07-03",
  time: "15:25",
  hours: 1,
  minutes: 41
});

// Response:
// {
//   "STATUS": "OK",
//   "timeLogId": "21777729"
// }
```

## MCP Tool Usage

Through the MCP, you can create time entries:

```
teamwork_add_task_time_entry {
  taskId: "48034474"
  description: "Implementation work"
  date: "2026-07-03"
  time: "15:25"
  hours: 1
  minutes: 41
}
```

## Response Format

Success response:
```json
{
  "STATUS": "OK",
  "timeLogId": "21777729"
}
```

Error response:
```json
{
  "STATUS": "Error",
  "MESSAGE": "Error message"
}
```

## Troubleshooting

### "logged date must be specified" Error
- This error occurs when the request body doesn't properly include the `logged-date` field
- Ensure field names are hyphenated (not camelCase or snake_case)
- Verify date format is YYYY-MM-DD

### "Project ID not found" Error
- The task must exist in a project
- The MCP automatically fetches the project ID from task details
- If the task doesn't have a project context, the operation will fail

### 400 Bad Request
- The implementation uses a fallback mechanism to try multiple endpoints
- If all endpoints fail with 400, check:
  - Task ID validity
  - Date format (must be YYYY-MM-DD)
  - Field name formatting (must use hyphens)

## Implementation Notes

### Architecture Decision
The implementation uses a fallback mechanism to handle different Teamwork configurations:
- Primary endpoint: `/projects/{projectId}/timelogs.json`
- Falls back to alternative endpoints if primary fails
- This ensures compatibility across different Teamwork instances

### Performance
- Time entries are created through a single HTTP request
- Project ID is fetched in a preliminary request (cached in memory for the duration of the operation)
- Typical response time: <2 seconds

### Data Flow
1. User calls `addTaskTimeEntry(taskId, ...)`
2. MCP fetches task details to extract `project-id`
3. MCP constructs time entry request with hyphenated field names
4. MCP attempts primary endpoint
5. If primary fails, MCP attempts fallback endpoints
6. Returns `STATUS: OK` with `timeLogId` on success

## API Compatibility

- **Tested with**: Teamwork API v1
- **Endpoint variants supported**: Multiple (with fallback)
- **Field name style**: Hyphenated (Teamwork v1 convention)
- **Authentication**: Basic auth (token:x format)

## See Also

- [README.md](../README.md) - Main MCP documentation
- [teamworkClient.js](../src/teamworkClient.js) - Implementation details
- [CLAUDE_CODE_SETUP.md](../CLAUDE_CODE_SETUP.md) - VS Code configuration
