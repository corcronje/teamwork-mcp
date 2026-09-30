# Architecture

```
MCP client (Claude Code, VS Code/Copilot, Claude Desktop, ...)
   │  stdio: JSON-RPC on stdin/stdout, JSON logs on stderr
   ▼
src/server.js      McpServer + StdioServerTransport; registers the tool table,
   │               wraps handlers (logging, MCP error formatting)
   ▼
src/tools.js       one entry per tool: name, zod input shape, annotations,
   │               write flag, handler; guardWrite() for every write
   ▼
src/teamworkClient.js   Teamwork REST client (v3 primary, v1 where needed)
   │   ├─ src/stages.js   stage-name resolution (pure)
   │   ├─ src/errors.js   MCPError hierarchy + Teamwork error parsing
   │   └─ src/logger.js   structured JSON logs to stderr
   ▼
https://<site>/projects/api/v3   and   /projects/api/v1   (+ presigned S3 PUT for uploads)
```

`src/config.js` reads env vars (plus an optional `TEAMWORK_CONFIG_FILE`); env wins.
`src/task-stage.js` is a CLI that uses the same client and guard. `src/Task.js` and
`src/TaskQueue.js` are optional helpers for scripts that use the client as a library.

## Request flow

1. The SDK validates arguments against the tool's zod shape; invalid input is rejected
   before the handler runs.
2. Write tools call `guardWrite()` (below) first.
3. The handler calls one `TeamworkClient` method. List methods return compact summaries
   unless `detail: "full"`. Summaries resolve names for projects and users (v3
   `include=`) and stages (cached per workflow for 5 minutes).
4. The result is returned as JSON text. Errors become `isError: true` with
   `{code, message, data}` (see README).

## API usage

- **v3** (`/projects/api/v3`) for everything it supports: me, projects, tasks,
  task lists, workflows/stages, comment reads, time tracking, file lookup, notifications.
- **v1** (`/projects/api/v1`) only where v3 has no working equivalent: comment create,
  edit and delete, task complete/uncomplete, the upload presign endpoint (which exists
  only under this prefix, not at the site root), attaching files to tasks, file delete.
- There is no multi-endpoint fallback chain. Each operation uses the one endpoint that
  was verified to work (see STATUS.md), so failures are real failures, not a silent
  switch to a different endpoint.

The "me" identity comes from `GET /me.json` once per process (a failed lookup is not
cached). No ids are hardcoded.

### Stage resolution (`src/stages.js`)

The workflow comes from the task's own `workflowStages`, or the project's single
workflow (`GET /projects/{id}/workflows.json`), or an explicit `workflowId`. The query is
matched against that workflow's stages in this order: id, exact name ignoring case and
punctuation, synonym, contiguous in-order words, small typo. The first rule with exactly
one hit wins. A rule with several hits stops and raises an error listing the candidates.

### Uploads

`GET /projects/api/v1/pendingfiles/presignedurl.json` returns a URL and ref. The file is
PUT to the URL, then the ref is attached: `pendingFileAttachments` on
`POST /tasks/{id}/files.json` (task), `POST /tasks/{id}/comments.json` (new comment) or
`PUT /comments/{id}.json` (existing comment, current body re-sent). Files must be
regular files, and must be under `TEAMWORK_UPLOAD_ROOTS` if that is set.

## Write guard (`guardWrite` in src/tools.js)

1. `TEAMWORK_READ_ONLY=true`: refuse.
2. No `TEAMWORK_ALLOWED_PROJECT_IDS`: allow (no extra API calls).
3. Otherwise resolve every project the write touches: given `projectId`, the task's
   project, the target task list's project, or the project of the comment, time entry
   or file. Refuse if any is outside the list, or if none can be resolved (fail closed).

## Resilience

- Per-request timeout (`TEAMWORK_REQUEST_TIMEOUT`, AbortController).
- Retries with exponential backoff and jitter (`TEAMWORK_MAX_RETRIES`): 429 for any
  verb (honouring `Retry-After`); 5xx, 408 and timeouts only for GET/PUT/PATCH/DELETE.
  POST is never retried on those, to avoid duplicate comments, time entries or tasks.
- Pagination helpers stop after 200 pages and report `truncated`.

## Adding a tool

Add an object to the array in `buildTools()` in `src/tools.js` (zod shape, `write: true`
plus a `guard({...ids})` call if it writes), add the client method, and add a unit test.
Registration, JSON Schema generation, logging and error formatting are automatic.
