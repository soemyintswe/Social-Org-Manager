# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 1.1.x | Yes |
| < 1.1.0 | No |

## Reporting a Vulnerability

Please do not open a public issue for security vulnerabilities.

Report privately to the project owner with:

- Summary and impact
- Reproduction steps
- Affected version(s)
- Suggested fix (if available)

## Security Requirements for Contributors

- Do not commit real personal/member data
- Do not commit secrets/API keys/tokens/passwords
- Do not commit local backup/export files or local databases
- Use sanitized sample data only
- Prefer environment-based secrets handling

## Immediate Revocation Guidance

If a secret is accidentally committed:

1. Revoke/rotate the secret immediately
2. Remove secret from code and history
3. Force-update any affected deployments
4. Confirm exposure scope before re-enabling access
