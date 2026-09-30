# Client setup

This server is a plain **stdio** MCP server. Every MCP client starts it the same way:

| | |
|---|---|
| command | `node` (or an absolute path to `node`, see [Claude Desktop](#claude-desktop)) |
| args | `["/absolute/path/to/teamwork-mcp/src/server.js"]` |
| env | the `TEAMWORK_*` variables below |
| transport | stdio: JSON-RPC on stdout, JSON logs on stderr |

The only real differences between clients are **where the JSON file lives** and
**which top-level key it uses** (`servers` in VS Code, `mcpServers` in Claude
Code / Claude Desktop / Copilot CLI).

One checkout can serve any number of clients, projects and agents at once. Each
client session starts its own server process, and nothing in the server is tied
to a particular project or user: "me" is always whoever owns the configured token.

- [Install](#install)
- [Environment variables](#environment-variables)
- [Claude Code](#claude-code)
- [VS Code (and GitHub Copilot in VS Code)](#vs-code-and-github-copilot-in-vs-code)
- [GitHub Copilot CLI](#github-copilot-cli)
- [Claude Desktop](#claude-desktop)
- [Any other stdio MCP client](#any-other-stdio-mcp-client)
- [Verify and troubleshoot](#verify-and-troubleshoot)

## Install

```bash
git clone git@github.com:corcronje/teamwork-mcp.git
cd teamwork-mcp
npm install
npm run test:unit        # offline sanity check, no credentials needed
```

Requires Node.js 18+. Use the absolute path of `src/server.js` in every config below.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `TEAMWORK_BASE_URL` | yes | | Your site, e.g. `https://your-site.teamwork.com` |
| `TEAMWORK_API_TOKEN` | yes | | Teamwork API key (Profile > Edit my details > API & Mobile) |
| `TEAMWORK_AUTH_MODE` | no | `basic_token_x` | `basic_token_x` for Teamwork API keys (Bearer returns 401 for them); `bearer` only for OAuth access tokens |
| `TEAMWORK_API_VERSION` | no | `v3` | Leave as `v3` |
| `TEAMWORK_READ_ONLY` | no | `true` | `false` enables write tools; verify read tools first |
| `TEAMWORK_ALLOWED_PROJECT_IDS` | no | (any) | Comma-separated project ids that write tools may touch. Writes whose project cannot be determined are refused. |
| `TEAMWORK_UPLOAD_ROOTS` | no | (any) | Comma-separated directories. If set, the attach tools only upload files inside them. |
| `TEAMWORK_REQUEST_TIMEOUT` | no | `30000` | ms |
| `TEAMWORK_MAX_RETRIES` | no | `3` | `0` disables retries. POSTs are never retried on 5xx/timeouts. |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error` (stderr) |

Never put a real token in a file that is committed to git. Each section below shows
a way to keep the token out of shared files.

## Claude Code

Claude Code's config format differs from VS Code's: the key is `mcpServers`, not `servers`.

**User scope** (available in every project on this machine; stored in `~/.claude.json`):

```bash
claude mcp add teamwork -s user \
  -e TEAMWORK_BASE_URL=https://your-site.teamwork.com \
  -e TEAMWORK_API_TOKEN=your_api_token \
  -e TEAMWORK_AUTH_MODE=basic_token_x \
  -- node /absolute/path/to/teamwork-mcp/src/server.js
```

**Project scope** (shared with a repo via `.mcp.json` at its root). Keep the token out
of the file with `${VAR}` expansion; Claude Code substitutes it from the environment
it was launched in:

```bash
cd /path/to/your/repo
claude mcp add teamwork -s project \
  -e TEAMWORK_BASE_URL=https://your-site.teamwork.com \
  -e 'TEAMWORK_API_TOKEN=${TEAMWORK_API_TOKEN}' \
  -e TEAMWORK_AUTH_MODE=basic_token_x \
  -e TEAMWORK_ALLOWED_PROJECT_IDS=12345 \
  -- node /absolute/path/to/teamwork-mcp/src/server.js
```

That writes exactly this (verified with `claude mcp add` 2.1.x):

```json
{
  "mcpServers": {
    "teamwork": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/teamwork-mcp/src/server.js"],
      "env": {
        "TEAMWORK_BASE_URL": "https://your-site.teamwork.com",
        "TEAMWORK_API_TOKEN": "${TEAMWORK_API_TOKEN}",
        "TEAMWORK_AUTH_MODE": "basic_token_x",
        "TEAMWORK_ALLOWED_PROJECT_IDS": "12345"
      }
    }
  }
}
```

Then `export TEAMWORK_API_TOKEN=...` in your shell profile. Claude Code asks you to
approve a project-scoped server the first time. Tips:

- Set `TEAMWORK_ALLOWED_PROJECT_IDS` per repo, so an agent working on project A cannot write to project B.
- `claude mcp list` shows connection status, `claude mcp get teamwork` shows the resolved config, and `/mcp` inside a session shows the tools.
- Local scope (`-s local`, the default) is like user scope but only for the current directory.

## VS Code (and GitHub Copilot in VS Code)

VS Code's built-in MCP support is what GitHub Copilot Chat (agent mode) uses, so there
is **one** config for both. The key is `servers`, and every entry needs `"type": "stdio"`.

- User-wide: Command Palette > **MCP: Open User Configuration**
  (macOS `~/Library/Application Support/Code/User/mcp.json`,
  Linux `~/.config/Code/User/mcp.json`, Windows `%APPDATA%\Code\User\mcp.json`)
- Per workspace: `.vscode/mcp.json` in the repo

```json
{
  "inputs": [
    { "type": "promptString", "id": "teamwork-token", "description": "Teamwork API token", "password": true }
  ],
  "servers": {
    "teamwork": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/teamwork-mcp/src/server.js"],
      "env": {
        "TEAMWORK_BASE_URL": "https://your-site.teamwork.com",
        "TEAMWORK_API_TOKEN": "${input:teamwork-token}",
        "TEAMWORK_AUTH_MODE": "basic_token_x",
        "TEAMWORK_READ_ONLY": "true",
        "TEAMWORK_ALLOWED_PROJECT_IDS": ""
      }
    }
  }
}
```

`${input:...}` makes VS Code prompt once and store the token securely, which makes the
file safe to commit as `.vscode/mcp.json`. In a private user-level `mcp.json` you can
put the token inline instead. VS Code also accepts `"envFile": "/absolute/path/to/.env"`
on a stdio server to load variables from a file.

Set `TEAMWORK_READ_ONLY` to `"false"` only after you've verified the read tools work as
expected — it's on (blocking every write tool) by default.

After changing the file or updating this repo, restart the server: **MCP: List Servers**
> teamwork > Restart. In Copilot Chat, switch to **Agent** mode and open the tools picker
to check that the `teamwork_*` tools are enabled.

## GitHub Copilot CLI

The Copilot CLI (`copilot`) reads `~/.copilot/mcp-config.json`, which uses `mcpServers`
and `"type": "local"` for stdio servers. You can also add a server interactively with
`/mcp add`. This shape follows GitHub's documentation; it was not tested on a machine
with the CLI installed.

```json
{
  "mcpServers": {
    "teamwork": {
      "type": "local",
      "command": "node",
      "args": ["/absolute/path/to/teamwork-mcp/src/server.js"],
      "env": {
        "TEAMWORK_BASE_URL": "https://your-site.teamwork.com",
        "TEAMWORK_API_TOKEN": "your_api_token",
        "TEAMWORK_AUTH_MODE": "basic_token_x"
      },
      "tools": ["*"]
    }
  }
}
```

The Copilot *coding agent* on github.com runs in GitHub's cloud, not on your machine,
so a local path like the one above does not exist there. It would need this repository
installed in that environment and is not covered here.

## Claude Desktop

Edit `claude_desktop_config.json` (Settings > Developer > Edit Config):

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

The key is `mcpServers`, and there is no `${VAR}` expansion, so the token goes inline.
The file is private to your machine. GUI apps do not inherit your shell `PATH`, so if
you use nvm/asdf/Homebrew, give the **absolute path to node** (`which node`):

```json
{
  "mcpServers": {
    "teamwork": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/teamwork-mcp/src/server.js"],
      "env": {
        "TEAMWORK_BASE_URL": "https://your-site.teamwork.com",
        "TEAMWORK_API_TOKEN": "your_api_token",
        "TEAMWORK_AUTH_MODE": "basic_token_x"
      }
    }
  }
}
```

Fully quit and reopen Claude Desktop after editing. Its MCP logs are in
`~/Library/Logs/Claude/mcp-server-teamwork.log` (macOS).

## Any other stdio MCP client

Give the client:

1. **command**: `node` (absolute path if the client does not inherit your shell PATH)
2. **args**: `/absolute/path/to/teamwork-mcp/src/server.js`
3. **env**: at least `TEAMWORK_BASE_URL`, `TEAMWORK_API_TOKEN`, `TEAMWORK_AUTH_MODE=basic_token_x`

Put that under whatever top-level key the client expects (`servers`, `mcpServers`, `context_servers`, ...).
The server speaks MCP over stdin/stdout only and writes logs to stderr, so do not redirect
stderr into stdout.

Instead of env vars you can point `TEAMWORK_CONFIG_FILE` at a JSON file shaped like
[`mcp.config.example.json`](../mcp.config.example.json). Env vars take precedence over the file.

## Verify and troubleshoot

- Smoke test outside any client: `TEAMWORK_BASE_URL=... TEAMWORK_API_TOKEN=... TEAMWORK_AUTH_MODE=basic_token_x node src/server.js`
  should print a JSON `"Teamwork MCP server initialized"` line on stderr and then wait for input (Ctrl-C to exit).
- In the client, call `teamwork_get_current_user`. It should return the token owner.
- `AUTHENTICATION_FAILED` (401): wrong token, or `TEAMWORK_AUTH_MODE` is not `basic_token_x` for an API key.
- `FORBIDDEN` on a write: `TEAMWORK_READ_ONLY=true`, the project is not in `TEAMWORK_ALLOWED_PROJECT_IDS`, or the file is outside `TEAMWORK_UPLOAD_ROOTS`.
- Tools missing or stale after `git pull`: restart the server in the client (each client caches the tool list per process).
- `LOG_LEVEL=debug` logs every API request (method, URL, status, duration) to stderr. Tokens are never logged.
