# Changelog

All notable changes to this project are documented in this file.

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
