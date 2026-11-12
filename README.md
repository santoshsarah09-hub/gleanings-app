# Gleanings

Capture stories, illustrations, humor, quotes, meetings and follow-ups; file them into Master Resources; keep them in step with Sunday and Wednesday preaching and Google Calendar.

- `index.html` — the app. Open it from GitHub Pages as an installable phone app (connect once with the server link and your private passcode), or through the Apps Script Google-sign-in link.
- `manifest.webmanifest`, `sw.js`, icons — make the GitHub Pages copy installable; the service worker caches only the app's own files, never notes or keys.
- Older line: The Apps Script web app loads it from this repo on every open, so updates here reach the phone without redeploying.
- `apps-script/Code.gs`, `apps-script/appsscript.json` — the Google Apps Script server (paste once into script.google.com).
- `src/shim.js`, `src/build.py` — the bridge that connects the app to Apps Script and the user's own Anthropic API key.

No notes or keys are stored here. Ordinary notes live in a Google Sheet in the owner's Drive; private and patient/family notes live only in the script's private user settings.

Security: every server call goes through `rpc()`, which allows only the owner's Google session or the phone passcode (stored as a salted SHA-256 fingerprint; 10 wrong tries locks it for 15 minutes). Run `makePasscode` in the editor to create or replace the passcode.
