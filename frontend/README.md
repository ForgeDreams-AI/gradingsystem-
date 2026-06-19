# Grader App (front end)

The real app graders use on a phone/iPad. It talks to the Apps Script backend
(`/backend`), saves immutable results, and **keeps working offline** (queues
submits and syncs when signal returns).

## Folders
- `src/` — source you edit (`app.jsx` is the whole app; `index.html`, `sw.js`,
  `manifest.webmanifest` are the shell).
- `dist/` — the built, ready-to-host site (committed, so you don't have to build).
- `build.sh` — rebuilds `dist/` from `src/` (only needed if you change `src/`).

## How it connects
On first launch the app asks for your backend **Web app URL** (the `/exec` URL
from deploying the Apps Script). It saves it on the device and never asks again.
Graders then sign in with their **PIN**.

## Deploy (host the `dist/` folder)

**Option A — GitHub Pages (recommended, free, gives an https URL):**
1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. The included workflow (`.github/workflows/deploy-pages.yml`) publishes
   `frontend/dist` automatically on push to `main`.
3. Your app URL will be `https://<owner>.github.io/<repo>/`.

**Option B — Any static host:** drop the contents of `dist/` on Netlify, Cloud­
flare Pages, etc. (Must be **https** so offline mode + "Add to Home Screen" work.)

## Using it in the field
1. Open the app URL on the iPad in Safari.
2. **Share → Add to Home Screen** — it then runs full-screen like a real app and
   works offline after the first load.
3. Paste the backend URL once, sign in with a PIN, and grade.

## Offline behavior
- Every **Submit** is saved on the device first, then sent — a grade is never
  lost.
- No signal? Grading keeps going; the status bar shows **"⏳ N to sync"**. When
  signal returns it syncs automatically, and the backend de-dupes so nothing is
  ever double-counted.
- The app shell itself is cached (service worker), so it opens with no signal.

## Rebuilding
Only if you edit `src/`:
```bash
cd frontend && ./build.sh    # needs Node.js; writes dist/
```
Then commit `dist/` (and bump the `CACHE` name in `src/sw.js` so devices pick up
the new version).
