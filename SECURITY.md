# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## 🔒 Environment Variables & Password Security

### **NEVER commit passwords to git!**

This project uses environment variables for sensitive configuration:

#### Local Development
1. Copy template: `cp .env.example .env.local`
2. Set secure password: `ADMIN_PASSWORD=YourSecurePassword123!`
3. `.env.local` is gitignored and never committed

#### Production Deployment
- **Railway:** Set `ADMIN_PASSWORD` in project dashboard
- **Docker:** Use `ADMIN_PASSWORD=yourpass docker compose up`
- **Other platforms:** Set in environment variables section

#### Cache Admin Access
- URL: `/admin/cache.html`
- Username: ADMIN_USERNAME environment variable
- Password: From `ADMIN_PASSWORD` environment variable

#### Security Best Practices
✅ **DO:** Use strong passwords (12+ chars), rotate periodically
❌ **DON'T:** Commit passwords, use simple passwords, share in chat

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please send an email to [your-email@example.com]. You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

* Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
* Full paths of source file(s) related to the manifestation of the issue
* The location of the affected source code (tag/branch/commit or direct URL)
* Any special configuration required to reproduce the issue
* Step-by-step instructions to reproduce the issue
* Proof-of-concept or exploit code (if possible)
* Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

## Preferred Languages

We prefer all communications to be in English.

## Policy

We follow the principle of responsible disclosure.
