# Orbit Social bridge

GROW connects privately to the existing `orbit-social` Worker through its `SOCIAL` service binding. The deployed adapter source and a patch for Orbit's existing source are included here so the integration is reviewable alongside GROW. The original Orbit application remains in its existing workspace.

The adapter requires `GROW_SOCIAL_BRIDGE_SECRET` as a Cloudflare Worker secret on **both** Workers. It accepts requests only at the internal binding hostname `grow-bridge.internal` with the matching secret. No owner sessions, network access tokens, email messages or public posts are created during connection setup.

Supported operations: list destination names/statuses, stream image/video uploads into Orbit's existing private R2 media library, create an idempotent imported draft, read its status, and request immediate publication on explicitly selected Facebook Pages. Orbit's existing validation, D1 transactions, publishing queue, token encryption and retry rules remain in use. Content is compared with the approved GROW snapshot before publication; a Social-side edit prevents GROW from publishing that snapshot. Other networks support drafts only. Calendar dates remain planning reminders.

Draft IDs derive from the GROW record and approved payload. Concurrent requests and retries reuse the same draft without replacing its variants or media. Changes to caption, attachments or selected destinations create a separate draft. Previous drafts remain available in Orbit, where the owner can move them to Trash.

A draft handoff URL carries only its post ID. Orbit keeps that destination through sign-in and opens the draft in its composer.

Apply `orbit-social.patch` from the Orbit project root using `git apply`. No D1 schema migration is required. Run its existing build and publishing tests, and copy `test-grow-bridge.mjs` to `work/` then run it from that root. The adapter test uses local Workers/D1/R2 fixtures; it does not send Facebook requests. Deploy Orbit before GROW.
