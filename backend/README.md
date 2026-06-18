# Backend — Google Apps Script + Google Sheets

This is the whole backend: a **Google Sheet** is the database, and a bound
**Apps Script** project is the API + the daily report emailer. No servers, no
hosting bill, no API keys.

> New here? Read the files in number order (`01_Schema` → `12_Triggers`). Each
> one starts with a comment explaining what it does and what's safe to edit.

---

## What each file does

| File | Purpose |
|------|---------|
| `appsscript.json` | Project manifest. Pins the timezone to **America/Phoenix** and makes the web app callable by the front-end. |
| `01_Schema.gs` | **Edit here to change columns/settings.** Defines every tab, its columns, and the default Settings. |
| `02_Setup.gs` | One-time `setupSpreadsheet()` (builds tabs) and optional `seedSampleData()` (demo data). |
| `03_Utils.gs` | Generic Sheet read/write helpers. |
| `04_Config.gs` | Reads Settings; builds the config the app downloads on launch. |
| `05_Api.gs` | `doGet` / `doPost` — the web-app endpoints. |
| `06_Auth.gs` | Grader PIN sign-in. |
| `07_Sessions.gs` | Start/end a session; log company swaps. |
| `08_Submit.gs` | **Saves grades.** Immutable rows, attempt numbers, de-dupe, locking. |
| `09_Scoring.gs` | The math: pass %, memo handling, color bands. |
| `10_Reporting.gs` | Builds the recruit / captain / higher-up reports. |
| `11_Email.gs` | HTML → PDF, send via Gmail, log the send. |
| `12_Triggers.gs` | Schedules the 1 PM job; `runReportsNow()` for testing. |

---

## One-time setup (≈10 minutes)

1. **Create the Sheet.** Go to <https://sheets.new>, name it (e.g. *Grading DB*).
2. **Open the script editor.** In the Sheet: **Extensions → Apps Script**.
3. **Add the files.** For each `.gs` file here, create a matching file in the
   editor (same name, the `.gs` is implied) and paste the contents. Replace the
   manifest too: click the ⚙️ **Project Settings → "Show appsscript.json"**, then
   paste `appsscript.json`.
   *(Faster option: use [clasp](https://github.com/google/clasp) to push this
   folder straight into the project.)*
4. **Build the tabs.** In the editor pick `setupSpreadsheet` from the function
   dropdown and click **▶ Run**. Approve the permissions prompt the first time.
5. *(Optional)* Run `seedSampleData` to get demo companies/recruits and a test
   grader with **PIN 1234**.
6. **Schedule reports.** Run `installDailyTrigger` once.
7. **Deploy the API.** **Deploy → New deployment → type: Web app**.
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - Click **Deploy**, copy the **/exec Web app URL** — the front-end uses this.

> Re-deploy (**Deploy → Manage deployments → Edit → new version**) whenever you
> change the code. Re-running `setupSpreadsheet` after adding a column is safe —
> it only rewrites headers, never your data.

---

## Configuring it (no code)

Everything lives in the Sheet tabs:

- **Settings** — report time, timezone, color % cut-offs, daily/weekly minimums,
  low-attempt threshold, which weekdays the flag shows, legend text, etc. Each
  row has a `notes` column explaining it.
- **Companies / Captains / HigherUps / Recruits** — your people.
- **Topics / Events / EventSides** — what gets graded. Set an event's
  `side_required` to `yes` and add its options in **EventSides** (e.g. Plug →
  Engineer, Captain).
- **FailReasons** — reason buttons. Blank `event_id` = global; set it to scope a
  reason to one event.
- **Graders** — name + PIN.

`active` columns: leave blank or `yes` to include; set `no` to hide without
deleting.

---

## API contract (for the front-end)

Base URL = your deployed `/exec` URL.

**GET** `?action=ping` → `{ ok, service, time }`
**GET** `?action=config` → `{ ok, config:{ settings, colors, companies, captains, higherUps, recruits, topics, events, eventSides, failReasons, graders } }`
**GET** `?action=roster&company_ids=c1,c2` → `{ ok, recruits:[...] }`

**POST** (body = JSON string, `Content-Type: text/plain` — see CORS note):

```jsonc
// login
{ "action": "login", "pin": "1234" }
// → { ok, grader:{ grader_id, name } }

// start a session
{ "action": "startSession", "grader_id":"g1", "topic_id":"t1", "company_ids":["c1","c2"] }
// → { ok, session_id }

// save a graded group  (the important one)
{
  "action": "submitGroup",
  "session_id": "…",
  "grader_id": "g1",
  "client_submit_id": "uuid-the-app-generated",   // makes retries safe
  "items": [
    { "recruit_id":"r1", "topic_id":"t1", "event_id":"e1", "side_id":"",
      "company_id":"c1", "result":"pass" },
    { "recruit_id":"r4", "topic_id":"t1", "event_id":"e2", "side_id":"s1",
      "company_id":"c2", "result":"fail", "note":"slow",
      "reasons":[ { "reason_id":"fr4" }, { "text":"Other: hesitated" } ] }
  ]
}
// → { ok, evals:[ { eval_id, recruit_id, event_id, side_id, attempt_number } ] }
//   (if this client_submit_id was already saved: { ok, deduped:true, evals:[…] })

{ "action": "swapCompany", "session_id":"…", "remove_company_id":"c1", "add_company_id":"c3" }
{ "action": "endSession", "session_id":"…" }
```

### CORS / offline notes for the front-end
- POST with **`Content-Type: text/plain`** and a JSON string body. This keeps it
  a "simple request" so the browser skips the preflight Apps Script can't answer.
- Generate `client_submit_id` (a UUID) **when the grader taps Submit**, store the
  pending submit locally (IndexedDB), and POST it. On failure, keep it queued and
  retry later — the same id means the server de-dupes, so nothing double-posts.

---

## Testing without sending real email
- Run `runReportsNow()` after entering a couple of grades (or seed + a manual
  `submitGroup` POST). Check the **SendLog** tab to see what would send.
- To avoid emailing real people while testing, point the sample recipients'
  emails at your own inbox, or comment out the `MailApp.sendEmail` call in
  `11_Email.gs` and just read the generated HTML/PDF.

## Security note
The web app is deployed **Anyone** (anonymous) so the public GitHub Pages app can
reach it; access control is the grader **PIN**. The data here is low-stakes, but
if you need more, you can: hash PINs, add a shared secret header check in
`doPost`, or deploy to "Anyone within <your domain>" and host the app behind a
Google login.
