# GROW — Cloud Edition

Growth · Revenue · Operations · Workflows

Jubayer's business workspace at **https://os.iamjubayer.com**, hosted on Cloudflare Workers with persistent SQLite storage in a Durable Object. This repository also retains the original Python local edition.

## Sign in

Open the website and enter your workspace password. The initial password is saved in `credentials-grow.txt` on the deployment computer, outside version control. There is no default password in this repository.

Password verification uses salted PBKDF2. Sessions last seven days and use secure, HTTP-only cookies. Password changes invalidate existing sessions. Both record reads and writes, including backups, require sign-in. Writes also require a session save token and a same-origin request. Sign-in attempts are limited per IP address.

## Personal operations · version 2

- Native tasks: board/list, status, priority, due dates, owners, business/client/project links, checklists, search, personal work and daily/weekly/monthly recurrence. Finishing a task requires its checklist to be complete. Recurring completion creates the next task and resets its copied checklist; reopening and completing the same occurrence does not duplicate the next one. Imported external snapshots remain read-only.
- Artbit Studio: separate client accounts with brand voice, audience, assets and onboarding; monthly service plans with editable package quantities, separate advertising budgets, repeatable content/task generation, one fee invoice per plan, campaigns and exportable client reports. Content can be filtered by client. Package presets are starting points for an agreed scope, not contracts or measured performance.
- Biggan PiC: partner designs and print files, size/color SKUs, print batches, received stock, customer orders/items, fulfillment, order invoices/payments and website work. Packing requires sufficient stock. Received batches and invoiced/packed items are protected. Returned units remain deducted until a separate checked production/stock record is made; a return does not silently restock a product.
- QFS: apparel buyer research with country, product fit, decision-maker contact, source evidence, verification, fit score, next action and follow-up history; atomic CSV/JSON imports with duplicate checks and exports. Leads are collected manually or imported, not automatically scraped or contacted.
- Vidzones: creative briefs, scripts, formats/cutdowns, rights, direction approval, assets, review cuts, revisions, final delivery links and repeatable production tasks.
- CNMOTOS and AlabamaFootball: sourced editorial stories, verification, drafting and five-channel social draft packs from a saved summary. GROW does not generate or verify factual claims automatically.
- GhuraghuriBD: agency/guide partners, trip listings, itineraries, capacity and booking requests. Confirmations cannot exceed recorded capacity.
- The existing Command Center, Today, clients, projects, marketing, content approvals, CRM, finance, resources, recipes, reviews, prompt assistant and settings remain available.

Business profiles follow [Artbit](https://artbit.studio/), [QFS](https://quality1stservice.com/), [CNMOTOS](https://www.cnmotos.com/), [AlabamaFootball](https://alabamafootball.org/), [GhuraghuriBD](https://ghuraghuribd.com/) and [Vidzones](https://vidzones.com/) as reviewed October 5, 2026. Biggan PiC follows the owner's stated partnership responsibilities. Historical brands on a public website are not added as current clients. Existing example records remain labeled samples; no real client names, targets, orders, leads or metrics are invented.

Platform metrics, publication, payments received, delivery and travel confirmations are manually recorded. There is no external website synchronization, social publisher, email outreach, live AI or background scheduler. Monthly planning and repeat tasks are explicit actions inside GROW.

## Backups and migration

Version 2 cloud backups include all expanded operations. The automatic upgrade adds fields and business profiles while retaining existing record IDs and data. Restore validates references, pricing, stock and ledger payments before replacing data in a single transaction. A version 1 backup can be restored only while the new operation tables are empty; it cannot silently discard expanded records.

The original Python local edition has a separate database and original interface in `legacy-dist/`. It supports version 1 backups only. Do not restore a version 2 cloud backup there. Backups and credentials contain private information and belong outside this public repository.

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

The cloud tests run in Cloudflare's Workers runtime and cover sign-in, session expiry/revocation behavior, save guards, rate limiting, content approvals, concurrent invoice payments, task imports, restore rollback, sample removal, relationship validation, workspace isolation, native task recurrence/checklists, monthly client generation, order stock/pricing, lead import rollback, video approvals, sourced editorial drafts and travel capacity.

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
- `src/schema.json`: record fields and workflow rules.
- `src/operations.js`: business operations, migration and workflow actions.
- `src/seed-template.json`: starting business profiles and explicitly marked sample records.
- `dist/`: version 2 cloud interface and sign-in screen.
- `legacy-dist/`: original version 1 local interface.
- `tests/cloud.test.js`: Workers runtime workflow tests.
- `scripts/set_password.py`: password setup and reset.
- `wrangler.jsonc`: hosting, custom domain, storage binding, and observability.

Deployment is currently performed with Wrangler from a signed-in computer. Pushing to GitHub by itself does not redeploy the website.
