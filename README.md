# Teamwork MCP Server

An MCP (Model Context Protocol) server for [Teamwork.com](https://www.teamwork.com), for
coding agents and humans: Claude Code, VS Code / GitHub Copilot, Claude Desktop, or any
other stdio MCP client.

It is **project-agnostic and user-agnostic**. Point it at any Teamwork site with any
user's API token and every tool works for any project the token can see. No project,
workflow, stage or user ids are hardcoded. "My" tasks and time always mean the user who
owns the token (resolved at runtime via `GET /me.json`), and board lanes are resolved
by name against each project's own workflow.

## Quick start

```bash
git clone git@github.com:corcronje/teamwork-mcp.git
cd teamwork-mcp
npm install
npm run test:unit
```

Then register `node /absolute/path/to/teamwork-mcp/src/server.js` with your client:
**[docs/CLIENT_SETUP.md](docs/CLIENT_SETUP.md)** has exact, copy-paste setup for
Claude Code (`claude mcp add` / `.mcp.json`), VS Code and GitHub Copilot (`mcp.json`),
the Copilot CLI, Claude Desktop (`claude_desktop_config.json`), and any other stdio client.

Minimum environment:

```bash
TEAMWORK_BASE_URL=https://your-site.teamwork.com
TEAMWORK_API_TOKEN=your_api_token
```

## Tools (29)

"Me" = the owner of the configured API token. Write tools are subject to
`TEAMWORK_READ_ONLY` and `TEAMWORK_ALLOWED_PROJECT_IDS` (see [Safety](#safety)).

### Identity and projects

| Tool | What it does |
|---|---|
| `teamwork_get_current_user` | Who the token belongs to |
| `teamwork_list_projects` | **List my projects** (`status`: active / archived / all, `searchTerm`) |
| `teamwork_get_project_task_lists` | Task lists in a project |

### Tasks

| Tool | What it does |
|---|---|
| `teamwork_get_my_tasks` | **List tasks assigned to me**, across all projects or one (`projectId`, `includeCompleted`) |
| `teamwork_get_project_tasks` | **List tasks within a project** (`searchTerm`, `assigneeUserId`, `includeCompleted`, paging) |
| `teamwork_get_task_detail` | Full task payload |
| `teamwork_create_task` | Create a task (assignees / `assignToMe`, priority, dates, estimate, initial `stage`) |
| `teamwork_update_task` | **Edit a task**: title, description, priority, due/start date (`null` clears), estimate, progress, assignees, task list, completed |
| `teamwork_complete_task` | Complete or reopen |
| `teamwork_delete_task` | Delete (to trash) |

### Boards (workflow stages / lanes)

| Tool | What it does |
|---|---|
| `teamwork_get_project_board` | **List lanes**: a project's workflow(s) and stages in board order |
| `teamwork_get_workflow_stages` | Stages of a workflow by id |
| `teamwork_get_stage_tasks` | **List tasks in a lane**, by stage name or id |
| `teamwork_move_task_stage` | Move a task to a lane by stage name or id (workflow inferred from the task, move verified) |
| `teamwork_move_task` | Deprecated alias of `teamwork_move_task_stage` |

Stage names are matched against the task's or project's real workflow, ignoring case and
punctuation: `"in_progress"`, `"In-Progress"` and `"in progress"` are the same. A unique
partial or near-miss name also resolves (`"qa ready"` finds `"QA Ready STAGE"` when it
is the only match). If a name matches more than one stage, for example `"qa_ready"` on a
board with both "DEV QA Ready" and "QA Ready STAGE", the tool **refuses and lists the
real stage names**; it never guesses.

### Comments

| Tool | What it does |
|---|---|
| `teamwork_get_task_comments` | **Read comments** (author, body, attachments) |
| `teamwork_add_task_comment` | **Post a comment**, optionally with `filePaths` attached |
| `teamwork_update_task_comment` | **Edit a comment** |
| `teamwork_delete_task_comment` | **Remove a comment** |
| `teamwork_attach_files_to_comment` | **Attach files to an existing comment** (text and existing files kept) |

### Files

| Tool | What it does |
|---|---|
| `teamwork_upload_file_to_task` | **Attach files to a task** (`filePath` or `filePaths`) |
| `teamwork_delete_file` | Delete a file (e.g. an attachment) |

### Time tracking

| Tool | What it does |
|---|---|
| `teamwork_get_task_time_entries` | **List time entries against a task** (all users, with total) |
| `teamwork_add_task_time_entry` | **Add a time entry to a task** (for me, or `userId`) |
| `teamwork_update_time_entry` | Edit a time entry |
| `teamwork_delete_time_entry` | **Remove a time entry** |
| `teamwork_get_my_time_entries` | **Read my time log** across all projects/tasks (`startDate`, `endDate`, `projectId`) |
| `teamwork_log_my_time` | **Add to my time log**: against a task, or against a project with no task |

Teamwork requires every time entry to belong to a project: there is no project-less
"personal" time entry (`POST /time.json` returns 405). "Add to my time log" therefore
means logging as yourself against a task, or against a project without a task, which
Teamwork calls project time. It is refused if the project has "time logs require a task"
enabled (`timelogRequiresTask` in `teamwork_list_projects`).

### Notifications

| Tool | What it does |
|---|---|
| `teamwork_get_notifications` | My notifications (cursor paging: `limit`, `cursor`) |

List tools return compact summaries by default (id, name, status, priority, dates,
project, task list, assignees with names, stage with name, URL). Pass
`detail: "full"` for raw Teamwork payloads.

## Configuration

All configuration is environment variables. The full table is in
[docs/CLIENT_SETUP.md](docs/CLIENT_SETUP.md#environment-variables).

| Variable | Default | |
|---|---|---|
| `TEAMWORK_BASE_URL` | (required) | e.g. `https://your-site.teamwork.com` |
| `TEAMWORK_API_TOKEN` | (required) | Teamwork API key |
| `TEAMWORK_AUTH_MODE` | `basic_token_x` | `bearer` only for OAuth access tokens |
| `TEAMWORK_READ_ONLY` | `true` | `false` enables write tools; verify read tools first |
| `TEAMWORK_ALLOWED_PROJECT_IDS` | (any) | Comma-separated project ids writes may touch |
| `TEAMWORK_UPLOAD_ROOTS` | (any) | Comma-separated directories uploads must come from |
| `TEAMWORK_REQUEST_TIMEOUT` / `TEAMWORK_MAX_RETRIES` | `30000` / `3` | |
| `TEAMWORK_CONFIG_FILE` | | Optional JSON file ([example](mcp.config.example.json)); env vars take precedence |
| `LOG_LEVEL` | `info` | JSON logs on stderr |

## Safety

- **Read-only mode**: on by default. `TEAMWORK_READ_ONLY=true` (the default) blocks every write tool; set it to `false` explicitly once you've verified read tools first. Tool descriptions say so, so agents know.
- **Project allowlist**: with `TEAMWORK_ALLOWED_PROJECT_IDS` set, every write tool resolves the project it would touch (from the task, task list, comment, time entry or file id) and refuses anything outside the list. If the project cannot be determined, the write is refused. Setting this per repo or agent is the simplest way to keep several concurrent agents in their own projects.
- **Upload roots**: `TEAMWORK_UPLOAD_ROOTS` stops agents uploading arbitrary local files (e.g. from `~/.ssh`).
- **No duplicate writes**: POSTs (new comments, time entries, tasks) are never retried on 5xx/timeouts, because the server may already have applied them. Reads and idempotent writes retry with backoff; 429s retry for any verb.
- **Secrets**: the token is read only from the environment or config file and is never logged. `.env` and `mcp.config.json` are gitignored. Use placeholders in anything you commit (see CLIENT_SETUP for `${VAR}` / `${input:...}` patterns).

## Development

```bash
npm run check       # syntax check
npm run test:unit   # offline: 35 tests, no credentials
npm run test:live   # real API end to end (needs TEAMWORK_TEST_PROJECT_ID)
npm test            # both
LOG_LEVEL=debug npm start
npm run task:move-stage -- --taskId 123 --stage "in progress"   # CLI helper, any project
```

The live suite starts the real stdio server, creates one temporary task in
`TEAMWORK_TEST_PROJECT_ID`, exercises every capability above against the real API, and
deletes everything it created. It locks the server to that project and to a temporary
upload directory, so it cannot write anywhere else. See [TEST_RESULTS.md](TEST_RESULTS.md).

Library use (`src/teamworkClient.js`, plus the `Task` and `TaskQueue` helpers) is
described in [docs/TASK_CLASS.md](docs/TASK_CLASS.md) and [docs/TASK_QUEUE.md](docs/TASK_QUEUE.md).
`scripts/one-off/` holds historical single-use scripts with hardcoded ids from one
site. They are not part of the product.

## Documentation

- [docs/CLIENT_SETUP.md](docs/CLIENT_SETUP.md): Claude Code, VS Code / Copilot, Copilot CLI, Claude Desktop, generic stdio
- [STATUS.md](STATUS.md): capability matrix, known limitations, verified Teamwork API behaviour
- [ARCHITECTURE.md](ARCHITECTURE.md): module layout, request flow, write guard
- [DEPLOYMENT.md](DEPLOYMENT.md): running and updating the server, logs, token rotation
- [docs/TIME_ENTRY_IMPLEMENTATION.md](docs/TIME_ENTRY_IMPLEMENTATION.md): time tracking details
- [CHANGELOG.md](CHANGELOG.md)

## Errors

Tool errors come back as `isError: true` with a JSON body:

```json
{ "code": "INVALID_REQUEST", "message": "Stage \"qa_ready\" is ambiguous ...", "data": { "status": 400, "context": {}, "retryable": false } }
```

| Code | Status | Typical cause |
|---|---|---|
| `INVALID_REQUEST` | 400/422 | Bad input, ambiguous/unknown stage, Teamwork rejected the data (message says why) |
| `AUTHENTICATION_FAILED` | 401 | Wrong token, or `TEAMWORK_AUTH_MODE=bearer` with an API key |
| `FORBIDDEN` | 403 | Read-only mode, project not allowlisted, upload outside roots, or a Teamwork permission |
| `NOT_FOUND` | 404 | Wrong id, or deleted |
| `RATE_LIMIT_EXCEEDED` | 429 | Retried automatically |
| `REQUEST_TIMEOUT` / `INTERNAL_ERROR` | 504 / 5xx | Network or Teamwork outage |

## License

MIT. See [LICENSE](LICENSE). Security reports: [SECURITY.md](SECURITY.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).
