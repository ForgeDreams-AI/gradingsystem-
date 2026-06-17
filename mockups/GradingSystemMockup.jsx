/**
 * GradingSystemMockup.jsx
 * -----------------------------------------------------------------------------
 * CLICKABLE UI/UX OUTLINE (prototype only — no backend, all data is mocked)
 *
 * Purpose: lock the look & flow before any real build. Reflects the Phase 0
 * decisions:
 *   - Zero-budget test stack (GitHub Pages frontend + Google Apps Script later)
 *   - PIN-per-grader login
 *   - Variable N events per topic; each event is "individual" or "paired"
 *   - Tap-to-fill chart roster (column per event; names move from pool to slot;
 *     swappable anytime; cross-company allowed)
 *   - Pass / Fail / Memo outcomes (Fail & Memo reveal selectable reasons + note)
 *   - Immutable attempts (each grade locks; re-grade = new attempt row)
 *   - Score = passes / total attempts PER EVENT; Memo counts as Fail
 *   - Admin-configurable color bands + daily/weekly minimum % thresholds
 *   - Editable legend (Pass/Fail/Memo) printed on every report
 *   - Reports: person=self, captain=per company, higher-up=all; HTML + PDF
 *   - Alert to captain when a recruit has < 3 attempts on any event in the week
 *
 * Tailwind utility classes are used for styling (matches the planned stack).
 * Drop into a React + Tailwind sandbox to view. Single default export.
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
  { id: "t1", name: "Ladder Ops" },
  { id: "t2", name: "Hose Advancement" },
];

const EVENTS = {
  t1: [
    { id: "e1", name: "Throw 24' Ladder", mode: "individual" },
    { id: "e2", name: "Two-Person Raise", mode: "paired" },
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
  "Improper footing",
  "Unsafe lift",
  "Out of sequence",
  "Time exceeded",
  "PPE not donned",
];

/* recruit weekly report sample (passes/attempts per event) */
const REPORT_RECRUIT = {
  name: "A. Carter",
  company: "Engine 1",
  events: [
    { name: "Throw 24' Ladder", passes: 7, attempts: 9 },
    { name: "Two-Person Raise", passes: 10, attempts: 15 },
    { name: "Hose Advancement", passes: 3, attempts: 4 },
    { name: "Forcible Entry", passes: 1, attempts: 2 }, // < 3 attempts -> alert
  ],
};

/* ------------------------------- HELPERS ----------------------------------- */

const pct = (p, a) => (a === 0 ? 0 : Math.round((p / a) * 100));

const bandFor = (value) =>
  COLOR_BANDS.find((b) => value >= b.min) || COLOR_BANDS[COLOR_BANDS.length - 1];

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
      } ${active ? "ring-4 ring-offset-1 ring-slate-900/40" : ""} ${
        disabled ? "opacity-40" : ""
      }`}
    >
      {children}
    </button>
  );
}

function Pill({ children, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={active && color ? { backgroundColor: color, color: "#fff" } : {}}
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
            <div
              key={i}
              className={`h-4 w-4 rounded-full ${pin.length > i ? "bg-slate-900" : "bg-slate-300"}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button
              key={d}
              onClick={() => press(String(d))}
              className="h-16 w-16 rounded-full bg-white text-2xl font-bold text-slate-800 shadow active:scale-95"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => press("0")}
            className="h-16 w-16 rounded-full bg-white text-2xl font-bold text-slate-800 shadow active:scale-95"
          >
            0
          </button>
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="h-16 w-16 rounded-full text-sm font-semibold text-slate-500"
          >
            ⌫
          </button>
        </div>
        <div className="w-full px-2">
          <BigButton color="green" onClick={onNext} disabled={pin.length < 4}>
            Sign In
          </BigButton>
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
          <BigButton key={t.id} color="ghost" onClick={onNext}>
            {t.name}
          </BigButton>
        ))}
      </div>
    </>
  );
}

function CompanyScreen({ onBack, onNext }) {
  const [sel, setSel] = useState(["c1"]);
  const toggle = (id) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Pick Companies" />
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-3 text-xs text-slate-400">
          Step 2 of 3 · Multi-select. Rosters combine into one chart.
        </p>
        <div className="space-y-3">
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left ${
                sel.includes(c.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
              }`}
            >
              <div>
                <div className="font-bold">{c.name}</div>
                <div className={`text-xs ${sel.includes(c.id) ? "text-slate-300" : "text-slate-400"}`}>
                  {c.captain}
                </div>
              </div>
              <div className="text-xl">{sel.includes(c.id) ? "✓" : "+"}</div>
            </button>
          ))}
        </div>
        <div className="mt-auto pt-4">
          <BigButton color="green" onClick={onNext} disabled={sel.length === 0}>
            Build Roster ({sel.length})
          </BigButton>
        </div>
      </div>
    </>
  );
}

/* The signature tap-to-fill CHART screen */
function ChartScreen({ onBack, onNext }) {
  const events = EVENTS.t1;
  const [slots, setSlots] = useState({ e1: null, e2: null });
  const [activeEvent, setActiveEvent] = useState("e1");

  const placed = Object.values(slots).filter(Boolean);
  const pool = ROSTER.filter((p) => !placed.includes(p.id));

  const tapPerson = (pid) => {
    setSlots((s) => {
      // if person already placed somewhere, remove first (swap support)
      const cleared = Object.fromEntries(
        Object.entries(s).map(([k, v]) => [k, v === pid ? null : v])
      );
      return { ...cleared, [activeEvent]: pid };
    });
  };

  const clearSlot = (eid) => setSlots((s) => ({ ...s, [eid]: null }));
  const nameOf = (pid) => ROSTER.find((p) => p.id === pid)?.name;
  const compOf = (pid) => COMPANIES.find((c) => c.id === ROSTER.find((p) => p.id === pid)?.companyId)?.name;
  const ready = slots.e1 && slots.e2;

  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Build Group" right="Grp 1/4" />
      <div className="flex flex-1 flex-col overflow-hidden p-3">
        <p className="mb-2 text-[11px] text-slate-400">
          Step 3 · Tap a column, then tap a recruit to drop them in. Tap a filled slot to swap.
        </p>

        {/* chart header: one column per event */}
        <div className="grid grid-cols-2 gap-2">
          {events.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setActiveEvent(ev.id)}
              className={`rounded-xl border-2 p-2 text-center ${
                activeEvent === ev.id ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white"
              }`}
            >
              <div className="text-xs font-bold text-slate-800">{ev.name}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{ev.mode}</div>
            </button>
          ))}
        </div>

        {/* slots */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          {events.map((ev) => (
            <div
              key={ev.id}
              className={`flex h-20 items-center justify-center rounded-xl border-2 border-dashed p-2 text-center ${
                slots[ev.id] ? "border-green-500 bg-green-50" : "border-slate-300 bg-white"
              }`}
            >
              {slots[ev.id] ? (
                <button onClick={() => clearSlot(ev.id)} className="leading-tight">
                  <div className="font-bold text-slate-800">{nameOf(slots[ev.id])}</div>
                  <div className="text-[10px] text-slate-400">{compOf(slots[ev.id])}</div>
                  <div className="text-[10px] text-red-500">tap to remove</div>
                </button>
              ) : (
                <span className="text-xs text-slate-400">empty</span>
              )}
            </div>
          ))}
        </div>

        {/* unselected pool */}
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Unselected ({pool.length})
        </div>
        <div className="mt-1 flex flex-1 flex-wrap content-start gap-2 overflow-auto rounded-xl bg-slate-100 p-2">
          {pool.map((p) => (
            <button
              key={p.id}
              onClick={() => tapPerson(p.id)}
              className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm active:scale-95"
            >
              {p.name}
              <span className="ml-1 text-[10px] text-slate-400">
                {COMPANIES.find((c) => c.id === p.companyId)?.name.replace("Engine ", "E")}
              </span>
            </button>
          ))}
          {pool.length === 0 && <span className="p-2 text-xs text-slate-400">All placed.</span>}
        </div>

        <div className="pt-3">
          <BigButton color="green" onClick={onNext} disabled={!ready}>
            Start Grading Group →
          </BigButton>
        </div>
      </div>
    </>
  );
}

function GradeScreen({ onBack, onNext }) {
  const people = [
    { id: "p1", name: "A. Carter", event: "Throw 24' Ladder" },
    { id: "p4", name: "D. Patel", event: "Two-Person Raise" },
  ];
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState({});
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasons, setReasons] = useState([]);
  const [note, setNote] = useState("");

  const current = people[idx];
  const setOutcome = (outcome) => {
    setResults((r) => ({ ...r, [current.id]: { outcome, reasons: [], note: "" } }));
    if (outcome === "pass") {
      advance();
    } else {
      setReasonOpen(true);
      setReasons([]);
      setNote("");
    }
  };
  const confirmReasons = () => {
    setResults((r) => ({ ...r, [current.id]: { ...r[current.id], reasons, note } }));
    setReasonOpen(false);
    advance();
  };
  const advance = () => {
    if (idx < people.length - 1) setIdx(idx + 1);
  };
  const bothDone = people.every((p) => results[p.id]);
  const toggleReason = (r) =>
    setReasons((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));

  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Grade · Group 1" right="1/4" />
      <div className="flex flex-1 flex-col p-4">
        {/* progress chips for the two people */}
        <div className="mb-4 flex gap-2">
          {people.map((p, i) => {
            const o = results[p.id]?.outcome;
            const c =
              o === "pass" ? "bg-green-600" : o === "fail" ? "bg-red-600" : o === "memo" ? "bg-amber-500" : "bg-slate-300";
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
            <div className="text-sm font-bold text-slate-800">
              Select reason(s) — {results[current.id]?.outcome.toUpperCase()}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLE_REASONS.map((r) => (
                <Pill key={r} active={reasons.includes(r)} onClick={() => toggleReason(r)}>
                  {r}
                </Pill>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note / memo detail…"
              className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-sm"
              rows={3}
            />
            <div className="mt-auto">
              <BigButton color="slate" onClick={confirmReasons} disabled={reasons.length === 0}>
                Save Reason(s)
              </BigButton>
            </div>
          </>
        )}

        {bothDone && !reasonOpen && (
          <div className="mt-auto pt-4">
            <BigButton color="green" onClick={onNext}>
              Submit Group ✓
            </BigButton>
          </div>
        )}
      </div>
    </>
  );
}

function SwapBarScreen({ onBack, onNext }) {
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Between Groups" right="2/4" />
      <div className="flex flex-1 flex-col p-4">
        <div className="rounded-2xl bg-green-50 border-2 border-green-200 p-4 text-center">
          <div className="text-3xl">✓</div>
          <div className="font-bold text-slate-800">Group 1 saved</div>
          <div className="text-xs text-slate-500">2 immutable attempt rows written.</div>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Control bar
        </div>
        <div className="mt-2 space-y-3">
          <BigButton color="ghost" onClick={() => {}}>
            ⇄ Swap a Company
          </BigButton>
          <p className="px-1 text-[11px] text-slate-400">
            Saved results stay untouched. The swapped company's recruits are cleared from
            not-yet-graded slots so you can refill from the new roster.
          </p>
          <BigButton color="green" onClick={onNext}>
            Next: Group 2 of 4 →
          </BigButton>
        </div>

        <div className="mt-auto">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/4 bg-slate-900" />
          </div>
          <div className="mt-1 text-center text-xs text-slate-400">Group 1 of 4 complete</div>
        </div>
      </div>
    </>
  );
}

function AdminScreen({ onBack }) {
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Admin · Config" />
      <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
        <p className="text-xs text-slate-400">Everything below is data-driven & editable in-app.</p>

        <Section title="Color Bands & Thresholds">
          {COLOR_BANDS.map((b, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-white p-2 shadow-sm">
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded" style={{ background: b.color }} />
                {b.label}
              </span>
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
            <div key={k} className="rounded-lg bg-white p-2 text-xs shadow-sm">
              <span className="font-bold uppercase">{k}: </span>
              {v}
            </div>
          ))}
        </Section>

        <Section title="Other editable entities">
          <div className="flex flex-wrap gap-2">
            {["Companies", "Captains", "Higher-ups", "Recruits", "Topics", "Events", "Fail reasons", "Grader PINs", "Report time / TZ"].map(
              (x) => (
                <span key={x} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-white">
                  {x}
                </span>
              )
            )}
          </div>
        </Section>
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

function ReportScreen({ onBack }) {
  const r = REPORT_RECRUIT;
  const overallPasses = r.events.reduce((a, e) => a + e.passes, 0);
  const overallAttempts = r.events.reduce((a, e) => a + e.attempts, 0);
  const overall = pct(overallPasses, overallAttempts);
  const band = bandFor(overall);
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Report Preview" right="PDF" />
      <div className="flex-1 overflow-auto bg-white p-4 text-sm">
        <div className="text-center">
          <div className="text-lg font-extrabold text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-400">{r.company} · Weekly summary</div>
        </div>

        <div
          className="mt-3 rounded-xl p-3 text-center"
          style={{ background: band.color, color: band.text }}
        >
          <div className="text-3xl font-black">{overall}%</div>
          <div className="text-xs font-semibold uppercase tracking-wide">{band.label}</div>
          <div className="text-[10px] opacity-90">
            Weekly min {THRESHOLDS.weekly}% · {overall >= THRESHOLDS.weekly ? "meets standard" : "below standard"}
          </div>
        </div>

        <table className="mt-4 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400">
              <th className="py-1">Event</th>
              <th className="py-1 text-center">P / A</th>
              <th className="py-1 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {r.events.map((e) => {
              const v = pct(e.passes, e.attempts);
              const b = bandFor(v);
              const lowAttempts = e.attempts < 3;
              return (
                <tr key={e.name} className="border-b border-slate-100">
                  <td className="py-2 font-semibold text-slate-700">
                    {e.name}
                    {lowAttempts && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">
                        ⚠ &lt;3 ATT
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-center font-mono">
                    {e.passes}/{e.attempts}
                  </td>
                  <td className="py-2 text-right">
                    <span
                      className="rounded px-2 py-0.5 font-bold"
                      style={{ background: b.color, color: b.text }}
                    >
                      {v}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          ⚠ Alert: <b>Forcible Entry</b> has &lt; 3 attempts this week — captain notified.
        </div>

        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="mb-1 text-[11px] font-bold uppercase text-slate-500">Legend</div>
          {Object.entries(LEGEND).map(([k, v]) => (
            <div key={k} className="text-[11px] text-slate-500">
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{
                  background: k === "pass" ? "#16a34a" : k === "fail" ? "#dc2626" : "#f59e0b",
                }}
              />
              {v}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* --------------------------- FLOW ORCHESTRATION ---------------------------- */

const GRADER_FLOW = ["pin", "topic", "company", "chart", "grade", "swap"];

export default function GradingSystemMockup() {
  const [view, setView] = useState("pin"); // grader flow + 'admin' + 'report'

  const flowIndex = GRADER_FLOW.indexOf(view);
  const go = (v) => setView(v);
  const next = () => {
    const i = GRADER_FLOW.indexOf(view);
    if (i >= 0 && i < GRADER_FLOW.length - 1) setView(GRADER_FLOW[i + 1]);
  };
  const back = () => {
    const i = GRADER_FLOW.indexOf(view);
    if (i > 0) setView(GRADER_FLOW[i - 1]);
  };

  const screen = () => {
    switch (view) {
      case "pin":
        return <PinScreen onNext={next} />;
      case "topic":
        return <TopicScreen onBack={back} onNext={next} />;
      case "company":
        return <CompanyScreen onBack={back} onNext={next} />;
      case "chart":
        return <ChartScreen onBack={back} onNext={next} />;
      case "grade":
        return <GradeScreen onBack={back} onNext={next} />;
      case "swap":
        return <SwapBarScreen onBack={back} onNext={() => setView("chart")} />;
      case "admin":
        return <AdminScreen onBack={() => setView("pin")} />;
      case "report":
        return <ReportScreen onBack={() => setView("pin")} />;
      default:
        return null;
    }
  };

  const flowTitle =
    flowIndex >= 0 ? `Grader Flow · ${flowIndex + 1} of ${GRADER_FLOW.length}` : view === "admin" ? "Admin / Config" : "Daily Report";

  return (
    <div className="min-h-screen bg-slate-200 p-4 font-sans">
      <div className="mx-auto mb-6 max-w-3xl text-center">
        <h1 className="text-xl font-black text-slate-800">Grading System — UI/UX Outline</h1>
        <p className="text-xs text-slate-500">
          Clickable prototype · mocked data · reflects Phase 0 decisions. Use the tabs to jump
          between the grader flow, admin config, and a sample report.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {[
            ["pin", "▶ Grader Flow"],
            ["admin", "⚙ Admin / Config"],
            ["report", "📄 Sample Report"],
          ].map(([v, label]) => (
            <button
              key={v}
              onClick={() => go(v)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                (v === "pin" && flowIndex >= 0) || v === view
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Phone title={flowTitle}>{screen()}</Phone>

      {flowIndex >= 0 && (
        <div className="mx-auto mt-4 flex max-w-sm justify-center gap-1">
          {GRADER_FLOW.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= flowIndex ? "bg-slate-900" : "bg-slate-300"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
