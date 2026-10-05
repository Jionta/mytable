# GROW — Cloud Edition

Growth · Revenue · Operations · Workflows

Jubayer's business workspace at **https://os.iamjubayer.com**, hosted on Cloudflare Workers with persistent SQLite storage in a Durable Object. This repository also retains the original Python local edition.

## Sign in

Open the website and enter your workspace password. The initial password is saved in `credentials-grow.txt` on the deployment computer, outside version control. There is no default password in this repository.

Password verification uses salted PBKDF2. Sessions last seven days and use secure, HTTP-only cookies. Password changes invalidate existing sessions. Both record reads and writes, including backups, require sign-in. Writes also require a session save token and a same-origin request. Sign-in attempts are limited per IP address.

## What is included

All fifteen existing modules: Command Center, Today, Businesses, Clients, Projects, Tasks, Marketing, Content, Sales & CRM, Finance, Resources, Automations, Reports, GROW AI, and Settings.

The interface and existing JSON API are retained. Cloud storage preserves the content approval rules, integer-paisa BDT amounts, atomic invoice payments, validated backup restores, task imports, and removable sample records. Task synchronization, external publishing, live AI, and background automation remain manual or disconnected.

The cloud workspace and a locally running Python edition have independent databases. Export and restore a version 1 GROW JSON backup to move records between them. Backups include private business data and should be kept outside this public repository.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
```

For local cloud development, add an ignored `.dev.vars` file containing a test `GROW_PASSWORD_HASH`. Generate the hash with Python:

```sh
python3 -c 'import getpass,hashlib,secrets; p=getpass.getpass(); s=secrets.token_hex(16); print("GROW_PASSWORD_HASH="+s+"$"+hashlib.pbkdf2_hmac("sha256",p.encode(),s.encode(),100000).hex())'
npm run dev
```

Production requires HTTPS. The session cookie is Secure; use HTTPS for browser sign-in when developing locally (`npm run dev -- --local-protocol https`).

## Checks

```sh
npm run check
npm test
npm exec wrangler deploy -- --dry-run
```

The cloud tests run in Cloudflare's Workers runtime and cover sign-in, session expiry/revocation behavior, save guards, rate limiting, content approvals, concurrent invoice payments, task imports, restore rollback, sample removal, relationship validation, and workspace isolation.

For the original local edition, see [README-LOCAL.md](README-LOCAL.md).

## Deploy and change the password

Sign into the intended Cloudflare account first. `wrangler.jsonc` explicitly targets the existing account, `grow-os` Worker, and `os.iamjubayer.com` custom domain.

```sh
npm exec wrangler login
python3 scripts/set_password.py
npm run deploy
```

The password command prompts securely and uploads only a salted password hash as a Worker secret. Do not commit `.dev.vars`, credentials, database files, or backups. The custom domain is managed by Wrangler, including Cloudflare's certificate setup. `workers.dev` and preview URLs are disabled.

Deploys update the application without clearing stored records. Keep the `WORKSPACE_ID`, Durable Object class, binding, and migration history stable to continue using the same cloud database. Export a backup in Settings before data migrations. Reverting application code does not revert database changes.

## Files

- `src/index.js`: authentication, secure HTTP routing, and static assets.
- `src/workspace.js`: SQLite storage, validation, transactions, sessions, and sign-in limits.
- `src/schema.json`: record fields and workflow rules from the local edition.
- `src/seed-template.json`: starting business profiles and explicitly marked sample records.
- `dist/`: browser interface and sign-in screen.
- `tests/cloud.test.js`: Workers runtime workflow tests.
- `scripts/set_password.py`: password setup and reset.
- `wrangler.jsonc`: hosting, custom domain, storage binding, and observability.

Deployment is currently performed with Wrangler from a signed-in computer. Pushing to GitHub by itself does not redeploy the website.
