# Running and operating the server

This is a local **stdio** MCP server. It is not a network service: there is nothing to
host, load-balance or expose. Each MCP client session starts its own `node src/server.js`
process and talks to it over stdin/stdout, so several agents and editors can use one
checkout at the same time, each with its own process and its own environment (for
example a different `TEAMWORK_ALLOWED_PROJECT_IDS` per repo).

Client registration: [docs/CLIENT_SETUP.md](docs/CLIENT_SETUP.md).

## Checklist for a new site or user

1. Create an API key for the Teamwork user the agents should act as. Everything they do
   is attributed to that user, and "my tasks/time" means that user.
2. Start with `TEAMWORK_READ_ONLY=true` and try the read tools.
3. Enable writes with `TEAMWORK_READ_ONLY=false`, preferably with
   `TEAMWORK_ALLOWED_PROJECT_IDS` limited to the projects that client works on.
4. Optionally set `TEAMWORK_UPLOAD_ROOTS` (e.g. your repos directory).
5. Optionally run `npm run test:live` with `TEAMWORK_TEST_PROJECT_ID` pointing at a
   sandbox project.

## Updating

```bash
cd /path/to/teamwork-mcp
git pull
npm install
npm run test:unit
```

Then restart the server in each client (VS Code: MCP: List Servers > Restart; Claude
Code: restart the session or `/mcp`; Claude Desktop: quit and reopen). Running processes
keep the old code and tool list until restarted.

### Upgrading from 2.x to 3.0

- The server entry point and env vars are unchanged; existing client configs keep working.
- If your config did not set `TEAMWORK_AUTH_MODE`, it now defaults to `basic_token_x`
  (correct for API keys). Set `bearer` explicitly only for OAuth tokens.
- Callers that parsed raw list payloads should pass `detail: "full"` or use the summaries.
- Callers that relied on `stage: "selected" | "in_progress" | "qa_ready"` mapping to
  EDCTP stage ids: those names now resolve against each task's own workflow. `qa_ready`
  is ambiguous on boards with several "QA Ready" stages and returns the options.
- `teamwork_get_notifications` takes `limit`/`cursor`.
- See CHANGELOG 3.0.0 for everything else.

## Logs

JSON lines on stderr (stdout is reserved for the protocol). `LOG_LEVEL=debug` adds one
line per API request: method, URL, status and duration. Tokens are never logged. Where
to find stderr:

- VS Code: Output panel > "MCP: teamwork" (or MCP: List Servers > Show Output)
- Claude Code: `claude --debug`, or `/mcp` for status
- Claude Desktop (macOS): `~/Library/Logs/Claude/mcp-server-<name>.log`

```bash
# filter warnings/errors from a manual run
LOG_LEVEL=debug node src/server.js 2> >(jq -c 'select(.level != "debug")' >&2)
```

## Connectivity check

```bash
curl -s -u "$TEAMWORK_API_TOKEN:x" "$TEAMWORK_BASE_URL/projects/api/v3/me.json" | jq '.person | {id, firstName, lastName}'
```

A Teamwork API key must be sent as Basic `token:x`; `Authorization: Bearer <api key>`
returns 401.

## Token rotation

1. Create the new key in Teamwork.
2. Replace `TEAMWORK_API_TOKEN` wherever it is set (client config, shell profile, `.env`).
3. Restart the server in each client and call `teamwork_get_current_user`.
4. Revoke the old key.

If a token was ever committed or pasted somewhere shared, revoke it immediately.

## Rate limits

Teamwork rate-limits per account. The server retries 429 responses with backoff and
honours `Retry-After`. Large calls (`teamwork_get_my_tasks` walks every page, up to 250
tasks per request) cost several requests; use `projectId` filters where possible.
