# Security Policy

SharvaOS Daily Pulse stores personal daily-life signals. Treat all production data and identity information as private.

## Never commit

- `.env*` files
- API keys, access tokens or cookies
- Cloudflare account credentials
- D1 exports containing personal data
- production request/response logs containing identity headers

## Reporting

Record security findings privately with the repository owner. Do not publish personal-data examples in public issues or pull requests.

## Release gate

A production release requires verified authentication, owner isolation, input validation, privacy-safe telemetry, export/restore and rollback evidence.
