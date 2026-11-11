# Work assistant · setup and operating guide

Open **Automations → Business connections → Open assistant** as the GROW owner. The panel shows connection configuration, last daily delivery, and local-bot reply drafts. **GROW AI → Preview daily brief** shows what would be sent without sending a Telegram message. Configuration indicators mean settings are present; they do not verify remote credentials.

## Private Telegram bot

1. Create a dedicated bot with BotFather. On the deployment computer, create an ignored, private `.env.telegram` (owner-readable only) with `GROW_TELEGRAM_TOKEN`, a random `GROW_TELEGRAM_PAIR_CODE` of at least 24 URL-safe characters, and a different random `GROW_TELEGRAM_WEBHOOK_SECRET` of at least 32 URL-safe characters. Don't put any token in chat, Git, or a URL you share.
2. In a private chat with the bot, send `/pair <your pairing code>`. Run `node --env-file=.env.telegram scripts/setup-telegram.mjs discover`. Add the verified numeric `GROW_TELEGRAM_OWNER_ID` it prints to the file. Use a new bot if an existing one already has a webhook.
3. In Cloudflare Workers & Pages → **grow-os** → **Settings → Variables and Secrets**, store `GROW_TELEGRAM_TOKEN`, `GROW_TELEGRAM_OWNER_ID` and `GROW_TELEGRAM_WEBHOOK_SECRET` as Worker secrets. If needed, set `GROW_BRIEF_HOUR` as a secret to an hour from 0 to 23 in Dhaka time; the default is 09:00. These settings persist across releases.
4. Run `node --env-file=.env.telegram scripts/setup-telegram.mjs register` once, then send `/start` to the bot. Use `status` with the same script to check webhook registration and pending updates. Remove the temporary pairing code from the local file after setup.

| Message | What GROW does |
| --- | --- |
| `/today` | Shows the current work brief and short task codes |
| `/businesses` | Shows codes to use when creating business tasks |
| `/task artbit \| Review campaign reel` | Creates a task in Artbit |
| `/update 8a33b55d progress \| First draft ready` | Changes status and appends a progress note |
| `/update 8a33b55d \| Client feedback received` | Appends a note without changing status |
| Plain text | Captures a Personal task |

The bot accepts messages only from the verified owner in a private chat; groups, other users and forwarded messages are ignored. Telegram webhook retries do not repeat task changes. Task completion still requires the checklist; imported tasks remain read-only. The hourly Cloudflare trigger sends once per Dhaka date at the selected hour. An ambiguous delivery is shown as unconfirmed and is not resent automatically, to avoid duplicates.

## AI priorities

Add Worker secrets `GROW_OPENAI_API_KEY` and `GROW_OPENAI_MODEL` (use a Responses-compatible model available to the account). When configured, the brief may include a short Bengali priority suggestion. The request includes counts, dates, statuses and up to eight short task titles/business names. It excludes notes, contacts, finance, credentials and social conversations. If AI fails or isn't configured, the deterministic task brief still works.

## Website dashboard index

In **Automations → Business connections**, choose **Add dashboard** under each business and save the real admin URL. Multiple dashboards can be linked to the same business, including individual clients. Each opens using the site's existing sign-in. Do not add passwords or signed URLs with credentials. This index does not read private dashboard metrics or change other websites. For that, provision a separate limited API credential for each site and confirm what to sync.

## Local social bot

Set the same random `GROW_SOCIAL_BOT_TOKEN` (32 characters minimum) as a Worker secret and in the local bot's environment. Add `GROW_SOCIAL_BOT_BUSINESSES` as a comma-separated Worker secret, for example `artbit,vidzones`. Keep the local bot's platform credentials local. The bridge provides no workspace login or publishing token.

- `node scripts/social-bot.mjs businesses` shows the bot's allowed business IDs.
- Pipe a JSON draft into `node scripts/social-bot.mjs submit`. The bridge is `https://os.iamjubayer.com/integrations/social-bot`, authorized with a Bearer token. It accepts one draft per POST, up to 12 per business per Dhaka day. Retry with the same stable `external_id` to avoid duplicate work. Use a new ID for a revised proposal.

```json
{
  "business_id": "artbit",
  "external_id": "artbit-facebook-2026-11-11-01",
  "kind": "post",
  "channel": "Facebook",
  "title": "Weekly studio update",
  "copy": "Draft caption for owner review.",
  "format": "Post"
}
```

Use `comment_reply` or `message_reply` for proposed replies; optionally include a non-sensitive HTTPS `source_url` to the conversation. Posts appear as Draft under Content; replies appear in the owner's Work assistant for review, copy, or dismissal. Suggested replies are a transient inbox and aren't in the workspace backup. Posts use the existing Content approval and Social handoff. The bridge does not retrieve comments or messages, send replies, sign into accounts, or schedule a one-hour run. Connect the actual local runner and official platform APIs to do those jobs. Start with a named list of accounts, approved platforms, limits, and an hour window; test drafts before enabling sends.

References: [Telegram Bot API](https://core.telegram.org/bots/api), [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
