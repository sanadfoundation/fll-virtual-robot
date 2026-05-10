# Feedback — Design

**Date:** 2026-05-10
**Status:** Brainstormed, awaiting plan.

## Problem

The simulator runs in classrooms full of students, teachers, and coaches who hit rough edges — bugs, confusing behavior, wishes — but have no path to tell us about it. The intended reporters do not have GitHub accounts, so "open an issue on GitHub" is not a realistic ask. We want a one-click "Feedback" entry point in the app that collects a short title + description and gets it in front of the maintainer, with enough version/environment metadata to be triageable.

## Goals

- A reporter (student, teacher, coach) with no developer tooling can submit a report in under 30 seconds.
- Reports are reliably received without us running any always-on infrastructure.
- Each report carries the app version (commit SHA), the active editor mode (Blocks or Python), and the browser user agent.
- The entry point lives in the app's main chrome and is unobtrusive.
- No new CDN dependencies; matches the project's "static site, no build step" constraint.

## Non-goals

- **Direct GitHub Issue creation from the app.** This was the original ask but is incompatible with the "no backend" constraint once the audience is non-developers. Reports land in a Google Sheet; the maintainer triages and copies the actionable ones into GitHub manually.
- **Screenshots.** Embedded Google Forms cannot receive files without forcing the reporter to sign in to Google, and any auto-upload path requires a backend. Dropped for this iteration; revisit if triage shows screenshots are essential.
- **Authentication.** Reports are anonymous unless the reporter volunteers an email.
- **Offline support.** The form iframe needs network; offline reporting is out of scope.
- **Abuse/spam protection beyond what Google Forms gives us out of the box.** Google handles captcha-style protections if traffic warrants them.

## Architecture

Four pieces:

### 1. A Google Form (operational, not code)

Created once by the maintainer in Google Forms. Fields:

| Field | Type | Required | Reporter sees |
|---|---|---|---|
| Title | Short answer | yes | yes — they fill it |
| Description | Paragraph | yes | yes — they fill it |
| Email (optional) | Short answer | no | yes — they may fill it |
| Version SHA | Short answer | no | yes (prefilled, editable) |
| Mode | Short answer | no | yes (prefilled: `blocks` or `python`) |
| User Agent | Paragraph | no | yes (prefilled) |

Responses land in the form's linked Google Sheet. Maintainer enables email notifications on the Sheet.

Google Forms has no truly hidden field. The metadata fields are visible to reporters but prefilled. Reporters could edit them; that is acceptable — the prefilled value is a triage signal, not a security claim.

### 2. `js/feedback.js`

A new top-level module. Single responsibility: own the Feedback button click, build the prefilled iframe URL, open and close the modal. Target ~100 lines.

Public API on `window.feedback`:

- `init()` — called from `main.js` after DOM ready. Wires the header button.
- `open()` — opens the modal (used by `init`, exposed for future keyboard shortcuts).
- `close()` — closes the modal.
- `buildPrefilledUrl()` — pure function, exported for unit tests.

Module-level constants:

```js
const FORM_BASE_URL = ''; // paste from Google Forms "embed" iframe src
const ENTRY_IDS = {
  sha:       '',  // entry.NNNNN for Version SHA field
  mode:      '',  // entry.NNNNN for Mode field
  userAgent: '',  // entry.NNNNN for User Agent field
};
```

When `FORM_BASE_URL` is empty, `init()` hides the Feedback button and returns early. This means the code can ship before the maintainer has finished the Google Form setup with no broken UI.

`buildPrefilledUrl()` reads:
- `window.versionCheck` baseline SHA if available (added below), else empty string
- The active editor mode by checking which tab button (`#tab-blocks` / `#tab-python`) has the `active` class
- `navigator.userAgent`

…URL-encodes each value, and appends `&entry.X=...` for each populated entry ID.

### 3. The modal

Created in JS, not in `index.html` — keeps the HTML clean and avoids loading DOM that 99% of sessions won't use. On first `open()` call, the module appends:

```html
<div class="feedback-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">
  <div class="feedback-modal">
    <div class="feedback-modal-header">
      <h2 id="feedback-modal-title">Feedback</h2>
      <button class="feedback-modal-close" aria-label="Close">✕</button>
    </div>
    <iframe class="feedback-modal-iframe" src="…prefilled URL…" title="Feedback form"></iframe>
  </div>
</div>
```

…to `document.body`. The element is reused on subsequent opens (the iframe `src` is rebuilt fresh each time so a newly-loaded version SHA is picked up).

A11y and UX:

- Focus moves to the close button on open (the iframe content itself can't be focus-trapped from the parent page because of cross-origin).
- ESC closes; backdrop click closes; close button closes.
- `<body>` gets a `.feedback-modal-open` class while open to lock background scroll.
- The Google Form's own submission confirmation renders inside the iframe; the reporter clicks our X (or ESC) to close after they see the confirmation.

### 4. Header reorganization

Three controls move from header to the hub panel's Settings section:

- Speed slider (`#speed-slider`, `#speed-label`)
- Theme toggle button (`#btn-theme`)
- Defaults button (`#btn-defaults`)

A new button is added to the header where they used to live:

- `<button class="btn btn-feedback" id="btn-feedback" title="Send us feedback">💬 Feedback</button>`

DOM IDs of the moved controls are preserved, so existing event wiring in `js/main.js` (theme toggle, speed slider listener, defaults handler) continues to work unchanged. Only the markup location and the surrounding CSS change.

The new Settings section ordering inside the hub panel:

```
Settings
  Speed       [slider]  1x
  Theme       [🌙/☀️]
  Units       [dropdown]
  ─────────────────────
  [⟲ Defaults]  (full-width button)
```

**Trade-off accepted:** the speed slider becomes less reachable mid-run when the hub panel is collapsed (the user has to expand it). This was discussed in brainstorming and accepted — the cleaner header is worth it. If it bites in practice, we can re-promote speed back to the header without affecting the rest of this design.

## Data flow

```
[ Reporter clicks 💬 Feedback ]
            ↓
[ feedback.open() ]
            ↓
[ buildPrefilledUrl() composes URL with current SHA + mode + UA ]
            ↓
[ Modal injected; iframe src set ]
            ↓
[ Reporter types title + description inside the Google Form ]
            ↓
[ Reporter clicks Submit (Google's button, inside iframe) ]
            ↓
[ Google records response → linked Google Sheet ]
            ↓
[ Maintainer gets Sheet notification email; triages; copies to GitHub Issues if actionable ]
```

The page itself does not see the submission event (cross-origin iframe). The reporter closes the modal manually after seeing Google's "Your response has been recorded" page.

## File changes

**New files:**

- `js/feedback.js` — the module described above.
- `tests/js/feedback/feedback.test.js` — unit tests for `buildPrefilledUrl()` and the open/close DOM lifecycle.

**Modified files:**

- `index.html`
  - Remove `.speed-control`, `#btn-theme`, `#btn-defaults` from the header.
  - Add `#btn-feedback` button in the freed header space, before the run-control cluster.
  - Add the three controls into `aside#sensor-panel .settings-section`, in the order shown above.
  - Add `<script src="js/feedback.js"></script>` immediately after `<script src="js/main.js"></script>` and immediately before `<script src="js/version_check.js"></script>`.
  - Add an inline init line right after the new script tag: `<script>window.feedback && window.feedback.init();</script>` — matches the `versionCheck.init()` pattern already in the file.

- `css/style.css`
  - Add `.feedback-modal-backdrop`, `.feedback-modal`, `.feedback-modal-header`, `.feedback-modal-close`, `.feedback-modal-iframe` styles.
  - Add `.btn-feedback` styling consistent with the existing meta-button family (matches `.btn-file` / `.btn-reset` tonally — not as prominent as `.btn-run`).
  - Extend `.settings-section` rules so it cleanly stacks `.speed-control`, theme toggle, units row, and Defaults button.
  - Body-scroll-lock class `.feedback-modal-open { overflow: hidden; }`.

- `js/main.js`
  - No changes required. `feedback.js` self-wires via its own inline init, matching `version_check.js`.

- `js/version_check.js`
  - Expose the baseline SHA on the `versionCheck` API so `feedback.js` can read it without duplicating the fetch. Add `getBaselineSha()` returning `baselineSha`.

**Not changed:**

- `py/spike_bridge.py`, `js/simulator.js`, `js/blockly_config.js`, `js/monaco_config.js`, the LLSP3 stack, the Python runtime path. This feature is entirely UI chrome.

## Testing

**Unit (`tests/js/feedback/feedback.test.js`):**

- `buildPrefilledUrl()` with all metadata present produces a URL with three `entry.X=value` params, each properly URL-encoded.
- `buildPrefilledUrl()` with `FORM_BASE_URL` empty returns empty string.
- `buildPrefilledUrl()` with some `ENTRY_IDS` empty skips those params (no empty `entry.=…`).
- `open()` injects modal DOM and sets `<body>` class.
- `close()` removes the modal-open class and hides the modal.
- ESC keydown handler closes when modal is open and is a no-op when it isn't.

**Manual verification:**

- Click 💬 Feedback → modal opens, form is visible, prefilled fields contain real SHA, current mode (`blocks` or `python` depending on active tab), and browser UA.
- ESC closes. Backdrop click closes. ✕ button closes.
- Submit a test report → row appears in the linked Google Sheet within seconds with metadata intact.
- Speed slider in hub panel still throttles simulation; theme button still toggles theme; Defaults button still resets theme/speed/editor content.
- Hub panel collapse still works; new Settings controls hide with it.
- Switch to the Python tab, open Feedback → "Mode" field shows `python`. Repeat from Blocks tab → shows `blocks`.
- With `FORM_BASE_URL` cleared in `feedback.js`, the 💬 Feedback button does not appear in the header.

## Operational setup (one-time, outside the code)

This setup is what the maintainer does after the code lands. Until step 4 is complete the feature is dormant in production (button hidden).

1. **Create the Google Form** with the fields listed under "Architecture → 1. A Google Form". Use a single section, in the order shown.
2. **Extract the `entry.NNNNN` IDs.**
   - In Google Forms: ⋮ menu → **Get pre-filled link** → put placeholder values into the three metadata fields (`SHA_HERE`, `MODE_HERE`, `UA_HERE`) → **Get link** → copy the resulting URL.
   - Each metadata field appears in the URL as `entry.NNNNN=SHA_HERE`. Record the three numeric IDs.
3. **Extract the embed URL.** Send → Embed `<>` → copy the iframe `src` attribute. That string is `FORM_BASE_URL`.
4. **Paste both into `js/feedback.js`:**
   - `FORM_BASE_URL = '<embed src>';`
   - `ENTRY_IDS.sha       = 'entry.NNNNN';`
   - `ENTRY_IDS.mode      = 'entry.NNNNN';`
   - `ENTRY_IDS.userAgent = 'entry.NNNNN';`
5. **Enable Sheet notifications.** Open the linked Google Sheet → Tools → Notification settings → "Any changes are made" → "Email — right away".

Optional: pin the Sheet in your Drive and bookmark it. This is now your triage inbox.

## Risks and mitigations

- **Google rate-limits or blocks the iframe in some networks (schools).** Mitigation: feature degrades cleanly — the iframe shows Google's own error, the surrounding modal still closes, the rest of the app is unaffected. Document in the BACKLOG that we'd revisit if schools report this.
- **Reporters edit the prefilled metadata.** Acceptable; the field is a hint, not a guarantee. Triage filters can flag rows where the SHA doesn't match a known build.
- **Spam.** Google's own anti-abuse handles it for now; if reports become spammy the Form settings can require a Google sign-in, raising friction but cleaning the inbox.
- **The Form is deleted or its embed URL rotates.** Single point of failure. Mitigation: comment in `feedback.js` documenting how to regenerate, plus the steps above duplicated in the project's `README.md` under "Maintainer notes" — out of scope here, noted as a follow-up.

## Out of scope (revisit triggers)

- **Screenshot capture.** Revisit if Sheet triage shows repeated requests like "can you screenshot what your screen looks like?".
- **Direct GitHub Issue creation.** Revisit if report volume justifies a Cloudflare Worker (or similar) bridge.
- **Keyboard shortcut to open the modal.** Easy to add; not in v1.
- **In-app "thank you" toast after submission.** Cross-origin iframe means we don't see the submit event without polling iframe history — not worth the complexity in v1.
