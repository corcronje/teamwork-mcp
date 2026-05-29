# Agent Notes

Operational notes for coding assistants using this repository.

## Source Of Truth

- MCP server project: this repository
- Server entry point: `src/server.js`

## Recommended Flow

1. Verify syntax with `npm run check`.
2. Start in read-only mode first (`TEAMWORK_READ_ONLY=true`).
3. Enable writes only when required.
4. Restrict write access using `TEAMWORK_ALLOWED_PROJECT_IDS` where possible.

## Stage Move Shortcut

Preferred tool:

- `teamwork_move_task_stage`

Supported aliases:

- `selected`
- `in_progress`
- `qa_ready`

## Local Helper Commands

```bash
npm run task:create-mock
npm run task:move-stage -- --taskId <id> --stage <selected|in_progress|qa_ready>
```

## Troubleshooting

- If chat tool contracts appear stale after code updates, reload the MCP host/editor session.
- If create operations fail due to account endpoint differences, verify `taskListId` and fallback behavior.
- Always verify stage transitions with a follow-up task detail read.
