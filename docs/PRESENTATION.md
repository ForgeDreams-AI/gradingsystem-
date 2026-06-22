# Presentation Pack — Fire Department Grading System

Everything you need to present in ~10 minutes. Slides/visuals are in
`docs/real-app-poster.pdf` (and `mockups/real-app-poster.png`). Sample reports
for all three levels are in `docs/Report-Samples.pdf` (and
`mockups/report-samples-poster.png`).

---

## 0) Before the day — one-time setup (15 min)

So the demo looks polished with the 14-engine department:

1. **Backend code is current.** In Apps Script, make sure `01_Schema` includes
   `grade_style` on Events, and `14_DemoData` exists (paste from `main` if not).
2. Run **`setupSpreadsheet()`**, then **`seedDemoData()`** (adds 14 engines,
   Engine 9 = 3 people, captains, 3 higher-ups, **SCBA** + **Quick Attack/Plug**,
   grader PINs **1234 / 2468**).
3. **Deploy → Manage deployments → New version.**
4. On the iPad, open the app, **Settings → Backend connection → Test** → should
   say ✅. Sign in with **1234**. Do **Add to Home Screen** so it's full-screen.
5. *(Optional, to show a report)* enter a couple grades, then in Apps Script run
   **`runReportsNow()`** with your own email on a recruit/captain row so a real
   PDF lands in your inbox to show.

**Demo-safety:** if wifi or the backend hiccups in the room, the app still opens
offline (cached) and queues grades — and you have the **poster/PDF** as a
guaranteed fallback. Have it open in a tab.

---

## 1) The 90-second story (what to say)

- **The problem.** Departments grade recruits on live evolutions with clipboards
  and spreadsheets. Results get lost, scoring is inconsistent, and nobody sees
  the numbers until much later.
- **The solution.** A phone/iPad app graders tap through with zero training.
  Every result saves instantly — even with no signal — and every afternoon the
  right people automatically get a clean, color-coded report.
- **Why it's different.** Nothing is hard-coded. Companies, people, events,
  reasons, scoring, schedule — all editable in the app. It cost $0 to run
  (Google Sheets + Apps Script + GitHub Pages).

---

## 2) Live demo — the click path (~4 min)

> Sign out first so you start clean at the PIN screen.

1. **Sign in** — PIN **1234**. *"Only graders log in; one tap per digit."*
2. **Home** — *"Grade, or manage everything in Settings."* Tap **Start grading**.
3. **Pick topic** — choose **Quick Attack / Plug**.
4. **Lock the side** — pick **Engineer** side. *"Locked for the whole session so
   you're never re-asked."*
5. **Pick companies** — tap **Engine 4** then **Engine 1**. *"The numbers show
   the order they'll be graded in."* → **Build Roster**.
6. **Build groups** — tap a name into Quick Attack, tap **Plug**, tap another
   name. *"Cross-company is fine. ✕ to swap. Add a company mid-session here too."*
   Tap **Add group** to queue a second pair. *"Build as many as you want."*
7. **Grade** — **Start Grading**. Just two big buttons: **Pass / Fail**. Tap
   **Fail** → *"reason buttons appear, specific to this event."* Submit.
   *"Memos and peer reviews aren't buttons anymore — they happen automatically
   from the weekly score (see below), so grading stays one tap."*
8. **Show it's saved** — *(if online)* open the Google Sheet's **Evaluations**
   tab — *"immutable rows, attempt numbers, who/when. Never overwritten."*
9. **Individual mode** — tap **🏠 Home → Start grading → SCBA**. *"Some events
   aren't paired — SCBA you just go down the roster, one at a time, pass/fail."*
   Tap **Pass** a couple times to show the auto-advance + progress bar.
10. **Admin** — **🏠 Home → Settings**. *"Every company, recruit, event, reason,
    PIN, color threshold, and the report schedule — all editable here, no code."*
    Open **Fail Reasons** to show the per-event buttons.

## 3) The payoff — the report (1 min)

- Show **`docs/Report-Samples.pdf`** — the three levels side by side (recruit,
  captain, higher-up), or the live emailed **PDF** from `runReportsNow()`.
- *"At 1 PM each day: every recruit gets their own results, each captain gets
  their company, each chief gets everything — color-coded green/yellow/red, with
  a 'who needs reps' list and an alert if someone's under 3 attempts."*
- Point at the captain column: *"And at the end of the week, the report tells the
  captain exactly who needs a memo or peer review — with a one-tap link to send
  it."*

## 3b) Memos & peer reviews — the sign-and-return loop (1 min)

> This replaced the old "Memo" grade button. Nobody taps a memo during grading —
> it's a *result* of the week's scores, so it can't be gamed or forgotten.

- *"It's all threshold-driven and the thresholds are editable in Settings:"*
  - End of week **below 65%** → **Memo** (default; `memo_threshold_pct`).
  - End of week **below 50%** → **Peer review** (default; `peer_review_threshold_pct`).
- **Captain** opens the link in their report → picks the flagged recruit, types a
  note → **Send for signature**.
- **Recruit** gets an email → opens it, **checks the box + types their name** to
  sign → it returns to the captain and is **stored by engine company + name** in
  the **Reviews** tab.
- *"Whole loop is email links — no logins, works on any phone."*

## 4) Close

- **Reliable** (saves instantly, works offline), **fast** (taps, no typing),
  **fair** (consistent scoring + full history), **free**, and **100%
  configurable**. Built and deployed — not a mockup.

---

## Q&A — likely questions
- **"What if there's no internet?"** Keeps grading; syncs automatically when
  signal returns; never double-counts.
- **"Two people swap / a company leaves / someone goes twice?"** Handled live —
  swap on the grade screen, edit groups mid-session, repeats record as new
  attempts. Already-saved results never change.
- **"Who can see what?"** Recruit = self, captain = their company, chief = all.
- **"How do memos / peer reviews work?"** Automatic from the weekly score —
  under 65% = memo, under 50% = peer review (both thresholds editable). The
  captain fills a short form, the recruit signs it by email (checkbox + name),
  and it's stored by engine company + name. No grade button, nothing to forget.
- **"What does it cost / where does it run?"** Google Sheet (data) + Apps Script
  (API + emailer) + GitHub Pages (app). All free tiers.
- **"Can we change the events/scoring?"** Yes — all in the in-app admin.
