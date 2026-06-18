/**
 * GradingSystemMockup.jsx
 * -----------------------------------------------------------------------------
 * CLICKABLE UI/UX OUTLINE (prototype only — no backend, all data is mocked)
 *
 * Reflects Phase 0 decisions PLUS the topic/event "side" model:
 *   - A TOPIC contains named EVENTS / columns (e.g. "Quick Attack", "Plug").
 *   - An event may require a SIDE / role chosen at assignment time.
 *       • Quick Attack -> side doesn't matter (no options).
 *       • Plug         -> grader must pick "Engineer" or "Captain" side.
 *   - Sides are scored SEPARATELY and COMBINED on the report.
 *   - Everything (topics, events, sides, mode, reasons, colors, thresholds,
 *     legend, schedule, PINs, rosters) is admin-editable / data-driven.
 *
 * Other locked decisions: zero-budget test stack (GitHub Pages + Apps Script
 * later), PIN-per-grader login, grader-only app (captains/higher-ups only get
 * emailed PDFs), Pass/Fail/Memo (Fail & Memo reveal reasons + note), immutable
 * attempts, score = passes/attempts per event (+side), Memo counts as Fail,
 * admin color bands + daily/weekly minimum %, editable legend on every PDF,
 * alert to captain when a recruit has < 3 attempts on an event in the week.
 *
 * Tailwind utility classes. Single default export. Drop into React + Tailwind.
 * -----------------------------------------------------------------------------
 */

import React, { useState } from "react";

/* ----------------------------- MOCK CONFIG/DATA ---------------------------- */

const COLOR_BANDS = [
  { min: 85, label: "On track", color: "#16a34a", text: "#fff" }, // green
  { min: 70, label: "Watch", color: "#f59e0b", text: "#1f2937" }, // amber
  { min: 0, label: "Below standard", color: "#dc2626", text: "#fff" }, // red
];

const THRESHOLDS = { daily: 75, weekly: 80 };

const LEGEND = {
  pass: "PASS — recruit met the standard for the event on this attempt.",
  fail: "FAIL — recruit did not meet the standard; see reason(s).",
  memo: "MEMO — noted concern with a written note; counts as a fail in scoring.",
};

const TOPICS = [
  { id: "t1", name: "Quick Attack / Plug" },
  { id: "t2", name: "Ladder Ops" },
];

/*
 * Each event = a column. `sides` is the configurable list of role options the
 * grader must choose at assignment time. Empty array => side doesn't matter.
 */
const EVENTS = {
  t1: [
    { id: "e1", name: "Quick Attack", sides: [] },
    { id: "e2", name: "Plug", sides: ["Engineer", "Captain"] },
  ],
};

const COMPANIES = [
  { id: "c1", name: "Engine 1", captain: "Capt. Reyes" },
  { id: "c2", name: "Engine 4", captain: "Capt. Olsen" },
  { id: "c3", name: "Engine 7", captain: "Capt. Doyle" },
];

const ROSTER = [
  { id: "p1", name: "A. Carter", companyId: "c1" },
  { id: "p2", name: "B. Nguyen", companyId: "c1" },
  { id: "p3", name: "C. Flores", companyId: "c1" },
  { id: "p4", name: "D. Patel", companyId: "c2" },
  { id: "p5", name: "E. Ross", companyId: "c2" },
  { id: "p6", name: "F. Kim", companyId: "c2" },
];

const SAMPLE_REASONS = [
  "Improper hose lay",
  "Slow to charge line",
  "Wrong hydrant wrap",
  "Out of sequence",
  "PPE not donned",
];

/*
 * Weekly report sample. Rows carry an optional `side` so the report can show
 * each side separately AND a combined per-event roll-up.
 */
const REPORT_RECRUIT = {
  name: "A. Carter",
  company: "Engine 1",
  rows: [
    { event: "Quick Attack", side: null, passes: 5, attempts: 6 },
    { event: "Plug", side: "Engineer", passes: 4, attempts: 7 },
    { event: "Plug", side: "Captain", passes: 6, attempts: 8 },
    { event: "Forcible Entry", side: null, passes: 1, attempts: 2 }, // <3 -> alert
  ],
};

/* ------------------------------- HELPERS ----------------------------------- */

const pct = (p, a) => (a === 0 ? 0 : Math.round((p / a) * 100));
const bandFor = (v) => COLOR_BANDS.find((b) => v >= b.min) || COLOR_BANDS[COLOR_BANDS.length - 1];

/* ------------------------------- UI ATOMS ---------------------------------- */

function Phone({ children, title }) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        {title}
      </div>
      <div className="rounded-[2rem] border-8 border-slate-900 bg-slate-50 shadow-2xl overflow-hidden h-[640px] flex flex-col">
        {children}
      </div>
    </div>
  );
}

function TopBar({ left, center, right }) {
  return (
    <div className="flex items-center justify-between bg-slate-900 px-3 py-3 text-white">
      <div className="w-16 text-sm">{left}</div>
      <div className="flex-1 text-center text-sm font-semibold">{center}</div>
      <div className="w-16 text-right text-sm">{right}</div>
    </div>
  );
}

function BigButton({ children, onClick, color = "slate", active, disabled }) {
  const palette = {
    slate: "bg-slate-800 text-white",
    green: "bg-green-600 text-white",
    red: "bg-red-600 text-white",
    amber: "bg-amber-500 text-slate-900",
    ghost: "bg-white text-slate-800 border-2 border-slate-300",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl px-4 py-4 text-base font-bold tracking-wide transition active:scale-[0.98] ${
        palette[color]
      } ${active ? "ring-4 ring-offset-1 ring-slate-900/40" : ""} ${disabled ? "opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

function Pill({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- SCREENS ----------------------------------- */

function PinScreen({ onNext }) {
  const [pin, setPin] = useState("");
  const press = (d) => setPin((p) => (p.length < 4 ? p + d : p));
  return (
    <>
      <TopBar center="Grader Sign-In" />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="text-center">
          <div className="text-lg font-bold text-slate-800">Enter your PIN</div>
          <div className="text-xs text-slate-400">Capt. Reyes · Engine 1</div>
        </div>
        <div className="flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-4 w-4 rounded-full ${pin.length > i ? "bg-slate-900" : "bg-slate-300"}`} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => press(String(d))} className="h-16 w-16 rounded-full bg-white text-2xl font-bold text-slate-800 shadow active:scale-95">
              {d}
            </button>
          ))}
          <div />
          <button onClick={() => press("0")} className="h-16 w-16 rounded-full bg-white text-2xl font-bold text-slate-800 shadow active:scale-95">0</button>
          <button onClick={() => setPin((p) => p.slice(0, -1))} className="h-16 w-16 rounded-full text-sm font-semibold text-slate-500">⌫</button>
        </div>
        <div className="w-full px-2">
          <BigButton color="green" onClick={onNext} disabled={pin.length < 4}>Sign In</BigButton>
        </div>
      </div>
    </>
  );
}

function TopicScreen({ onBack, onNext }) {
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Pick Topic" />
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <p className="text-xs text-slate-400">Step 1 of 3 · Choose what you're grading today.</p>
        {TOPICS.map((t) => (
          <BigButton key={t.id} color="ghost" onClick={onNext}>{t.name}</BigButton>
        ))}
      </div>
    </>
  );
}

function CompanyScreen({ onBack, onNext }) {
  const [sel, setSel] = useState(["c1"]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Pick Companies" />
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-3 text-xs text-slate-400">Step 2 of 3 · Multi-select. Rosters combine into one chart.</p>
        <div className="space-y-3">
          {COMPANIES.map((c) => (
            <button key={c.id} onClick={() => toggle(c.id)}
              className={`flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left ${
                sel.includes(c.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
              }`}>
              <div>
                <div className="font-bold">{c.name}</div>
                <div className={`text-xs ${sel.includes(c.id) ? "text-slate-300" : "text-slate-400"}`}>{c.captain}</div>
              </div>
              <div className="text-xl">{sel.includes(c.id) ? "✓" : "+"}</div>
            </button>
          ))}
        </div>
        <div className="mt-auto pt-4">
          <BigButton color="green" onClick={onNext} disabled={sel.length === 0}>Build Roster ({sel.length})</BigButton>
        </div>
      </div>
    </>
  );
}

/* SESSION SETUP — pick each event's side ONCE; locked for the whole session. */
function SetupScreen({ onBack, onNext, sides, setSides }) {
  const events = EVENTS.t1;
  const ready = events.every((e) => e.sides.length === 0 || sides[e.id]);
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Session Setup" />
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-3 text-xs text-slate-400">
          Step 2 · Lock this session's events & sides. <b>Stays fixed until the session ends.</b>
        </p>
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-2xl border-2 border-slate-200 bg-white p-3">
              <div className="font-bold text-slate-800">{ev.name}</div>
              {ev.sides.length === 0 ? (
                <div className="text-xs text-slate-400">No side — graded as-is all session.</div>
              ) : (
                <>
                  <div className="mb-2 text-xs text-slate-400">Pick the side for this session:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {ev.sides.map((s) => (
                      <button key={s} onClick={() => setSides((p) => ({ ...p, [ev.id]: s }))}
                        className={`rounded-xl px-3 py-3 text-sm font-bold ${
                          sides[ev.id] === s ? "bg-slate-900 text-white" : "border-2 border-slate-300 bg-white text-slate-700"
                        }`}>
                        {s} side
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-auto pt-4">
          <div className="mb-2 rounded-lg bg-amber-50 p-2 text-center text-[11px] text-amber-700">
            🔒 Locked for the whole session once you continue.
          </div>
          <BigButton color="green" onClick={onNext} disabled={!ready}>Lock &amp; Pick Companies →</BigButton>
        </div>
      </div>
    </>
  );
}

/* The tap-to-fill CHART screen — sides are already locked from Session Setup. */
function ChartScreen({ onBack, onNext, sides }) {
  const events = EVENTS.t1;
  const [slots, setSlots] = useState({ e1: null, e2: null }); // value = pid
  const [activeEvent, setActiveEvent] = useState("e1");

  const placedIds = Object.values(slots).filter(Boolean);
  const pool = ROSTER.filter((p) => !placedIds.includes(p.id));
  const activeEv = events.find((e) => e.id === activeEvent);

  const place = (pid) =>
    setSlots((s) => {
      const cleared = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === pid ? null : v]));
      return { ...cleared, [activeEv.id]: pid };
    });

  const nameOf = (pid) => ROSTER.find((p) => p.id === pid)?.name;
  const compOf = (pid) => COMPANIES.find((c) => c.id === ROSTER.find((p) => p.id === pid)?.companyId)?.name;
  const ready = slots.e1 && slots.e2;

  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Build Group" right="Grp 1/4" />
      <div className="flex flex-1 flex-col overflow-hidden p-3">
        <p className="mb-2 text-[11px] text-slate-400">
          Step 4 · Tap a column, then a recruit. Sides are locked from setup. Tap a slot to swap.
        </p>

        {/* column headers — show the LOCKED side */}
        <div className="grid grid-cols-2 gap-2">
          {events.map((ev) => (
            <button key={ev.id} onClick={() => setActiveEvent(ev.id)}
              className={`rounded-xl border-2 p-2 text-center ${activeEvent === ev.id ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white"}`}>
              <div className="text-xs font-bold text-slate-800">{ev.name}</div>
              {sides[ev.id] ? (
                <div className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-white">🔒 {sides[ev.id]} side</div>
              ) : (
                <div className="text-[10px] uppercase tracking-wide text-slate-400">no side</div>
              )}
            </button>
          ))}
        </div>

        {/* slots */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          {events.map((ev) => (
            <div key={ev.id}
              className={`relative flex h-24 items-center justify-center rounded-xl border-2 border-dashed p-2 text-center ${
                slots[ev.id] ? "border-green-500 bg-green-50" : "border-slate-300 bg-white"
              }`}>
              {slots[ev.id] ? (
                <>
                  {/* explicit ✕ remove button */}
                  <button onClick={() => setSlots((s) => ({ ...s, [ev.id]: null }))}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow">
                    ✕
                  </button>
                  {/* tapping the slot also removes */}
                  <button onClick={() => setSlots((s) => ({ ...s, [ev.id]: null }))} className="leading-tight">
                    <div className="font-bold text-slate-800">{nameOf(slots[ev.id])}</div>
                    <div className="text-[10px] text-slate-400">{compOf(slots[ev.id])}</div>
                    {sides[ev.id] && <div className="text-[10px] text-slate-500">{sides[ev.id]} side</div>}
                    <div className="text-[10px] text-red-500">✕ or tap to remove</div>
                  </button>
                </>
              ) : (
                <span className="text-xs text-slate-400">empty</span>
              )}
            </div>
          ))}
        </div>

        {/* unselected pool */}
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Unselected ({pool.length})</div>
        <div className="mt-1 flex flex-1 flex-wrap content-start gap-2 overflow-auto rounded-xl bg-slate-100 p-2">
          {pool.map((p) => (
            <button key={p.id} onClick={() => place(p.id)} className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm active:scale-95">
              {p.name}
              <span className="ml-1 text-[10px] text-slate-400">{COMPANIES.find((c) => c.id === p.companyId)?.name.replace("Engine ", "E")}</span>
            </button>
          ))}
          {pool.length === 0 && <span className="p-2 text-xs text-slate-400">All placed.</span>}
        </div>

        <div className="pt-3">
          <BigButton color="green" onClick={onNext} disabled={!ready}>Start Grading Group →</BigButton>
        </div>
      </div>
    </>
  );
}

function GradeScreen({ onBack, onNext }) {
  const people = [
    { id: "p1", name: "A. Carter", event: "Quick Attack" },
    { id: "p4", name: "D. Patel", event: "Plug — Engineer side" },
  ];
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState({});
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasons, setReasons] = useState([]);
  const [note, setNote] = useState("");

  const current = people[idx];
  const setOutcome = (outcome) => {
    setResults((r) => ({ ...r, [current.id]: { outcome, reasons: [], note: "" } }));
    if (outcome === "pass") advance();
    else { setReasonOpen(true); setReasons([]); setNote(""); }
  };
  const confirmReasons = () => {
    setResults((r) => ({ ...r, [current.id]: { ...r[current.id], reasons, note } }));
    setReasonOpen(false); advance();
  };
  const advance = () => { if (idx < people.length - 1) setIdx(idx + 1); };
  const bothDone = people.every((p) => results[p.id]);
  const toggleReason = (r) => setReasons((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));

  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Grade · Group 1" right="1/4" />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-4 flex gap-2">
          {people.map((p, i) => {
            const o = results[p.id]?.outcome;
            const c = o === "pass" ? "bg-green-600" : o === "fail" ? "bg-red-600" : o === "memo" ? "bg-amber-500" : "bg-slate-300";
            return (
              <div key={p.id} className={`flex-1 rounded-lg p-2 text-center text-xs font-bold text-white ${c} ${i === idx ? "ring-4 ring-slate-900/20" : ""}`}>
                {p.name.split(" ")[1]}
                <div className="text-[10px] font-normal opacity-90">{o ? o.toUpperCase() : "…"}</div>
              </div>
            );
          })}
        </div>

        {!reasonOpen ? (
          <>
            <div className="rounded-2xl bg-white p-4 text-center shadow">
              <div className="text-xs uppercase tracking-wide text-slate-400">{current.event}</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">{current.name}</div>
            </div>
            <div className="mt-6 space-y-3">
              <BigButton color="green" onClick={() => setOutcome("pass")}>PASS</BigButton>
              <BigButton color="red" onClick={() => setOutcome("fail")}>FAIL</BigButton>
              <BigButton color="amber" onClick={() => setOutcome("memo")}>MEMO</BigButton>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-bold text-slate-800">Select reason(s) — {results[current.id]?.outcome.toUpperCase()}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLE_REASONS.map((r) => (
                <Pill key={r} active={reasons.includes(r)} onClick={() => toggleReason(r)}>{r}</Pill>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note / memo detail…" className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-sm" rows={3} />
            <div className="mt-auto">
              <BigButton color="slate" onClick={confirmReasons} disabled={reasons.length === 0}>Save Reason(s)</BigButton>
            </div>
          </>
        )}

        {bothDone && !reasonOpen && (
          <div className="mt-auto pt-4">
            <BigButton color="green" onClick={onNext}>Submit Group ✓</BigButton>
          </div>
        )}
      </div>
    </>
  );
}

/* Shown after the LAST group is graded — offer rounds instead of a new session. */
function RoundEndScreen({ onBack, onNext }) {
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Round Complete" right="4/4" />
      <div className="flex flex-1 flex-col p-4">
        <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4 text-center">
          <div className="text-3xl">✓</div>
          <div className="font-bold text-slate-800">All 4 groups graded</div>
          <div className="text-xs text-slate-500">8 immutable attempt rows saved this round.</div>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">What next?</div>
        <div className="mt-2 space-y-3">
          <BigButton color="green" onClick={onNext}>🔁 Run again — same roles</BigButton>
          <p className="px-1 text-[11px] text-slate-400">Same people, same columns. Grades become new attempts.</p>

          <BigButton color="slate" onClick={onNext}>⇄ Run again — swap roles</BigButton>
          <p className="px-1 text-[11px] text-slate-400">Auto-flips everyone (Quick Attack ⇄ Plug). Plug stays <b>Engineer</b> side.</p>

          <BigButton color="ghost" onClick={() => {}}>■ End session</BigButton>
        </div>

        <div className="mt-auto rounded-lg bg-slate-100 p-2 text-center text-[11px] text-slate-500">
          Next round opens on the chart first — ✕ anyone who left and drop in a replacement.
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AdminScreen({ onBack }) {
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Admin · Config" />
      <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
        <p className="text-xs text-slate-400">Everything below is data-driven & editable in-app.</p>

        {/* TOPIC / EVENT BUILDER */}
        <Section title="Topic & Event Builder">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-800">Topic: Quick Attack / Plug</div>
              <span className="text-xs text-slate-400">✎ edit</span>
            </div>

            {/* Event 1 */}
            <div className="mt-2 rounded-lg bg-slate-50 p-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Event · Quick Attack</span>
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">side: not required</span>
              </div>
            </div>

            {/* Event 2 with side options */}
            <div className="mt-2 rounded-lg bg-slate-50 p-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Event · Plug</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">side: required</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">Side options:</span>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-white">Engineer ✕</span>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-white">Captain ✕</span>
                <span className="rounded-full border border-dashed border-slate-400 px-2 py-1 text-[11px] text-slate-500">+ add side</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">Scoring: each side scored separately <b>and</b> combined.</div>
            </div>

            <button className="mt-3 w-full rounded-lg border-2 border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-500">+ add event / column</button>
          </div>
        </Section>

        <Section title="Color Bands & Thresholds">
          {COLOR_BANDS.map((b, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-white p-2 shadow-sm">
              <span className="flex items-center gap-2"><span className="h-4 w-4 rounded" style={{ background: b.color }} />{b.label}</span>
              <span className="font-mono text-xs text-slate-500">≥ {b.min}%</span>
            </div>
          ))}
          <div className="mt-1 flex gap-2 text-xs">
            <span className="rounded bg-slate-100 px-2 py-1">Daily min: {THRESHOLDS.daily}%</span>
            <span className="rounded bg-slate-100 px-2 py-1">Weekly min: {THRESHOLDS.weekly}%</span>
          </div>
        </Section>

        <Section title="Legend (prints on every PDF)">
          {Object.entries(LEGEND).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white p-2 text-xs shadow-sm"><span className="font-bold uppercase">{k}: </span>{v}</div>
          ))}
        </Section>

        <Section title="Other editable entities">
          <div className="flex flex-wrap gap-2">
            {["Companies", "Captains", "Higher-ups", "Recruits", "Fail reasons", "Grader PINs", "Report time / TZ"].map((x) => (
              <span key={x} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-white">{x}</span>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

function ReportScreen({ onBack }) {
  const r = REPORT_RECRUIT;

  // group rows by event name
  const groups = {};
  r.rows.forEach((row) => { (groups[row.event] = groups[row.event] || []).push(row); });

  const allPasses = r.rows.reduce((a, x) => a + x.passes, 0);
  const allAttempts = r.rows.reduce((a, x) => a + x.attempts, 0);
  const overall = pct(allPasses, allAttempts);
  const oband = bandFor(overall);

  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Report Preview" right="PDF" />
      <div className="flex-1 overflow-auto bg-white p-4 text-sm">
        <div className="text-center">
          <div className="text-lg font-extrabold text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-400">{r.company} · Weekly summary</div>
        </div>

        <div className="mt-3 rounded-xl p-3 text-center" style={{ background: oband.color, color: oband.text }}>
          <div className="text-3xl font-black">{overall}%</div>
          <div className="text-xs font-semibold uppercase tracking-wide">{oband.label}</div>
          <div className="text-[10px] opacity-90">Weekly min {THRESHOLDS.weekly}% · {overall >= THRESHOLDS.weekly ? "meets standard" : "below standard"}</div>
        </div>

        {/* per-event, with side breakdown + combined */}
        <div className="mt-4 space-y-3">
          {Object.entries(groups).map(([event, rows]) => {
            const hasSides = rows.some((x) => x.side);
            const cp = rows.reduce((a, x) => a + x.passes, 0);
            const ca = rows.reduce((a, x) => a + x.attempts, 0);
            const cv = pct(cp, ca);
            const cb = bandFor(cv);
            const low = ca < 3;
            return (
              <div key={event} className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                  <span className="font-bold text-slate-700">
                    {event}
                    {low && <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">⚠ &lt;3 ATT</span>}
                  </span>
                  <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: cb.color, color: cb.text }}>
                    {cp}/{ca} · {cv}%
                  </span>
                </div>
                {hasSides && (
                  <div className="divide-y divide-slate-100">
                    {rows.map((x) => {
                      const v = pct(x.passes, x.attempts);
                      const b = bandFor(v);
                      return (
                        <div key={x.side} className="flex items-center justify-between px-3 py-1.5 text-xs">
                          <span className="text-slate-500">↳ {x.side} side</span>
                          <span className="rounded px-2 py-0.5 font-bold" style={{ background: b.color, color: b.text }}>{x.passes}/{x.attempts} · {v}%</span>
                        </div>
                      );
                    })}
                    <div className="px-3 py-1 text-right text-[10px] text-slate-400">combined shown above ↑</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          ⚠ Alert: <b>Forcible Entry</b> has &lt; 3 attempts this week — captain notified.
        </div>

        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="mb-1 text-[11px] font-bold uppercase text-slate-500">Legend</div>
          {Object.entries(LEGEND).map(([k, v]) => (
            <div key={k} className="text-[11px] text-slate-500">
              <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: k === "pass" ? "#16a34a" : k === "fail" ? "#dc2626" : "#f59e0b" }} />
              {v}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* --------------------------- FLOW ORCHESTRATION ---------------------------- */

const GRADER_FLOW = ["pin", "topic", "setup", "company", "chart", "grade", "swap"];

export default function GradingSystemMockup() {
  const [view, setView] = useState("pin");
  const [sides, setSides] = useState({}); // session-locked side per event, e.g. { e2: "Engineer" }
  const flowIndex = GRADER_FLOW.indexOf(view);
  const go = (v) => setView(v);
  const next = () => { const i = GRADER_FLOW.indexOf(view); if (i >= 0 && i < GRADER_FLOW.length - 1) setView(GRADER_FLOW[i + 1]); };
  const back = () => { const i = GRADER_FLOW.indexOf(view); if (i > 0) setView(GRADER_FLOW[i - 1]); };

  const screen = () => {
    switch (view) {
      case "pin": return <PinScreen onNext={next} />;
      case "topic": return <TopicScreen onBack={back} onNext={next} />;
      case "setup": return <SetupScreen onBack={back} onNext={next} sides={sides} setSides={setSides} />;
      case "company": return <CompanyScreen onBack={back} onNext={next} />;
      case "chart": return <ChartScreen onBack={back} onNext={next} sides={sides} />;
      case "grade": return <GradeScreen onBack={back} onNext={next} />;
      case "swap": return <RoundEndScreen onBack={back} onNext={() => setView("chart")} />;
      case "admin": return <AdminScreen onBack={() => setView("pin")} />;
      case "report": return <ReportScreen onBack={() => setView("pin")} />;
      default: return null;
    }
  };

  const flowTitle = flowIndex >= 0 ? `Grader Flow · ${flowIndex + 1} of ${GRADER_FLOW.length}` : view === "admin" ? "Admin / Config" : "Daily Report";

  return (
    <div className="min-h-screen bg-slate-200 p-4 font-sans">
      <div className="mx-auto mb-6 max-w-3xl text-center">
        <h1 className="text-xl font-black text-slate-800">Grading System — UI/UX Outline</h1>
        <p className="text-xs text-slate-500">Clickable prototype · mocked data · reflects Phase 0 decisions. Use the tabs to jump between the grader flow, admin config, and a sample report.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {[["pin", "▶ Grader Flow"], ["admin", "⚙ Admin / Config"], ["report", "📄 Sample Report"]].map(([v, label]) => (
            <button key={v} onClick={() => go(v)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${(v === "pin" && flowIndex >= 0) || v === view ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <Phone title={flowTitle}>{screen()}</Phone>

      {flowIndex >= 0 && (
        <div className="mx-auto mt-4 flex max-w-sm justify-center gap-1">
          {GRADER_FLOW.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= flowIndex ? "bg-slate-900" : "bg-slate-300"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
