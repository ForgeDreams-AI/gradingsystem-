# Grading System — What It Does (Plain-English Overview)

A simple guide to everything the app can do. No tech-speak. If you can read a
recipe, you can read this.

> **The big idea:** graders tap through a few quick screens on a phone or iPad to
> mark people **Pass / Fail / Memo** during live events. Everything saves
> instantly. Every afternoon, the right people automatically get an emailed
> report — color-coded, easy to read — without anyone lifting a finger.

---

## Part 1 — The App (what graders see and tap)

Think of it like a checklist that walks you forward, one screen at a time. Big
buttons, almost no typing, works one-handed.

### 🔢 1. Sign in with a PIN
- Each grader has their own 4-digit PIN. Tap it in, you're in.
- **Only graders log in.** Captains and bosses never touch the app — they just
  get emails.

### 📋 2. Pick what you're grading
- Choose a **topic** (e.g. "Quick Attack / Plug"). A topic is just a set of
  things being graded that day.

### 🔒 3. Lock the "sides" for the session
- Some events have a role to pick — for example **Plug** can be graded on the
  **Engineer side** or the **Captain side**.
- You pick it **once** at the start, and it stays locked the whole session, so
  you're never re-asked while you're busy grading.

### 🏢 4. Pick the companies
- Tap one or more **engine companies**. Their rosters get combined into one list
  to choose from. (You can mix people from different companies in the same pair.)

### 👥 5. Build groups on a simple chart
- The screen shows columns (one per event) and a pile of names below.
- **Tap a column, tap a name** — the person drops into that spot and leaves the
  pile.
- Made a mistake or someone swapped out? **Tap the red ✕** to pull them back. No
  dragging, no menus.

### ✅ 6. Grade with three big buttons
- For each person: **PASS**, **FAIL**, or **MEMO**.
- **Fail or Memo** pops up reason buttons (you can pick more than one) plus a box
  for a quick note.
- When both people in the group are graded, hit **Submit** — done, saved.

### 🔁 7. Keep going — rounds, not restarts
- After the last group, you don't start over from scratch. You get three buttons:
  - **Run again — same roles** (another round for the same people),
  - **Run again — swap roles** (everyone flips to the other event automatically),
  - **End session.**
- If someone left, just ✕ them and drop in a replacement. Easy.

### ⚙️ 8. Admin / setup (also in the app)
Everything is editable here — **nothing is hard-coded**:
- Companies, captains, bosses, and rosters
- Topics, events, and their sides
- Fail reasons (shared, or specific to one event)
- The pass/fail color cut-offs and the daily/weekly target %
- The legend text that prints on reports
- Report send time, grader PINs, and more

### 📶 Built for the real world (no signal? no problem)
- **Every Submit saves immediately** — a grade is never lost.
- **Works offline.** If the iPad loses service out in the field, grading keeps
  going. The moment signal comes back, everything syncs up automatically — and
  it's smart enough to **never double-count** anything.
- **Several graders at once.** 4–5 people can grade different areas at the same
  time and it all merges together cleanly.

---

## Part 2 — The Reports (what shows up in inboxes)

Every afternoon (default **1:00 PM Arizona time**), the system emails reports —
only on days something new was actually graded.

### Who gets what
- **Each recruit** → their own results.
- **Each captain** → one report per company they run, with everyone in it.
- **Each higher-up** → one report covering all companies.

### What's in them (HTML email **+ a PDF**)
- A big **overall % score**, colored **green / yellow / red** so you know at a
  glance how someone's doing.
- A breakdown **per event** — and for events with sides (like Plug), it shows the
  **Engineer** and **Captain** sides separately **and** combined.
- The score is simply **passes ÷ attempts**. (A Memo counts against the score,
  like a fail.)
- A **"who needs reps" list** for captains and bosses: every event, everyone
  listed by how many attempts they've done, color-coded — so you instantly see
  who's behind and who's struggling.
- A **heads-up flag** when someone hasn't gotten enough attempts in yet
  (defaults to fewer than 3). Recruits see this on Wed/Thu; captains on
  Tue/Wed/Thu — early enough in the week to fix it.
- A plain-English **legend** explaining Pass, Fail, and Memo, on every report.

---

## Part 3 — Under the Hood (the simple version)

You don't need to know any of this to use it — but here's how it's wired.

### Where everything lives
- The "database" is a **Google Sheet**. Every company, recruit, topic, grade, and
  setting is just rows in tabs you can open and read.
- The app itself is a lightweight web page that runs on a phone or iPad.

### How it all connects (the flow)
```
  Grader's iPad                Google Sheet                 Inboxes
  ┌───────────┐   tap Submit   ┌──────────────┐  1 PM daily  ┌─────────┐
  │  The App  │ ─────────────▶ │  Database +  │ ───────────▶ │ Recruits│
  │ (offline  │   (instant,    │  Report Robot│   emails     │ Captains│
  │  safe)    │ ◀───────────── │              │   (PDF)      │ Bosses  │
  └───────────┘   gets config  └──────────────┘              └─────────┘
```

### The pieces
- **The app** (front end): the screens above. Saves grades the instant you tap
  Submit, and keeps a backup on the device so nothing is lost offline.
- **The database** (a Google Sheet): holds all the settings and every grade.
  Grades are **append-only** — once saved, a result is never overwritten, so you
  always have the full history (attempt 1, attempt 2, attempt 3…).
- **The report robot** (a scheduled job): wakes up at the set time, does the
  math, builds the color-coded PDFs, and emails them to the right people. It
  keeps a log and won't accidentally email anyone twice.

### Why this setup
- **Cheap to run** for a test — Google Sheets and the emailer are free.
- **Anyone can peek inside** — it's just a spreadsheet.
- **Easy to change** — update a setting in the Sheet, no programming needed.

---

## Part 4 — The Promises (what it guarantees)

- ✅ **Fast for graders** — taps, not typing; built for one hand on a phone.
- ✅ **Never loses data** — saves instantly, works offline, syncs later, no
  double-counting.
- ✅ **Full history** — every attempt is kept; nothing gets erased.
- ✅ **Right info to the right people** — recruits, captains, and bosses each get
  exactly their view, automatically.
- ✅ **You're in control** — every label, list, color, %, threshold, and schedule
  is editable in the app. Nothing is locked in code.

---

*Want to see it? Open `mockups/all-screens-poster.png` for every screen on one
page, or the live clickable prototype in `mockups/`. The full technical spec
lives in `docs/SPEC.md`, and the backend setup guide is in `backend/README.md`.*
