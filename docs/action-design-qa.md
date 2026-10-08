# Action icon and color verification

Actions use decorative inline SVGs with their existing readable labels and accessible names. Shared cues apply to owner/admin views, member work, sign-in, invitation activation, and dynamically opened dialogs. Creation/completion is green, edit/save/search blue, review/planning amber, Social/assignment purple, copy/export/payment teal, removal/rejection red, and cancellation/navigation neutral.

Normal text contrast against the action backgrounds is 5.74:1 or higher; white text on primary fills is 6.35:1 or higher. Keyboard focus remains visible and reduced-motion preferences are respected. Existing icons are preserved, and the top-bar quick capture keeps its accessible name without a duplicate plus.

Validated in the in-app browser:

- 24 owner views at 320×568, 390×844, 768×1024, 844×390, 950×740, 1024×768, and 1440×900 (168 checks): no page overflow, clipped action labels, or missing/duplicate button icons.
- Approval controls at 320px: approve green/check, request changes amber/review, reject red/cross, edit blue/pencil.
- Mobile content editor: assignment, delete, cancel, and save cues; modal fits viewport and action labels fit.
- Member work and sign-in at 320px: add-step, save-progress, refresh, search, and sign-in cues.
- Existing UI checks: 216 page/workspace renders, operation tabs/editors, task interactions, member filters, and scoped admin views.
- 32 Worker runtime tests passed, including role restrictions and Social publishing gates. Source syntax and deployment dry run passed.

Browser viewport emulation checks layout; it does not certify every physical device or browser. This change does not migrate workspace data or alter permissions or publishing confirmations.
