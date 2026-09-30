# Contributing

Thanks for contributing to Teamwork MCP Server.

## Development

1. Fork and clone the repository.
2. Create a feature branch from `main`.
3. Install dependencies:

```bash
npm install
```

4. Validate before commit:

```bash
npm run check
npm run test:unit
```

## Commit and PR Guidelines

- Keep commits focused and atomic.
- Include a clear summary of behavior changes.
- Document any MCP tool changes in `README.md` (tool table) and `CHANGELOG.md`.
- If adding or changing environment variables, update `.env.example`.

## Testing Expectations

At minimum, run:

```bash
npm run check
npm run test:unit
```

If your change affects Teamwork API behaviour, also run `npm run test:live` against a
sandbox project (`TEAMWORK_TEST_PROJECT_ID`). Teamwork silently ignores unknown query
parameters and body fields, so check any new filter or field against the live API and
record it in STATUS.md.

## Security and Secrets

- Never commit `.env` or real API tokens.
- Use placeholders in examples.
- Avoid logging tokens or credentials in error output.
