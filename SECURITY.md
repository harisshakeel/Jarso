# Security policy

Jarso is a pocket-money learning app for children aged 11–14, built in the open for the ATEX Playmaker's Hackathon. The source and the agent session logs in `.claude-logs/` are public by design. Credentials are not: they live only in deployment environment variables, and the repository ships automated checks to keep them out of commits and logs (see `docs/security.md`).

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a vulnerability"). We will acknowledge within three days and keep you informed until it is resolved.

In scope: anything that exposes a child's data to another user, bypasses Row Level Security, leaks credentials, or lets the AI guide be steered outside its boundaries. Out of scope: denial of service against the hobby-tier hosting, and findings that require a compromised developer machine.

## If you find a committed secret

Treat it as live. Report it privately as above; we rotate first and investigate second.
