# Changelog

All notable changes to this project are documented in this file.

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
