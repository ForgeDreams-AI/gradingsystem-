# Grading System — Locked Spec (source of truth for the build)

> Status: **Phase 0 complete.** UI/UX outline approved (see `mockups/`).
> Next: **Phase 2 build** — schema/sheet → grader app → persistence → reporting/email.

## Stack (test / zero-budget)
- **Frontend:** static site on **GitHub Pages** (React + Tailwind). Mobile/tablet-first, button-driven, large tap targets, one-handed.
- **Backend / DB:** **Google Sheets** via **Google Apps Script** web app (API + scheduled triggers).
- **Email:** Gmail / MailApp from Apps Script.
- **Scheduler:** Apps Script time-driven trigger.

## Auth
- **PIN per grader.** Graders are the only app users.
- Captains & higher-ups **never log in** — they only receive emailed reports.

## Topics / Events / Sides
- A **topic** contains named **events** (columns), e.g. topic "Quick Attack / Plug" → events *Quick Attack*, *Plug*.
- An event may require a **side / role** (configurable list). Example: *Plug* → [Engineer, Captain]; *Quick Attack* → no side.
- The grader picks each event's side **once per session** at **Session Setup**; it is **locked for the whole session** (changes only when a new session starts).
- Scoring: each side scored **separately AND combined** per event.
- All of this is **admin-editable** (add/edit/remove events, sides, mode).

## Groups / Chart
- Tap-to-fill **chart**: one column per event; tap a column, tap a recruit → they move from the unselected pool into the slot.
- **Swappable** anytime; **cross-company** pairing allowed (combined roster from multi-selected companies).
- Group = one recruit per event column (2-column default; supports N events).

## Grading
- Outcomes: **Pass / Fail / Memo**.
- **Memo** = its own outcome **and** carries a free-text note.
- **Fail and Memo** reveal **multi-select reasons** (global or per-event) **+ free-text "Other"** / note.
- Both recruits graded → **Submit** writes immutable attempt rows.

## Attempts & Scoring
- **Immutable attempts**: each graded attempt locks; a re-grade adds a **new** attempt row (full history kept; e.g. 3 attempts = 2 pass + 1 fail).
- **Score = passes ÷ total attempts, per event (and per side).** Memo counts as **Fail** in the percentage.
- **Alert:** if a recruit has **< 3 attempts** on any event during the week → alert that recruit's **company captain**.

## Mid-session company swap
- Saved results are **never touched** (immutable).
- Swapped-out company's recruits are **cleared from not-yet-graded slots**; refill from the new company's roster.

## Reliability (field requirement)
- **Immediate persistence:** every Submit posts to the Sheet right away (append-only) — a recorded result is never lost.
- **Offline-first:** submits also queue locally on the iPad (IndexedDB/localStorage). Grading continues with no service; queued submits **auto-sync on reconnect** with **retry + idempotency/de-dupe** (no double-posting). Show a pending/synced indicator.
- 4–5 graders record **different areas concurrently**; append-only model merges results.

## Reporting (daily email)
- **Time:** 1:00 PM **Arizona (America/Phoenix, no DST)**.
- **Cadence:** only on days new data was entered (skip empty). Organized **by day**, with running **daily + weekly totals**, then saved.
- **Format:** HTML email **+ PDF per area**. Color-coded grades; per-event passes/attempts + %; side breakdowns + combined.
- **Color bands + thresholds (admin-configurable):** color set, the **% range each color represents**, and **separate daily vs weekly minimum %** (same bands).
- **Editable legend** (Pass / Fail / Memo meanings) printed on **every** report PDF.
- **Recipients / scope:**
  - **Recruit** → their own report.
  - **Captain** → one report **per company** they own (every recruit in it).
  - **Higher-up** → **all companies** department-wide.
- Idempotent sends; log every send with status.

## Tenancy
- **Single department** for now, but built so multiple concurrent graders merge cleanly. (White-label/multi-org is a later option.)

## Data entities (records)
- **Captain** = name + email.
- **Recruit (personnel)** = first name, last name, work email (+ results).
- **Higher-up** = name + email.
- Companies, captains, higher-ups, recruits, topics, events, sides, fail reasons, grader PINs, color bands, thresholds, legend, report time/zone — **all data-driven & editable in-app**.

## Acceptance criteria
- [ ] Grader: PIN → topic → **session setup (lock sides)** → multi-select companies → combined roster → build groups on chart.
- [ ] Pass/Fail/Memo; Fail/Memo reveal reasons + note; both graded before Submit.
- [ ] Submit writes immutable per-recruit attempt rows (with event + side) **immediately**, and **offline-queues** when no service.
- [ ] Company swap mid-session keeps saved data, clears ungraded slots.
- [ ] All entities creatable/editable in-app; nothing hard-coded.
- [ ] Daily role-based reports (HTML + PDF) email at 1 PM Arizona on data days, color-coded, with side breakdown + combined, legend, and <3-attempt captain alerts.
