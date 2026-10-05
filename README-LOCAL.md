# GROW — Local Edition 1.0

Growth · Revenue · Operations · Workflows

This retained version 1 local edition has its original interface. The expanded personal business operations and native tasks are in the Cloud Edition. Version 2 cloud backups are not supported by this version 1 local server.

A working local business operating system for Jubayer. The interface is entirely in English. It runs in your browser and saves records to a SQLite database on your computer. No npm installation, paid service, account, or API key is needed. Python 3.10 or newer is required.

## Start on Windows

1. Extract the ZIP into a normal folder such as `Documents\GROW`.
2. Double-click **START-GROW-WINDOWS.bat**.
3. Your browser opens GROW at **http://127.0.0.1:8765**.

If Python is missing, install Python 3.10 or newer, including its launcher, and reopen the launcher. If your operating system asks whether to run the downloaded launcher, you can instead open a terminal in the extracted folder and run `python server.py`.

Keep the terminal window open while using GROW. Close GROW with Ctrl+C in that window. Reopen the same launcher next time; your data is retained. Closing only the browser does not stop the app.

## Start on macOS or Linux

Open Terminal in the extracted `grow-os` folder and run:

```sh
python3 server.py
```

The included Mac `.command` and Linux `.sh` launchers are conveniences. If download permissions prevent double-clicking, use the command above. On Linux you can also run `sh start-grow.sh`.

If port 8765 is already in use:

```sh
python3 server.py --port 8766
```

Open the exact local URL printed in the terminal. The server listens only on your computer's loopback address; this edition is intended for a single user, not LAN access or public hosting.

## What works

- **Command Center / Today:** portfolio overview, recorded financial totals, content approvals, overdue items, and the Sunday–Thursday work rhythm.
- **Businesses:** eight independent workspaces, editable marketing profiles, and additional businesses as you grow.
- **Clients / Projects:** client records under Artbit, fees, notes, deadlines, project status and delivery views. Content and invoices link to a business and its client.
- **Tasks:** a read-only snapshot imported from your existing task manager. GROW never becomes a second task-editing tool.
- **Marketing:** brand positioning, channels, audiences, content pillars, cadence, goals and marketing plans.
- **Content:** ideas, drafts, review, requests for changes, approvals, publishing plans, manual publication confirmation and a calendar.
- **Sales & CRM:** contacts, estimated deal value, stages, follow-up dates and research notes. No outreach is sent.
- **Finance:** BDT cash income and expenses, invoices, partial payments, receivables, monthly business totals and CSV export. A received invoice payment inserts a ledger income entry and updates the invoice balance atomically.
- **Resources:** people, assets, SOP text, tool subscriptions, domains, hosting, resource URLs, costs and renewals. Annual costs are divided by 12 for the monthly subscription estimate.
- **Automations:** editable workflow recipes and exportable briefs. Recipes do not execute background jobs.
- **Reports / Weekly Review:** cash flow by business, decision brief export and saved review notes.
- **GROW intelligence:** an offline brief derived from recorded priorities, finance, content and task snapshots; also a business-aware prompt builder for use in your preferred AI tool.
- **Settings:** workspace preferences, your task manager link, complete backup, restore, and sample removal.
- **Search:** Ctrl+K / Cmd+K searches local record titles and names.

## Your workspace structure

Artbit Studio is the agency; its clients are separate client records beneath it. The other independent businesses are Vidzones, QFS, I am Jubayer, CNMOTOS, AlabamaFootball, Biggan PiC and GhuraghuriBD. You can add more business workspaces from Businesses.

Only the business names and planning profiles are treated as your starting configuration. Sample client records, financial values, leads, invoices, resources, content and projects are examples, marked visibly in the interface. **Settings → Remove sample records** clears those examples while retaining your business workspaces and new records. Export a backup before removing examples if you want to preserve them.

## Connect your existing task manager

1. Save its URL in **Settings**.
2. Open **Tasks → Download example** for the JSON format.
3. Export statuses from your own tool in that format and use **Import status JSON**.

Example:

```json
{
  "tasks": [
    {
      "external_id": "my-task-123",
      "title": "Review client campaign",
      "business_id": "artbit",
      "client_id": "",
      "status": "Open",
      "priority": "High",
      "due": "2026-10-05",
      "url": "http://localhost:3000"
    }
  ]
}
```

Required fields: `external_id`, `title`, `business_id`, `status`. Optional: `client_id`, `priority` (defaults to Medium), `due`, `url`. Status values: Open, In progress, Blocked, Done. Priority values: High, Medium, Low. Business IDs for the initial workspaces: `artbit`, `vidzones`, `qfs`, `jubayer`, `cnmotos`, `alabama`, `biggan`, `ghuraghuri`.

Reimporting updates records by `external_id`. Import is atomic: one invalid record cancels the whole import. Missing tasks in a new import are retained; include completed tasks as Done to update their status. Imports do not write back to your task tool. Live sync needs your tool's API contract and authentication details.

## Approval and publishing behavior

Content starts as Idea or Draft. Submit a draft for review. Reviewers can approve, request changes or reject it. Approved content can receive a planned publishing date. **Scheduled means planned locally**; nothing is scheduled on a social network. Confirm Published only after actually publishing the asset elsewhere. The local app cannot independently verify publication.

Approved or planned copy must return to Draft before it can be changed. Published content is retained as history and its copy is protected. This prevents accidentally editing a previously approved asset without a new review.

## Money and backups

The ledger uses one currency: **BDT**. Enter foreign costs after conversion to BDT; this edition does not fetch exchange rates. Financial amounts are stored as integer paisa. Invoice balances are not cash income until payment is recorded. Deal values and resource costs do not automatically become ledger entries.

The displayed financial result is **net recorded cash flow**, not an audited profit and loss statement. Opening balances, bank reconciliation, tax, accruals, inventory, full double-entry bookkeeping, invoice PDFs, recurring invoice generation and payment reversal are outside this first edition. Invoice-linked ledger payments are protected from individual editing or deletion; this preserves their agreement with the invoice balance. Correct a mistake using a suitable adjustment record and explanatory note, or restore a known-good backup.

Your records are in `data/grow.sqlite3`. Do not delete the data folder when updating the app. When copying the database manually, stop GROW first and copy the whole data folder so pending SQLite WAL data is included. The safest portable backup is **Settings → Export backup**. A backup includes all records and settings; protect it as you would other business information. Restore replaces the workspace atomically after validation and confirmation.

The app binds to `127.0.0.1`, validates local hosts and uses a save token and origin checks for mutations. It has no login or encrypted-at-rest database. Use your computer's account security and disk encryption. Do not expose this server to the Internet.

## Connections for the next iteration

This package does not make external API requests. Live AI generation, websites, publishing, analytics feeds, bidirectional task syncing and autonomous jobs remain disconnected. Their status is explicit in the interface. The next practical step is to connect the task manager API and your publishing system after their interfaces are available.

Optional browser tools register only when the browser supports `document.modelContext`. They provide a read-only workspace summary and navigation; ordinary browsers do not need them.

## Developer notes

- `server.py`: local HTTP API, validation, SQLite transactions, backup/restore and static serving.
- `seed.py`: editable starting business profiles and removable sample records.
- `legacy-dist/`: HTML, CSS, JavaScript and favicon. No external fonts, scripts or CDN are used.
- `data/`: created on first launch; excluded from the distributed ZIP.
- `tests/test_local.py`: meaningful storage and HTTP workflow checks in a temporary database.
- `tests/render_check.cjs`: browser-independent rendering checks for every module and scoped view.

Run the API tests with `python3 -m unittest discover -s tests -p 'test_*.py'`. Frontend syntax can be checked with `node --check legacy-dist/app.js`. Node is only needed for development checks, not for running GROW.

The Python local server is a deliberate local-first choice. Public hosting would require a server/storage adaptation and authentication; the local API cannot be deployed as a static site.
