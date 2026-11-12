# Gleanings

Capture stories, illustrations, humor, quotes, meetings and follow-ups; file them into Master Resources; keep them in step with Sunday and Wednesday preaching and Google Calendar.

- `index.html` — the app. Open it from GitHub Pages as an installable phone app (connect once with the server link and your private passcode), or through the Apps Script Google-sign-in link.
- `manifest.webmanifest`, `sw.js`, icons — make the GitHub Pages copy installable; the service worker caches only the app's own files, never notes or keys.
- Older line: The Apps Script web app loads it from this repo on every open, so updates here reach the phone without redeploying.
- `apps-script/Code.gs`, `apps-script/appsscript.json` — the Google Apps Script server (paste once into script.google.com).
- `src/shim.js`, `src/build.py` — the bridge that connects the app to Apps Script and the user's own Anthropic API key.

No notes or keys are stored here. Ordinary notes live in a Google Sheet in the owner's Drive; private and patient/family notes live only in the script's private user settings.

Security: every server call goes through `rpc()`, which allows only the owner's Google session or the phone passcode (stored as a salted SHA-256 fingerprint; 10 wrong tries locks it for 15 minutes). Run `makePasscode` in the editor to create or replace the passcode.

## Friends edition (`share/`)

A shareable copy for friends. Each person installs their **own** copy in their **own** Google account, so nobody's notes mix.

- Setup guide for friends: https://santoshsarah09-hub.github.io/gleanings-app/share/setup.html
- `share/Code.gs`, `share/appsscript.json`: the server each friend pastes into their own Apps Script project. `firstSetup` creates their Gleanings folder (Master Resources with six tabs, Meeting Notes, Used Stories Log, Inbox, Study Journal, data sheet, photos) and a one-time setup code; the welcome screen uses that code to let them choose their own password. `resetPassword` gives a new setup code without losing notes.
- `share/index.html` is generated: `python3 share/build_share.py` rebuilds it from the personal `index.html`, replacing the owner's file IDs, calendars and personal wording with each friend's own setup. AI is optional; without a key the app files notes with manual choices.
