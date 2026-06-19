/**
 * app.jsx — THE REAL GRADER APP (wired to the Apps Script backend)
 * =============================================================================
 * This is the actual field app graders use. Unlike the prototype in /mockups,
 * it talks to your Google Sheet backend, saves real immutable results, and keeps
 * working when the iPad loses signal (offline queue with safe retry).
 *
 * HOW IT'S DEPLOYED: this file is bundled (with React) into /frontend/dist/app.js
 * by build.sh — there is NO build step for the end user. They just host the
 * /frontend/dist folder (e.g. GitHub Pages) and open index.html.
 *
 * FIRST RUN: the app asks for the backend /exec URL once and remembers it.
 *
 * Read top-to-bottom: storage → api → offline queue → UI atoms → screens → App.
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

/* ============================ tiny storage helper ========================== */
/* Everything we cache lives in localStorage so the app survives reloads and
   works offline. */
const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  del(key) { localStorage.removeItem(key); },
};

const KEYS = {
  apiBase: "gs_apiBase",
  grader: "gs_grader",
  config: "gs_config",
  queue: "gs_pendingSubmits",
};

/* A unique id, used for client_submit_id (makes saves idempotent) + session ids. */
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxxyxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  }) + Date.now().toString(16);
}

/* ================================ API layer =============================== */
/* The backend can't answer CORS preflight, so POSTs use a "simple" request
   (text/plain body) to avoid it. GETs are plain. */

function apiBase() { return LS.get(KEYS.apiBase, ""); }

async function apiGet(params) {
  const qs = Object.keys(params).map((k) => k + "=" + encodeURIComponent(params[k])).join("&");
  const res = await fetch(apiBase() + "?" + qs, { method: "GET" });
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(apiBase(), {
    method: "POST",
    // NOTE: no custom Content-Type header on purpose (keeps it preflight-free).
    body: JSON.stringify(body),
  });
  return res.json();
}

/* ============================== offline queue ============================= */
/* Every grade submission is appended here first, then sent. If sending fails
   (no signal), it stays queued and we retry later. The server de-dupes on
   client_submit_id, so retrying the same item never double-saves. */

function getQueue() { return LS.get(KEYS.queue, []); }
function setQueue(q) { LS.set(KEYS.queue, q); }

function enqueueSubmit(body) {
  const q = getQueue();
  q.push(body);
  setQueue(q);
}

/* Try to send everything queued. Returns the new pending count. */
async function flushQueue() {
  let q = getQueue();
  if (!q.length) return 0;
  const remaining = [];
  for (const item of q) {
    try {
      const r = await apiPost(item);
      if (!(r && r.ok)) remaining.push(item); // server said no — keep it to retry
    } catch (e) {
      remaining.push(item); // network failed — keep it
    }
  }
  setQueue(remaining);
  return remaining.length;
}

/* =============================== UI atoms ================================= */

function BigButton({ children, onClick, color = "slate", disabled }) {
  const palette = {
    slate: "bg-slate-800 text-white",
    green: "bg-green-600 text-white",
    red: "bg-red-600 text-white",
    amber: "bg-amber-500 text-slate-900",
    ghost: "bg-white text-slate-800 border-2 border-slate-300",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full rounded-2xl px-4 py-4 text-base font-bold tracking-wide transition active:scale-[0.98] ${palette[color]} ${disabled ? "opacity-40" : ""}`}>
      {children}
    </button>
  );
}

function TopBar({ left, center, right }) {
  return (
    <div className="flex items-center justify-between bg-slate-900 px-3 py-3 text-white">
      <div className="w-20 text-sm">{left}</div>
      <div className="flex-1 truncate text-center text-sm font-semibold">{center}</div>
      <div className="w-20 text-right text-sm">{right}</div>
    </div>
  );
}

/* Always-visible strip: who's logged in, online/offline, and pending count. */
function StatusStrip({ grader, online, pending, onLogout }) {
  return (
    <div className="flex items-center justify-between bg-slate-100 px-3 py-1.5 text-[11px] text-slate-600">
      <span className="font-semibold">{grader ? grader.name : "—"}</span>
      <span className="flex items-center gap-3">
        {pending > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">⏳ {pending} to sync</span>}
        <span className={`flex items-center gap-1 font-bold ${online ? "text-green-600" : "text-red-500"}`}>
          <span className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-red-500"}`} />
          {online ? "online" : "offline"}
        </span>
        {grader && <button onClick={onLogout} className="text-slate-400 underline">sign out</button>}
      </span>
    </div>
  );
}

function Spinner({ label }) {
  return <div className="p-6 text-center text-sm text-slate-400">{label || "Loading…"}</div>;
}

/* =============================== screens ================================= */

/* First-run: paste the backend URL once. */
function SetupUrlScreen({ onSaved }) {
  const [url, setUrl] = useState(apiBase());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true); setErr("");
    LS.set(KEYS.apiBase, url.trim());
    try {
      const r = await apiGet({ action: "ping" });
      if (r && r.ok) onSaved();
      else setErr("Got a response, but not the expected one. Double-check the URL.");
    } catch (e) {
      setErr("Couldn't reach it. Make sure it's the Web app /exec URL and it's deployed to 'Anyone'.");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-5">
      <h1 className="text-lg font-bold text-slate-800">Connect to your backend</h1>
      <p className="mt-1 text-xs text-slate-500">Paste the Apps Script <b>Web app URL</b> (ends in <code>/exec</code>). You only do this once.</p>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec"
        className="mt-4 w-full rounded-xl border border-slate-300 p-3 text-sm" />
      {err && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">{err}</div>}
      <div className="mt-4"><BigButton color="green" onClick={test} disabled={!url.trim() || busy}>{busy ? "Testing…" : "Connect"}</BigButton></div>
    </div>
  );
}

/* PIN login (checks against the Sheet via the backend). */
function LoginScreen({ onLogin }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const press = (d) => { setErr(""); setPin((p) => (p.length < 8 ? p + d : p)); };

  async function submit() {
    setBusy(true); setErr("");
    try {
      const r = await apiPost({ action: "login", pin });
      if (r && r.ok) onLogin(r.grader);
      else setErr(r && r.error ? r.error : "Invalid PIN");
    } catch (e) {
      setErr("Can't reach the server. Check your connection.");
    } finally { setBusy(false); setPin(""); }
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <div className="text-lg font-bold text-slate-800">Enter your PIN</div>
        <div className="text-xs text-slate-400">Graders only</div>
      </div>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`h-4 w-4 rounded-full ${pin.length > i ? "bg-slate-900" : "bg-slate-300"}`} />)}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} onClick={() => press(String(d))} className="h-16 w-16 rounded-full bg-white text-2xl font-bold text-slate-800 shadow active:scale-95">{d}</button>
        ))}
        <div />
        <button onClick={() => press("0")} className="h-16 w-16 rounded-full bg-white text-2xl font-bold text-slate-800 shadow active:scale-95">0</button>
        <button onClick={() => setPin((p) => p.slice(0, -1))} className="h-16 w-16 rounded-full text-sm font-semibold text-slate-500">⌫</button>
      </div>
      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</div>}
      <div className="w-full px-2"><BigButton color="green" onClick={submit} disabled={pin.length < 1 || busy}>{busy ? "Checking…" : "Sign In"}</BigButton></div>
    </div>
  );
}

/* Pick a topic. */
function TopicScreen({ config, onBack, onPick }) {
  const topics = (config.topics || []);
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Pick Topic" />
      <div className="space-y-3 p-4">
        <p className="text-xs text-slate-400">Choose what you're grading.</p>
        {topics.length === 0 && <p className="text-sm text-slate-400">No topics set up yet. Add some in the Sheet.</p>}
        {topics.map((t) => <BigButton key={t.topic_id} color="ghost" onClick={() => onPick(t)}>{t.name}</BigButton>)}
      </div>
    </>
  );
}

/* Lock each event's side for the whole session. */
function SessionSetupScreen({ config, topic, onBack, onNext }) {
  const events = eventsForTopic(config, topic.topic_id);
  const [sides, setSides] = useState({});
  const ready = events.every((ev) => !isYes(ev.side_required) || sides[ev.event_id]);
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Session Setup" />
      <div className="flex h-full flex-col p-4">
        <p className="mb-3 text-xs text-slate-400">Lock this session's sides. Stays fixed until the session ends.</p>
        <div className="space-y-3">
          {events.map((ev) => {
            const opts = sidesForEvent(config, ev.event_id);
            return (
              <div key={ev.event_id} className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                <div className="font-bold text-slate-800">{ev.name}</div>
                {!isYes(ev.side_required) ? (
                  <div className="text-xs text-slate-400">No side — graded as-is.</div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {opts.map((s) => (
                      <button key={s.side_id} onClick={() => setSides((p) => ({ ...p, [ev.event_id]: s.side_id }))}
                        className={`rounded-xl px-3 py-3 text-sm font-bold ${sides[ev.event_id] === s.side_id ? "bg-slate-900 text-white" : "border-2 border-slate-300 bg-white text-slate-700"}`}>
                        {s.name} side
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-auto pt-4">
          <div className="mb-2 rounded-lg bg-amber-50 p-2 text-center text-[11px] text-amber-700">🔒 Locked once you continue.</div>
          <BigButton color="green" onClick={() => onNext(sides)} disabled={!ready}>Lock &amp; Pick Companies →</BigButton>
        </div>
      </div>
    </>
  );
}

/* Multi-select companies. */
function CompanyScreen({ config, onBack, onNext }) {
  const companies = (config.companies || []);
  const [sel, setSel] = useState([]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Pick Companies" />
      <div className="flex h-full flex-col p-4">
        <p className="mb-3 text-xs text-slate-400">Multi-select. Rosters combine into one chart.</p>
        <div className="space-y-3 overflow-auto">
          {companies.map((c) => (
            <button key={c.company_id} onClick={() => toggle(c.company_id)}
              className={`flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left ${sel.includes(c.company_id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
              <span className="font-bold">{c.name}</span>
              <span className="text-xl">{sel.includes(c.company_id) ? "✓" : "+"}</span>
            </button>
          ))}
        </div>
        <div className="mt-auto pt-4"><BigButton color="green" onClick={() => onNext(sel)} disabled={sel.length === 0}>Build Roster ({sel.length}) →</BigButton></div>
      </div>
    </>
  );
}

/* Tap-to-fill chart: one column per event, one recruit each. ✕ to remove. */
function ChartScreen({ config, topic, sides, companyIds, gradedIds, onBack, onStart, onFinishRound, groupNumber }) {
  const events = eventsForTopic(config, topic.topic_id);
  const [slots, setSlots] = useState({}); // event_id -> recruit_id
  const [active, setActive] = useState(events[0] ? events[0].event_id : null);

  const roster = rosterFor(config, companyIds).filter((r) => !gradedIds.includes(r.recruit_id));
  const placed = Object.values(slots).filter(Boolean);
  const pool = roster.filter((r) => !placed.includes(r.recruit_id));
  const ready = events.length > 0 && events.every((ev) => slots[ev.event_id]);

  const place = (rid) => setSlots((s) => {
    const cleared = {};
    Object.keys(s).forEach((k) => { cleared[k] = s[k] === rid ? null : s[k]; });
    return { ...cleared, [active]: rid };
  });
  const remove = (eid) => setSlots((s) => ({ ...s, [eid]: null }));

  const recruit = (rid) => config.recruits.find((r) => r.recruit_id === rid) || {};
  const companyName = (rid) => {
    const r = recruit(rid);
    const c = (config.companies || []).find((x) => x.company_id === r.company_id);
    return c ? c.name : "";
  };

  function start() {
    const group = events.map((ev) => ({
      recruit_id: slots[ev.event_id],
      event_id: ev.event_id,
      side_id: sides[ev.event_id] || "",
      company_id: recruit(slots[ev.event_id]).company_id || "",
    }));
    onStart(group);
  }

  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center="Build Group" right={"Grp " + groupNumber} />
      <div className="flex h-full flex-col overflow-hidden p-3">
        <p className="mb-2 text-[11px] text-slate-400">Tap a column, then a recruit. ✕ to remove/swap.</p>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(events.length, 1)}, minmax(0, 1fr))` }}>
          {events.map((ev) => (
            <button key={ev.event_id} onClick={() => setActive(ev.event_id)}
              className={`rounded-xl border-2 p-2 text-center ${active === ev.event_id ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white"}`}>
              <div className="text-xs font-bold text-slate-800">{ev.name}</div>
              {sides[ev.event_id]
                ? <div className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-white">🔒 {sideName(config, sides[ev.event_id])}</div>
                : <div className="text-[10px] uppercase tracking-wide text-slate-400">no side</div>}
            </button>
          ))}
        </div>

        <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(events.length, 1)}, minmax(0, 1fr))` }}>
          {events.map((ev) => (
            <div key={ev.event_id} className={`relative flex h-24 items-center justify-center rounded-xl border-2 border-dashed p-2 text-center ${slots[ev.event_id] ? "border-green-500 bg-green-50" : "border-slate-300 bg-white"}`}>
              {slots[ev.event_id] ? (
                <>
                  <button onClick={() => remove(ev.event_id)} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow">✕</button>
                  <button onClick={() => remove(ev.event_id)} className="leading-tight">
                    <div className="text-sm font-bold text-slate-800">{fullName(recruit(slots[ev.event_id]))}</div>
                    <div className="text-[10px] text-slate-400">{companyName(slots[ev.event_id])}</div>
                  </button>
                </>
              ) : <span className="text-xs text-slate-400">empty</span>}
            </div>
          ))}
        </div>

        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Unselected ({pool.length})</div>
        <div className="mt-1 flex flex-1 flex-wrap content-start gap-2 overflow-auto rounded-xl bg-slate-100 p-2">
          {pool.map((r) => (
            <button key={r.recruit_id} onClick={() => place(r.recruit_id)} className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm active:scale-95">{fullName(r)}</button>
          ))}
          {pool.length === 0 && <span className="p-2 text-xs text-slate-400">No more recruits to place.</span>}
        </div>

        <div className="space-y-2 pt-3">
          <BigButton color="green" onClick={start} disabled={!ready}>Start Grading Group →</BigButton>
          <button onClick={onFinishRound} className="w-full py-2 text-xs font-semibold text-slate-500">Finish round →</button>
        </div>
      </div>
    </>
  );
}

/* Grade one group, column by column, then hand results back to submit. */
function GradeScreen({ config, group, groupNumber, onBack, onSubmit, busy }) {
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState({}); // key event_id -> {result, reasons:[], note}
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasons, setReasons] = useState([]);
  const [note, setNote] = useState("");

  const col = group[idx];
  const recruit = config.recruits.find((r) => r.recruit_id === col.recruit_id) || {};
  const ev = (config.events || []).find((e) => e.event_id === col.event_id) || {};
  const keyOf = (c) => c.event_id;

  function setOutcome(outcome) {
    setResults((r) => ({ ...r, [keyOf(col)]: { result: outcome, reasons: [], note: "" } }));
    if (outcome === "pass") advance();
    else { setReasonOpen(true); setReasons([]); setNote(""); }
  }
  function confirmReasons() {
    setResults((r) => ({ ...r, [keyOf(col)]: { ...r[keyOf(col)], reasons, note } }));
    setReasonOpen(false); advance();
  }
  function advance() { if (idx < group.length - 1) setIdx(idx + 1); }
  const allDone = group.every((c) => results[keyOf(c)]);
  const toggleReason = (id) => setReasons((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const reasonOpts = reasonsForEvent(config, col.event_id);

  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center={"Grade · Group " + groupNumber} right={idx + 1 + "/" + group.length} />
      <div className="flex h-full flex-col p-4">
        <div className="mb-4 flex gap-2">
          {group.map((c, i) => {
            const o = results[keyOf(c)] && results[keyOf(c)].result;
            const bg = o === "pass" ? "bg-green-600" : o === "fail" ? "bg-red-600" : o === "memo" ? "bg-amber-500" : "bg-slate-300";
            return (
              <div key={i} className={`flex-1 rounded-lg p-2 text-center text-[11px] font-bold text-white ${bg} ${i === idx ? "ring-4 ring-slate-900/20" : ""}`}>
                {lastName(config.recruits.find((r) => r.recruit_id === c.recruit_id))}
                <div className="text-[9px] font-normal opacity-90">{o ? o.toUpperCase() : "…"}</div>
              </div>
            );
          })}
        </div>

        {!reasonOpen ? (
          <>
            <div className="rounded-2xl bg-white p-4 text-center shadow">
              <div className="text-xs uppercase tracking-wide text-slate-400">{ev.name}{col.side_id ? " · " + sideName(config, col.side_id) + " side" : ""}</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">{fullName(recruit)}</div>
            </div>
            <div className="mt-6 space-y-3">
              <BigButton color="green" onClick={() => setOutcome("pass")}>PASS</BigButton>
              <BigButton color="red" onClick={() => setOutcome("fail")}>FAIL</BigButton>
              <BigButton color="amber" onClick={() => setOutcome("memo")}>MEMO</BigButton>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-bold text-slate-800">Reason(s) — {results[keyOf(col)].result.toUpperCase()}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {reasonOpts.map((r) => (
                <button key={r.reason_id} onClick={() => toggleReason(r.reason_id)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold ${reasons.includes(r.reason_id) ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{r.label}</button>
              ))}
              {reasonOpts.length === 0 && <span className="text-xs text-slate-400">No preset reasons — use the note.</span>}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note / other reason (optional)…" rows={3}
              className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-sm" />
            <div className="mt-auto"><BigButton color="slate" onClick={confirmReasons}>Save Reason(s)</BigButton></div>
          </>
        )}

        {allDone && !reasonOpen && (
          <div className="mt-auto pt-4"><BigButton color="green" onClick={() => onSubmit(results)} disabled={busy}>{busy ? "Saving…" : "Submit Group ✓"}</BigButton></div>
        )}
      </div>
    </>
  );
}

/* After finishing a round: run again, swap roles, or end. */
function RoundEndScreen({ count, onSame, onSwap, onEnd }) {
  return (
    <>
      <TopBar center="Round Complete" />
      <div className="flex h-full flex-col p-4">
        <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4 text-center">
          <div className="text-3xl">✓</div>
          <div className="font-bold text-slate-800">{count} group(s) graded this round</div>
          <div className="text-xs text-slate-500">All saved.</div>
        </div>
        <div className="mt-4 space-y-3">
          <BigButton color="green" onClick={onSame} disabled={count === 0}>🔁 Run again — same roles</BigButton>
          <BigButton color="slate" onClick={onSwap} disabled={count === 0}>⇄ Run again — swap roles</BigButton>
          <BigButton color="ghost" onClick={onEnd}>■ End session</BigButton>
        </div>
        <div className="mt-auto rounded-lg bg-slate-100 p-2 text-center text-[11px] text-slate-500">Swap roles auto-flips who's on each event.</div>
      </div>
    </>
  );
}

/* ============================ data helpers =============================== */
function isYes(v) { const s = String(v).trim().toLowerCase(); return !(s === "no" || s === "false" || s === "n" || s === "0" || s === ""); }
function fullName(r) { return r ? ((r.first_name || "") + " " + (r.last_name || "")).trim() : ""; }
function lastName(r) { return r ? (r.last_name || r.first_name || "") : ""; }
function eventsForTopic(config, topicId) {
  return (config.events || [])
    .filter((e) => String(e.topic_id) === String(topicId))
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
}
function sidesForEvent(config, eventId) { return (config.eventSides || []).filter((s) => String(s.event_id) === String(eventId)); }
function sideName(config, sideId) { const s = (config.eventSides || []).find((x) => String(x.side_id) === String(sideId)); return s ? s.name : ""; }
function rosterFor(config, companyIds) {
  const set = {}; companyIds.forEach((c) => (set[String(c)] = true));
  return (config.recruits || []).filter((r) => set[String(r.company_id)]);
}
function reasonsForEvent(config, eventId) {
  return (config.failReasons || []).filter((r) => !r.event_id || String(r.event_id) === String(eventId));
}

/* ================================= App ================================== */

const PHASE = { LOADING: "loading", SETUP_URL: "setupUrl", LOGIN: "login", TOPIC: "topic", SESSION: "session", COMPANY: "company", CHART: "chart", GRADE: "grade", ROUNDEND: "roundend" };

function App() {
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [config, setConfig] = useState(LS.get(KEYS.config, null));
  const [grader, setGrader] = useState(LS.get(KEYS.grader, null));
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(getQueue().length);
  const [loadErr, setLoadErr] = useState("");

  // session-scoped state
  const [topic, setTopic] = useState(null);
  const [sides, setSides] = useState({});
  const [companyIds, setCompanyIds] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [gradedIds, setGradedIds] = useState([]);     // recruits already graded this round
  const [roundGroups, setRoundGroups] = useState([]); // groups submitted this round (for replay)
  const [currentGroup, setCurrentGroup] = useState(null);
  const [groupNumber, setGroupNumber] = useState(1);
  const [replayQueue, setReplayQueue] = useState(null); // groups to re-grade (same/swap)
  const [busy, setBusy] = useState(false);

  /* ---- boot: decide first screen, load config, start queue flushing ---- */
  useEffect(() => {
    if (!apiBase()) { setPhase(PHASE.SETUP_URL); return; }
    bootWithConfig();
    // online/offline + periodic queue flush
    const refresh = async () => { setOnline(navigator.onLine); if (navigator.onLine) setPending(await flushQueue()); };
    window.addEventListener("online", () => { setOnline(true); refresh(); });
    window.addEventListener("offline", () => setOnline(false));
    const iv = setInterval(refresh, 20000);
    refresh();
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, []);

  async function bootWithConfig() {
    // Show cached immediately (offline-friendly), then refresh in the background.
    if (config) setPhase(grader ? PHASE.TOPIC : PHASE.LOGIN);
    try {
      const r = await apiGet({ action: "config" });
      if (r && r.ok) { setConfig(r.config); LS.set(KEYS.config, r.config); if (!config) setPhase(grader ? PHASE.TOPIC : PHASE.LOGIN); }
      else if (!config) setLoadErr("Backend reachable but returned an error.");
    } catch (e) {
      if (!config) { setLoadErr("Can't reach the backend and there's no saved copy yet. Connect once online."); }
    }
  }

  function logout() { LS.del(KEYS.grader); setGrader(null); resetSession(); setPhase(PHASE.LOGIN); }
  function resetSession() { setTopic(null); setSides({}); setCompanyIds([]); setSessionId(null); setGradedIds([]); setRoundGroups([]); setCurrentGroup(null); setGroupNumber(1); setReplayQueue(null); }

  /* ---- flow handlers ---- */
  function handleLogin(g) { setGrader(g); LS.set(KEYS.grader, g); setPhase(PHASE.TOPIC); }
  function pickTopic(t) { setTopic(t); setPhase(PHASE.SESSION); }
  function lockSides(s) { setSides(s); setPhase(PHASE.COMPANY); }
  function pickCompanies(ids) {
    setCompanyIds(ids);
    const sid = uuid(); setSessionId(sid);
    // best-effort session start (audit only; safe to fail offline)
    apiPost({ action: "startSession", session_id: sid, grader_id: grader.grader_id, topic_id: topic.topic_id, company_ids: ids }).catch(() => {});
    setGradedIds([]); setRoundGroups([]); setGroupNumber(1);
    setPhase(PHASE.CHART);
  }
  function startGroup(group) { setCurrentGroup(group); setPhase(PHASE.GRADE); }

  /* Save a graded group: build items, queue + send. Always succeeds locally. */
  async function submitGroup(resultsByEvent) {
    setBusy(true);
    const items = currentGroup.map((col) => {
      const res = resultsByEvent[col.event_id];
      return {
        recruit_id: col.recruit_id, topic_id: topic.topic_id, event_id: col.event_id,
        side_id: col.side_id || "", company_id: col.company_id || "",
        result: res.result, note: res.note || "",
        reasons: (res.reasons || []).map((id) => ({ reason_id: id })),
      };
    });
    const body = { action: "submitGroup", session_id: sessionId, grader_id: grader.grader_id, client_submit_id: uuid(), items };

    enqueueSubmit(body);              // 1) never lose it
    setPending(getQueue().length);
    try { await flushQueue(); } catch (e) {}  // 2) try to send now
    setPending(getQueue().length);
    setBusy(false);

    // bookkeeping for this round
    if (replayQueue) {
      const rest = replayQueue.slice(1);
      if (rest.length) { setReplayQueue(rest); setCurrentGroup(rest[0]); setGroupNumber((n) => n + 1); }
      else { setReplayQueue(null); setPhase(PHASE.ROUNDEND); }
    } else {
      setRoundGroups((g) => [...g, currentGroup]);
      setGradedIds((ids) => [...ids, ...currentGroup.map((c) => c.recruit_id)]);
      setGroupNumber((n) => n + 1);
      setCurrentGroup(null);
      setPhase(PHASE.CHART);
    }
  }

  function finishRound() { setPhase(PHASE.ROUNDEND); }
  function runSame() { if (!roundGroups.length) return; setReplayQueue(roundGroups); setCurrentGroup(roundGroups[0]); setGroupNumber(1); setPhase(PHASE.GRADE); }
  function runSwap() {
    if (!roundGroups.length) return;
    const flipped = roundGroups.map((group) => {
      const recruits = group.map((c) => c.recruit_id).reverse(); // reverse who's on each column
      return group.map((col, i) => ({ ...col, recruit_id: recruits[i] }));
    });
    setReplayQueue(flipped); setCurrentGroup(flipped[0]); setGroupNumber(1); setPhase(PHASE.GRADE);
  }
  function endSession() {
    if (sessionId) apiPost({ action: "endSession", session_id: sessionId }).catch(() => {});
    resetSession(); setPhase(PHASE.TOPIC);
  }

  /* ---------------------------- render ---------------------------- */
  let body;
  if (phase === PHASE.LOADING) body = <Spinner label={loadErr || "Starting…"} />;
  else if (phase === PHASE.SETUP_URL) body = <SetupUrlScreen onSaved={() => { setLoadErr(""); setPhase(PHASE.LOADING); bootWithConfig(); }} />;
  else if (phase === PHASE.LOGIN) body = <LoginScreen onLogin={handleLogin} />;
  else if (!config) body = <Spinner label={loadErr || "Loading config…"} />;
  else if (phase === PHASE.TOPIC) body = <TopicScreen config={config} onBack={logout} onPick={pickTopic} />;
  else if (phase === PHASE.SESSION) body = <SessionSetupScreen config={config} topic={topic} onBack={() => setPhase(PHASE.TOPIC)} onNext={lockSides} />;
  else if (phase === PHASE.COMPANY) body = <CompanyScreen config={config} onBack={() => setPhase(PHASE.SESSION)} onNext={pickCompanies} />;
  else if (phase === PHASE.CHART) body = <ChartScreen config={config} topic={topic} sides={sides} companyIds={companyIds} gradedIds={gradedIds} groupNumber={groupNumber} onBack={() => setPhase(PHASE.COMPANY)} onStart={startGroup} onFinishRound={finishRound} />;
  else if (phase === PHASE.GRADE) body = <GradeScreen config={config} group={currentGroup} groupNumber={groupNumber} busy={busy} onBack={() => setPhase(replayQueue ? PHASE.ROUNDEND : PHASE.CHART)} onSubmit={submitGroup} />;
  else if (phase === PHASE.ROUNDEND) body = <RoundEndScreen count={roundGroups.length} onSame={runSame} onSwap={runSwap} onEnd={endSession} />;

  const showStatus = phase !== PHASE.SETUP_URL && phase !== PHASE.LOADING;

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-slate-50">
      {showStatus && <StatusStrip grader={grader} online={online} pending={pending} onLogout={logout} />}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
