# Artbit Studio · Hermes pilot

Hermes runs on the owner's Mac. Its `grow-social` profile has two local MCP tools: read the pilot brief and submit one text-only Artbit Studio Facebook draft per Dhaka date. GROW deduplicates repeated submissions by date. The connector does not read social inboxes, use browser sessions, or publish.

## Set up the profile

1. Install [Hermes Agent CLI](https://hermes-agent.nousresearch.com/docs/getting-started/installation) and create a blank `grow-social` profile: `hermes profile create grow-social --no-skills --no-alias`.
2. Run `npm ci --prefix integrations/hermes` from the GROW cloud repository. Keep a private `.private/hermes-social.env` with the same scoped `GROW_SOCIAL_BOT_TOKEN` as the Worker. The Worker must set `GROW_SOCIAL_BOT_BUSINESSES` to exactly `artbit`. The two tools refuse to write if the connection is broader.
3. In the new profile's config, set `platform_toolsets.cli` and `platform_toolsets.cron` to `[mcp-grow_artbit]`. Add a [local MCP server](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) called `grow_artbit` with the absolute path to Node as `command` and two `args`: `--env-file=/absolute/path/to/.private/hermes-social.env` and `/absolute/path/to/integrations/hermes/bridge.mjs`. Set `tools.include` to `[pilot_brief, submit_post_draft]` and disable MCP resource and prompt tools.
4. Run `hermes --profile grow-social model` and sign into your preferred provider. Choose **ChatGPT or Codex Subscription** if using an existing subscription. The Hermes profile has its own sign-in; it does not import other apps' keys.
5. Use the profile to run a single supervised draft before enabling recurring work. Review in GROW **Content → Drafts**, then use the existing Social approval process if you want to publish.

## Daily pilot

Create one [paused cron job](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) at 10:00 Dhaka time, with local delivery and no catch-up after sleep:

```sh
hermes --profile grow-social cron create '0 10 * * *' \
  --timezone Asia/Dhaka --name 'Artbit Facebook draft pilot' \
  --deliver local --catch-up off --paused \
  "$(cat integrations/hermes/pilot-prompt.txt)"
```

After successful model authentication and a supervised run, install/start the profile's gateway using the official Hermes gateway instructions, and resume the job using its ID from `hermes --profile grow-social cron list`. The Mac must be awake for this schedule. The schedule is for one draft; it is not an hour of automatic account activity.

The 09:00 Dhaka Telegram brief remains a separate Cloudflare job. Configure that bot using the [GROW work assistant guide](../../docs/work-assistant.md#private-telegram-bot).

## Verification

`npm test --prefix integrations/hermes` verifies the tool list, fixed business/platform, stable daily draft ID, and rejection of a wider business scope. It uses a stub bridge and never creates a live draft.
