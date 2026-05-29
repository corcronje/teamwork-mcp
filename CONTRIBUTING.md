# Contributing

Thanks for contributing to Teamwork MCP Server.

## Development

1. Fork and clone the repository.
2. Create a feature branch from `main`.
3. Install dependencies:

```bash
npm install
```

4. Validate syntax before commit:

```bash
npm run check
```

## Commit and PR Guidelines

- Keep commits focused and atomic.
- Include a clear summary of behavior changes.
- Document any MCP tool schema changes in `README.md`.
- If adding or changing environment variables, update `.env.example`.

## Testing Expectations

At minimum, run:

```bash
npm run check
```

If your change affects Teamwork behavior, include manual verification steps in the PR description.

## Security and Secrets

- Never commit `.env` or real API tokens.
- Use placeholders in examples.
- Avoid logging tokens or credentials in error output.
