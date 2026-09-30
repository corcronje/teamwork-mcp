# Changelog

All notable changes to this project are documented in this file.

## [3.0.0] - 2026-09-30

A correctness and completeness release. Every Teamwork endpoint and field used was
re-verified against a live site. Most 2.x bugs returned HTTP 200 while doing the wrong
thing, because Teamwork silently ignores unknown query parameters and body fields.
Evidence for each item is in [STATUS.md](STATUS.md#verified-teamwork-api-behaviour).

### Release hardening

- Resolved all `npm audit` findings in production dependencies (`hono`, `fast-uri`,
  `body-parser`, `@hono/node-server`) via lockfile update.
- `scripts/one-off/` (client-specific task scripts) is no longer tracked and is gitignored.
- `.gitignore` now excludes `.env.*`, `.mcp.json`, `secrets.json`, local agent files and build output.

### Why 3.0.0 (breaking)

- List tools return compact summaries by default (`detail: "full"` for raw payloads).
- Task `priority` is the v3 string enum (`low`/`medium`/`high`/`none`), not 0-4.
- Stage aliases resolve against each task's own workflow instead of hardcoded EDCTP
  ids, and ambiguous names now return an error instead of moving the task.
- `teamwork_get_notifications` takes `limit`/`cursor` (the API ignored `page`/`pageSize`).
- `TEAMWORK_AUTH_MODE` defaults to `basic_token_x`.
- Requires `@modelcontextprotocol/sdk` >= 1.28.

### Fixed

- **List tasks assigned to me returned every open task on the site.** `assignedToMe`
  and `assignedToUserIds` are ignored by `GET /tasks.json`. The server now resolves the
  token owner via `GET /me.json` (cached per process), filters with
  `responsiblePartyIds`, re-checks each task's `assigneeUserIds`, and fetches all pages.
- **`includeCompleted` never worked**; the parameter is `includeCompletedTasks`.
- **Comment deletion and editing** used `/tasks/{taskId}/comments/{id}.json`, which
  does not exist (400). They now use `/comments/{id}.json`. The "known limitation" in
  the 2.x README is removed; it was this wrong URL, not a Teamwork bug.
- **Reading comments** via v1 was a 404 on `/projects/api/v1`; it now uses v3.
- **Time entry edit/delete** used nested URLs (400). Time tracking now uses v3
  (`/tasks/{id}/time.json`, `/time/{id}.json`); `HH:MM` is converted to the required `HH:MM:SS`.
- **Editing tasks** sent `content` (ignored, so titles never changed), numeric priority
  (400) and `assignedToUserIds`. It now sends v3 `name`, `priority`, `dueAt`,
  `startAt`, `estimatedMinutes`, `assignees.userIds`, `progress` and `tasklistId`;
  `null` clears dates and priority. Due dates, assignment and priority were never
  "account limitations".
- **Completing tasks** was a silent no-op (v3 PATCH); it now uses v1 complete/uncomplete.
- **Creating tasks** now honours assignees, priority, dates and estimate.
- **Hardcoded EDCTP workflow/stage ids** removed from `server.js` and `task-stage.js`.
  Stages are resolved by name via `src/stages.js`.
- **Write allowlist was bypassed**: `TEAMWORK_ALLOWED_PROJECT_IDS` was only checked by
  `create_task`. Every write tool now resolves the project it would touch and refuses
  when it cannot tell.
- **Duplicate writes**: POSTs were retried on 5xx/timeouts; they no longer are.
- **Errors showed "Unknown error"**: Teamwork's v1/v3 error bodies are now parsed, and
  `instanceof` works for error subclasses (the prototype was reset to `MCPError`).
- Config: a config file's `requestTimeout`/`maxRetries`/`authMode` were always overridden
  by env defaults; `TEAMWORK_MAX_RETRIES=0` now disables retries.
- `TaskQueue` read v1 field names absent from v3 payloads and silently returned wrong results.

### Added

- Tools (13 before, 29 now): `teamwork_list_projects`, `teamwork_get_current_user`,
  `teamwork_get_project_task_lists`, `teamwork_get_project_board`,
  `teamwork_get_stage_tasks`, `teamwork_complete_task`, `teamwork_delete_task`,
  `teamwork_update_task_comment`, `teamwork_delete_task_comment`,
  `teamwork_attach_files_to_comment`, `teamwork_delete_file`,
  `teamwork_get_task_time_entries`, `teamwork_update_time_entry`,
  `teamwork_delete_time_entry`, `teamwork_get_my_time_entries`, `teamwork_log_my_time`.
  Several of these were listed in the 2.x README but never registered.
- Comment attachments: `filePaths` on `teamwork_add_task_comment`, using the same
  upload flow as task attachments. Multiple files per task upload.
- Project-level time logging (Teamwork has no project-less time entries).
- `TEAMWORK_UPLOAD_ROOTS` to restrict which local files may be uploaded.
- `npm test`: an offline unit suite plus an opt-in live end-to-end suite over real MCP
  stdio that covers all 17 required capabilities and cleans up after itself.
- [docs/CLIENT_SETUP.md](docs/CLIENT_SETUP.md) (was `CLAUDE_CODE_SETUP.md`): Claude Code,
  VS Code / Copilot, Copilot CLI, Claude Desktop and generic stdio setup.

### Removed

- `teamworkClient.js.backup` / `.bak`, the `get-task*.js` debug stubs, the placeholder
  `resources.js`, the four ad-hoc `test-*.js` files and `scripts/integration-test.js`.
- Client filter helpers that only looked at the first 50 tasks (`filterTasksBy*`,
  `listAllTasks`, `searchTasks`); use `getProjectTasks` with `searchTerm` / `assigneeUserId`.
- The `task:create-mock` npm script (it wrote into a hardcoded client project).
- FEATURES_COMPLETE.md, IMPLEMENTATION_PLAN.md and MCP_IMPROVEMENTS.md, whose claims were
  inaccurate; STATUS.md is the single current status document.

### Moved

- Root one-off scripts to `scripts/one-off/`, marked historical. They contain
  site-specific ids and are not part of the reusable server.

## [2.0.0] - 2026-06-19

### Added

#### Core Infrastructure
- **Structured Logging:** New `logger.js` module with JSON-based logging to stderr, supports `LOG_LEVEL` environment variable (debug, info, warn, error)
- **Error Handling:** New `errors.js` module with MCP-compliant custom error types:
  - `ValidationError` (400)
  - `AuthenticationError` (401)
  - `AuthorizationError` (403)
  - `NotFoundError` (404)
  - `ServerError` (500)
  - `TimeoutError` (504)
  - `RateLimitError` (429)
- **Version Management:** New `version.js` with capability declarations and feature flags

#### Resilience & Robustness
- **Request Timeout Handling:** All API requests use `AbortController` with configurable timeout (`TEAMWORK_REQUEST_TIMEOUT`, default 30s)
- **Automatic Retries:** Exponential backoff (1s → 2s → 4s) for transient errors (5xx, 429, timeouts) with jitter
- **Enhanced Error Responses:** All errors now follow MCP spec format with code, message, context, and retry information
- **API Error Parsing:** Teamwork API errors properly parsed and mapped to appropriate MCP error types

#### Configuration Flexibility
- **Config File Support:** Load configuration from `mcp.config.json` via `TEAMWORK_CONFIG_FILE` environment variable
- **New Environment Variables:**
  - `TEAMWORK_REQUEST_TIMEOUT` - Request timeout in milliseconds (default: 30000)
  - `TEAMWORK_MAX_RETRIES` - Maximum retry attempts (default: 3)
  - `LOG_LEVEL` - Logging verbosity (default: info)
  - `TEAMWORK_CONFIG_FILE` - Path to JSON config file
- **Configuration Precedence:** Environment variables > Config file > Defaults

#### Operational Improvements
- **Tool Call Logging:** All tool invocations logged with duration and error context
- **Request Logging:** API requests logged with method, URL, status, and duration
- **Better Validation Errors:** Zod validation errors converted to readable messages with field paths and guidance
- **Server Initialization:** Improved startup logging with configuration summary

### Changed

- **Server Version:** Bumped to 2.0.0, MCP spec version 2024-11-05
- **Error Handling:** Replaced generic error responses with MCP-compliant structured errors
- **Input Validation:** Changed from `parse()` to `safeParse()` for better error handling
- **Client Resilience:** All fetch calls now include timeout and retry logic
- **Logging:** Introduced structured JSON logging throughout for better observability
- **Configuration Loading:** Enhanced `config.js` with config file support and better validation

### Breaking Changes

- Error response format now follows MCP spec (includes `code`, `message`, `data` fields instead of simple `error` string)
- Configuration validation errors now include more detail about invalid fields
- Clients expecting legacy error format must update to handle new MCP-compliant responses

### Fixed

- Request timeout handling - previously had no timeout protection
- Transient API errors now properly retried instead of failing immediately
- Configuration validation errors now include helpful field-level messages
- API fallback endpoints now properly handle timeouts

### Documentation

- Expanded README with troubleshooting guide including error codes and remediation
- Added MCP compliance section with capability declarations
- Added performance and optimization guidance
- Documented configuration precedence and config file support
- Added logging setup instructions for debugging

## [1.0.0] - 2026-05-29

### Added

- Public production-ready documentation for MCP setup and usage.
- `teamwork_move_task_stage` support with stage aliases.
- Local helper scripts:
  - `npm run task:create-mock`
  - `npm run task:move-stage`
- Security and contribution docs (`SECURITY.md`, `CONTRIBUTING.md`).

### Changed

- Hardened `.gitignore` to prevent secrets and local scratch files from being committed.
- Improved task creation fallback behavior via task list inference.
- Standardized package metadata for public GitHub repository release.
