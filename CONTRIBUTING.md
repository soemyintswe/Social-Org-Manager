# Contributing

Thanks for contributing to Social Org Manager.

## Development Setup

```bash
npm install
npm start
```

Optional:

```bash
npm run server:lan
npm run lint
```

## Pull Request Rules

- Keep changes focused and small
- Include clear commit messages
- Update docs when behavior changes
- Do not include unrelated formatting-only changes

## Data & Privacy Rules

- Never commit real member/personal data
- Never commit backups/exports/runtime DB files
- Use anonymized/synthetic data only
- Remove screenshots that expose personal information

## Security Rules

- Never hardcode secrets in source
- Use environment or private runtime configuration
- If a secret leak is found, rotate it immediately and report via `SECURITY.md`
