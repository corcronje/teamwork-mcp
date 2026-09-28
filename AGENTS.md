# Agent notes

For coding agents using this server, or working on this repository.

## Using the tools

- Start with `teamwork_get_current_user`: "my tasks" and "my time" mean that user.
- Find ids with `teamwork_list_projects`, then `teamwork_get_project_board` (lanes) and
  `teamwork_get_project_task_lists`. Never assume ids from another project.
- Move tasks with `teamwork_move_task_stage` and a stage **name** from that project's
  board (e.g. `"In Progress"`). If a name is ambiguous the tool returns the real stage
  names; retry with the exact name or its id. The move is verified before success is reported.
- Log time with `teamwork_log_my_time` (task or project) and a real start `time` (`HH:MM`).
- Write tools may be blocked by `TEAMWORK_READ_ONLY` or `TEAMWORK_ALLOWED_PROJECT_IDS`;
  a `FORBIDDEN` error says which.
- List tools return compact summaries; pass `detail: "full"` only when you need raw fields.

## Working on this repo

- Entry point `src/server.js`; tools in `src/tools.js`; API client `src/teamworkClient.js`.
- Before committing: `npm run check && npm run test:unit`. If you changed API behaviour,
  also run `npm run test:live` against a sandbox project (`TEAMWORK_TEST_PROJECT_ID`).
- Teamwork silently ignores unknown parameters and fields. Verify any new filter or field
  against the live API, and compare with a client-side check, before relying on it.
  Record the finding in STATUS.md.
- Never hardcode project, workflow, stage or user ids in `src/`.
- After changing tools, restart the server in the MCP client; tool lists are cached per process.
