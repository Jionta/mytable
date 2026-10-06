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

Platform metrics, publication, payments received, delivery and travel confirmations are manually recorded. Social connects through the private bridge described below. External website synchronization, email outreach, live AI and a background publishing scheduler are not connected. Monthly planning and repeat tasks are explicit actions inside GROW.

## Backups and migration

Version 2 cloud backups include all expanded operations. The automatic upgrade adds fields and business profiles while retaining existing record IDs and data. Restore validates references, pricing, stock and ledger payments before replacing data in a single transaction. A version 1 backup can be restored only while the new operation tables are empty; it cannot silently discard expanded records.

The original Python local edition has a separate database and original interface in `legacy-dist/`. It supports version 1 backups only. Do not restore a version 2 or 3 cloud backup there. Backups and credentials contain private information and belong outside this public repository.

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

## Collaborators and Social (2.1)

**People & links** stores people, their business memberships and business URLs. Add an active person with an email, link them to a business with a role, then assign a native GROW task. “Assign work as a task” on content, projects, video productions and website work starts a linked task with its brief. Business pages open their scoped people and links list.

The owner creates a private invitation link, valid for 72 hours and one activation, and shares it manually. Members choose a password of at least 12 characters and sign in with their email. The owner leaves email empty when signing in with the workspace password. No invitation email is sent automatically. Members use `/work`; server-side checks expose only their own assigned native tasks in active businesses, relevant checklist steps, client/business names, explicitly linked content briefs and task reference links. They may change task status/progress and their task checklists. Finances, owner settings, other people's work, backups and publishing are unavailable. Pausing a person or membership removes that business's access immediately. Access passwords are stored only as salted PBKDF2 hashes; resetting an invitation revokes that member's existing sessions upon activation.

Every content card has **Social**. Upload files while the content is a draft, submit for review and approve it, choose its destination, then send its approved copy and uploaded media to `social.iamjubayer.com`. Choose “use as default” with one destination to remember it for that client/business. Asset URLs remain reference links; they are not fetched or converted into attachments. Files use the existing private Social media library and support up to 10 attachments of 50 MB each. Facebook's publishing adapter further limits photos to JPEG/PNG/GIF up to 4 MB, or one supported MP4/MOV video up to 50 MB.

Facebook Pages support explicit **Publish now** with a destination preview. Sample records can be sent as drafts but cannot be published; create your own content record for live posts. GROW updates content to Published only after Social reports successful publication of the matching approved version. It preserves the current GROW status if Social or GROW content has changed. For other networks, open the imported draft in Social. Scheduled dates remain reminders; no automatic timer publishes posts. An uncertain result retains the linked post for reconciliation rather than creating another post. The service binding and private bridge secret are required; see [the adapter](integrations/orbit-social/README.md).

Backups now use `grow_version: 3` and include people, memberships, business links and publisher attachment references. Passwords, invitation tokens and sessions are excluded. A restore validates memberships/references, refuses changing an activated member's email, clears pending invitations and signs members out. Earlier backups cannot discard existing collaboration data. Back up Social separately: GROW references its posts and media but does not export its R2 files or OAuth settings.


## Interactive desk · version 2.2

- Command Center prioritizes your own tasks, blocked/overdue decisions, upcoming dates, client approvals, team workload and recorded cash. Business health also includes overdue and blocked tasks.
- Quick task capture (`Q`) creates personal or business work with a client, an active business member, due date, brief, priority and repeat frequency. Header access is available on every owner screen. `P` opens Planner; Ctrl/Cmd K searches record names, briefs, notes and contacts.
- Task Board supports drag between stages, keyboard/touch status menus, person/client/priority/due filters, list view, task checklists and linked work. Tomorrow/next-week actions reschedule a task. Bulk updates affect only selected visible native tasks and report partial failures; checklist completion and recurrence still use the existing server guards. Imported snapshots cannot be moved.
- Planner shows day/week views of open tasks, content planning dates, projects, follow-ups, invoice balances, renewals, orders, website work and unfinished video production. Add a task directly on a date; open a record to act on it. Calendar dates do not publish or notify automatically.
- Client workspace brings together responsibilities, content/Social, projects, monthly plans, invoices/payments, brand information and links. Client search and status filters make account management easier.
- Activity shows the latest 60 audited changes. Business filtering includes events whose surviving record belongs to that business; it cannot recover deleted record details.
- Members retain assigned-task isolation and get search, due/blocked filters, workload counts and save error recovery. Owners opening the member work URL return to the owner workspace.
- Local browser preferences remember business and task/planner view IDs only. Workspace records and credentials stay outside browser localStorage. This release retains version 3 backups and makes no storage migration.

Interactive checks: `npm run test:ui` covers task interactions, member filters/save recovery and `node tests/render_check.cjs`. The latter renders every owner module across all businesses; browser verification covers task capture, filtering, stage menus, drag/drop, bulk updates, client overview and responsive layouts using disposable local fixtures.
