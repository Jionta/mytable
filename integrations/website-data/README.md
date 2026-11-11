# Website data connections

**Artbit operations → Website data** and **Automations → Business connections → Artbit Studio → Website data** open the same owner-only live summary. Refresh data issues a fresh read. The source stays authoritative; no data is imported into GROW records or included in AI, Telegram or bot inputs.

The private `grow-artbit-site-data` Worker binds the existing `artbit-studio-db`. It runs one fixed SELECT for new leads, course and job applications, unarchived new wedding orders, clients, invoices with an outstanding balance, and published/draft article counts. No row identifiers, names, contact details, amounts, credentials or messages leave the source. The connector has no public route, preview URL or write handler. The D1 binding itself is a standard binding; the fixed query and inaccessible write path enforce the read-only behavior of the deployed application.

Artbit's website and admin Worker are deployed separately and need no code change or database migration. Links to individual dashboard sections use Artbit's existing sign-in and permissions.

From the GROW repository, deploy the private connector first, then GROW:

```sh
npm exec wrangler deploy -- --config integrations/website-data/wrangler.jsonc --dry-run
npm exec wrangler deploy -- --config integrations/website-data/wrangler.jsonc
npm run deploy -- --dry-run
npm run deploy
```

For another site, first establish its owner, platform and required fields. Add a separate service with explicit summaries and an independent source credential or binding. Keep site identifiers and endpoints on the server; do not accept arbitrary URLs or SQL from the browser. Where the source supports read-only credentials, use them. Other sites remain dashboard links until explicitly connected.

Validation: `npm run test:website-data` checks the fixed query against a SQLite fixture and confirms it never writes. `npm test` checks that signed-out users and business admins cannot query it, and that service failures return a safe message.

[Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) · [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
