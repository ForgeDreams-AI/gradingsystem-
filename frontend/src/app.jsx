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

/* All recruits in the chosen companies, sorted A–Z (the auto-pair order). */
function sortedRoster(config, companyIds) {
  return rosterFor(config, companyIds).slice().sort((a, b) =>
    (a.last_name || "").localeCompare(b.last_name || "") ||
    (a.first_name || "").localeCompare(b.first_name || "")
  ).map((r) => r.recruit_id);
}

/*
 * Multi-group builder. The grader assembles SEVERAL groups up front, then grades
 * them all. Slots start EMPTY — tap a column, tap a name to place. "Add group"
 * queues the current pair and clears the slots for the next. "Start grading"
 * then walks every queued group. Available list is auto-sorted A–Z (graders
 * don't set the order). The # is the engine company.
 */
function ChartScreen({ config, topic, sides, companyIds, pool, initialQueue, gradedIds, resuming, onCompaniesChange, onBack, onStartGrading }) {
  const events = eventsForTopic(config, topic.topic_id);
  const alreadyGraded = gradedIds || [];

  const [queue, setQueue] = useState(initialQueue || []); // preloaded when editing mid-session
  const [slots, setSlots] = useState({});  // the group currently being built
  const [active, setActive] = useState(events[0] ? events[0].event_id : null);
  const [showAddCo, setShowAddCo] = useState(false);

  const recruit = (id) => config.recruits.find((r) => r.recruit_id === id) || {};
  const companyName = (id) => { const r = recruit(id); const c = (config.companies || []).find((x) => x.company_id === r.company_id); return c ? c.name : ""; };
  const engineNumOf = (id) => {
    const r = recruit(id);
    const c = (config.companies || []).find((x) => x.company_id === r.company_id);
    if (!c) return "";
    const m = String(c.name).match(/\d+/);
    return m ? m[0] : c.name;
  };

  const queuedIds = queue.reduce((a, g) => a.concat(g.map((c) => c.recruit_id)), []);
  const placed = Object.values(slots).filter(Boolean);
  const available = pool.filter((id) => queuedIds.indexOf(id) < 0 && placed.indexOf(id) < 0);

  const fill = (id) => setSlots((s) => {
    const cleared = {}; Object.keys(s).forEach((k) => { cleared[k] = s[k] === id ? null : s[k]; });
    return { ...cleared, [active]: id };
  });
  const clearSlot = (eid) => setSlots((s) => ({ ...s, [eid]: null }));
  const swapRoles = () => {
    const ids = events.map((ev) => slots[ev.event_id]).reverse();
    const ns = {}; events.forEach((ev, i) => { ns[ev.event_id] = ids[i]; }); setSlots(ns);
  };

  const buildCurrent = () => events.filter((ev) => slots[ev.event_id]).map((ev) => {
    const id = slots[ev.event_id]; const r = recruit(id);
    return { recruit_id: id, event_id: ev.event_id, side_id: sides[ev.event_id] || "", company_id: r.company_id || "" };
  });
  const addGroup = () => {
    const g = buildCurrent(); if (!g.length) return;
    setQueue((q) => [...q, g]); setSlots({}); setActive(events[0] ? events[0].event_id : null);
  };
  const removeQueued = (i) => setQueue((q) => q.filter((_, k) => k !== i));

  const addCompany = (cid) => { setShowAddCo(false); if (onCompaniesChange) onCompaniesChange(companyIds.concat([cid])); };
  const removeCompany = (cid) => {
    const inCo = (rid) => recruit(rid).company_id === cid;
    // pull that company's people out of any queued groups + the current slots
    setQueue((q) => q.map((g) => g.filter((c) => !inCo(c.recruit_id))).filter((g) => g.length));
    setSlots((s) => { const ns = {}; Object.keys(s).forEach((k) => { ns[k] = s[k] && inCo(s[k]) ? null : s[k]; }); return ns; });
    if (onCompaniesChange) onCompaniesChange(companyIds.filter((x) => x !== cid));
  };
  const otherCompanies = (config.companies || []).filter((c) => companyIds.indexOf(c.company_id) < 0);

  const start = () => {
    const groups = queue.slice();
    const g = buildCurrent(); if (g.length) groups.push(g);   // include the one in progress
    if (groups.length) onStartGrading(groups);
  };
  const totalGroups = queue.length + (placed.length ? 1 : 0);

  const cols = { gridTemplateColumns: "repeat(" + Math.max(events.length, 1) + ", minmax(0,1fr))" };
  const nameTag = (id) => "#" + engineNumOf(id) + " " + fullName(recruit(id));

  return (
    <>
      <TopBar left={<button onClick={onBack}>‹</button>} center={resuming ? "Edit Groups" : "Build Groups"} right={totalGroups + " grp"} />
      <div className="flex h-full flex-col overflow-hidden p-3">
        <p className="mb-2 text-[11px] text-slate-400">{resuming ? "Edit the remaining groups — swap, drop anyone who left, or add someone for a 2nd attempt." : "Tap a column, then a name."} <b>Add group</b> queues it. List sorted A–Z · # = engine. ✓ = already graded.</p>

        {/* companies in this session — drop one or add another mid-session */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Companies:</span>
          {companyIds.map((cid) => {
            const c = (config.companies || []).find((x) => x.company_id === cid);
            return (
              <span key={cid} className="flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1 text-[11px] font-bold text-white">
                {c ? c.name : cid}<button onClick={() => removeCompany(cid)} className="text-slate-300">✕</button>
              </span>
            );
          })}
          {otherCompanies.length > 0 && (
            <button onClick={() => setShowAddCo((s) => !s)} className="rounded-full border border-dashed border-slate-400 px-2 py-1 text-[11px] font-semibold text-slate-500">+ company</button>
          )}
        </div>
        {showAddCo && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {otherCompanies.map((c) => (
              <button key={c.company_id} onClick={() => addCompany(c.company_id)} className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">+ {c.name}</button>
            ))}
          </div>
        )}

        {/* column headers */}
        <div className="grid gap-2" style={cols}>
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

        {/* slots for the group being built */}
        <div className="mt-2 grid gap-2" style={cols}>
          {events.map((ev) => (
            <div key={ev.event_id} className={`relative flex h-20 items-center justify-center rounded-xl border-2 border-dashed p-2 text-center ${slots[ev.event_id] ? "border-green-500 bg-green-50" : active === ev.event_id ? "border-slate-400 bg-white" : "border-slate-300 bg-white"}`}>
              {slots[ev.event_id] ? (
                <>
                  <button onClick={() => clearSlot(ev.event_id)} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow">✕</button>
                  <button onClick={() => clearSlot(ev.event_id)} className="leading-tight">
                    <div className="text-sm font-bold text-slate-800">{fullName(recruit(slots[ev.event_id]))}</div>
                    <div className="text-[10px] text-slate-400">#{engineNumOf(slots[ev.event_id])} · {companyName(slots[ev.event_id])}</div>
                  </button>
                </>
              ) : <button onClick={() => setActive(ev.event_id)} className="text-xs text-slate-400">empty — tap a name</button>}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-center gap-2">
          {events.length >= 2 && <button onClick={swapRoles} className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">⇄ Swap</button>}
          <button onClick={addGroup} disabled={placed.length === 0} className={`rounded-full px-4 py-1.5 text-xs font-bold ${placed.length ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-400"}`}>➕ Add group</button>
        </div>

        {/* queued groups — shown as rows of boxes stacked below */}
        {queue.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Groups ready ({queue.length})</div>
            <div className="mt-1 space-y-2">
              {queue.map((g, i) => (
                <div key={i} className="relative pl-5">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">G{i + 1}</div>
                  <div className="grid gap-2" style={cols}>
                    {events.map((ev) => {
                      const col = g.find((c) => c.event_id === ev.event_id);
                      return (
                        <div key={ev.event_id} className="flex h-14 items-center justify-center rounded-xl border-2 border-green-200 bg-green-50 text-center">
                          {col
                            ? <div className="leading-tight"><div className="text-xs font-bold text-slate-800">{fullName(recruit(col.recruit_id))}</div><div className="text-[9px] text-slate-400">#{engineNumOf(col.recruit_id)}</div></div>
                            : <span className="text-[10px] text-slate-300">—</span>}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => removeQueued(i)} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* available pool */}
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Available ({available.length})</div>
        <div className="mt-1 flex flex-1 flex-wrap content-start items-start gap-2 overflow-auto rounded-xl bg-slate-100 p-2">
          {available.map((id) => {
            const done = alreadyGraded.indexOf(id) >= 0;
            return (
              <button key={id} onClick={() => fill(id)} className={`h-10 rounded-full px-3 text-sm font-semibold shadow-sm active:scale-95 ${done ? "bg-green-50 text-slate-500" : "bg-white text-slate-700"}`}>
                <span className="text-slate-400">#{engineNumOf(id)}</span> {fullName(recruit(id))}{done ? <span className="ml-1 text-green-600">✓</span> : null}
              </button>
            );
          })}
          {available.length === 0 && <span className="p-2 text-xs text-slate-400">Everyone is placed.</span>}
        </div>

        <div className="pt-3">
          <BigButton color="green" onClick={start} disabled={totalGroups === 0}>Start Grading ({totalGroups}) →</BigButton>
        </div>
      </div>
    </>
  );
}

/* Swap roles within each group (reverse who's on each event). */
function reversePairing(group) {
  const recruits = group.map((c) => c.recruit_id).reverse();
  return group.map((c, i) => ({ ...c, recruit_id: recruits[i] }));
}

/* Grade one group, column by column, then hand results back to submit. */
function GradeScreen({ config, group, groupNumber, onEdit, onSwap, onSubmit, busy }) {
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
      <TopBar left={<button onClick={onEdit}>‹ Edit</button>} center={"Grade · Group " + groupNumber} right={idx + 1 + "/" + group.length} />
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex gap-2">
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

        {/* mid-grade controls: swap the pair (before grading), or edit the queue */}
        {!reasonOpen && (
          <div className="mb-3 flex items-center justify-center gap-2">
            {group.length >= 2 && Object.keys(results).length === 0 && (
              <button onClick={onSwap} className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">⇄ Swap roles</button>
            )}
            <button onClick={onEdit} className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">✎ Edit groups</button>
          </div>
        )}

        {reasonOpen ? (
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
        ) : !allDone ? (
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
          <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-5 text-center">
            <div className="text-3xl">✓</div>
            <div className="mt-1 font-bold text-slate-800">Both graded</div>
            <div className="text-xs text-slate-500">Review the chips above, then submit.</div>
          </div>
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

/* =========================== Home hub + Admin =========================== */

/* After PIN: choose grading or settings. */
function HubScreen({ grader, onGrade, onSettings }) {
  return (
    <>
      <TopBar center="Home" />
      <div className="flex h-full flex-col justify-center gap-4 p-6">
        <div className="text-center">
          <div className="text-lg font-bold text-slate-800">Hi, {grader ? grader.name : ""}</div>
          <div className="text-xs text-slate-400">What do you want to do?</div>
        </div>
        <BigButton color="green" onClick={onGrade}>▶ Start grading</BigButton>
        <BigButton color="ghost" onClick={onSettings}>⚙ Settings</BigButton>
      </div>
    </>
  );
}

/* lookups for showing friendly names in admin lists */
const look = {
  captain: (c, id) => { const x = (c.captains || []).find((z) => z.captain_id === id); return x ? x.name : ""; },
  company: (c, id) => { const x = (c.companies || []).find((z) => z.company_id === id); return x ? x.name : ""; },
  event: (c, id) => { const x = (c.events || []).find((z) => z.event_id === id); return x ? x.name : ""; },
  topic: (c, id) => { const x = (c.topics || []).find((z) => z.topic_id === id); return x ? x.name : ""; },
};

/*
 * Every editable category, described as data so one generic UI can edit them
 * all. `tab` matches the Sheet tab; `idCol` is its key column; `fields` are the
 * editable columns (text by default; type "select"/"yesno" for the rest).
 */
const ADMIN_CATS = [
  { key: "companies", tab: "Companies", label: "Companies", idCol: "company_id", items: (c) => c.companies,
    title: (r) => r.name, sub: (r, c) => "Captain: " + (look.captain(c, r.captain_id) || "—"),
    fields: [{ c: "name", label: "Name" }, { c: "captain_id", label: "Captain", type: "select", options: (c) => (c.captains || []).map((x) => ({ value: x.captain_id, label: x.name })) }] },
  { key: "captains", tab: "Captains", label: "Captains", idCol: "captain_id", items: (c) => c.captains,
    title: (r) => r.name, sub: (r) => r.email,
    fields: [{ c: "name", label: "Name" }, { c: "email", label: "Email" }] },
  { key: "higherups", tab: "HigherUps", label: "Higher-ups", idCol: "higherup_id", items: (c) => c.higherUps,
    title: (r) => r.name, sub: (r) => r.email,
    fields: [{ c: "name", label: "Name" }, { c: "email", label: "Email" }] },
  { key: "recruits", tab: "Recruits", label: "Recruits", idCol: "recruit_id", items: (c) => c.recruits,
    title: (r) => (r.first_name + " " + r.last_name).trim(), sub: (r, c) => look.company(c, r.company_id),
    fields: [{ c: "first_name", label: "First name" }, { c: "last_name", label: "Last name" }, { c: "work_email", label: "Work email" },
             { c: "company_id", label: "Company", type: "select", options: (c) => (c.companies || []).map((x) => ({ value: x.company_id, label: x.name })) }] },
  { key: "graders", tab: "Graders", label: "Graders & PINs", idCol: "grader_id", items: (c) => c.graders,
    title: (r) => r.name, sub: () => "PIN set",
    fields: [{ c: "name", label: "Name" }, { c: "pin", label: "PIN" }] },
  { key: "reasons", tab: "FailReasons", label: "Fail Reasons", idCol: "reason_id", items: (c) => c.failReasons,
    title: (r) => r.label, sub: (r, c) => (r.event_id ? "Event: " + look.event(c, r.event_id) : "Global"),
    fields: [{ c: "label", label: "Label" }, { c: "event_id", label: "Event", type: "select", blank: "Global (any event)", options: (c) => (c.events || []).map((x) => ({ value: x.event_id, label: x.name })) }] },
  { key: "topics", tab: "Topics", label: "Topics", idCol: "topic_id", items: (c) => c.topics,
    title: (r) => r.name, sub: () => "",
    fields: [{ c: "name", label: "Topic name" }] },
  { key: "events", tab: "Events", label: "Events", idCol: "event_id", items: (c) => c.events,
    title: (r) => r.name, sub: (r, c) => look.topic(c, r.topic_id) + (look.topic(c, r.topic_id) ? " · " : "") + (isYes(r.side_required) ? "side required" : "no side"),
    fields: [{ c: "name", label: "Event name" }, { c: "topic_id", label: "Topic", type: "select", options: (c) => (c.topics || []).map((x) => ({ value: x.topic_id, label: x.name })) },
             { c: "position", label: "Order # (1,2,3…)" }, { c: "side_required", label: "Side required?", type: "yesno" }] },
  { key: "sides", tab: "EventSides", label: "Event Sides", idCol: "side_id", items: (c) => c.eventSides,
    title: (r) => r.name, sub: (r, c) => "Event: " + look.event(c, r.event_id),
    fields: [{ c: "name", label: "Side name" }, { c: "event_id", label: "Event", type: "select", options: (c) => (c.events || []).map((x) => ({ value: x.event_id, label: x.name })) }] },
];

/* A generic add/edit form built from a category's field spec. */
function RecordForm({ cat, config, initial, onCancel, onSaved }) {
  const [vals, setVals] = useState(() => {
    const v = {}; (cat.fields || []).forEach((f) => { v[f.c] = initial ? (initial[f.c] != null ? initial[f.c] : "") : ""; }); return v;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (c, val) => setVals((s) => ({ ...s, [c]: val }));

  async function save() {
    setSaving(true); setErr("");
    const row = { ...vals, active: "yes" };
    if (initial && initial[cat.idCol]) row[cat.idCol] = initial[cat.idCol];
    try {
      const r = await apiPost({ action: "saveRecord", tab: cat.tab, row });
      if (r && r.ok) await onSaved();
      else setErr((r && r.error) || "Save failed");
    } catch (e) { setErr("Network error — are you online?"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <TopBar left={<button onClick={onCancel}>‹</button>} center={(initial ? "Edit " : "Add ") + cat.label.replace(/s$/, "")} />
      <div className="flex h-full flex-col gap-3 overflow-auto p-4">
        {(cat.fields || []).map((f) => (
          <div key={f.c}>
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{f.label}</label>
            {f.type === "select" ? (
              <select value={vals[f.c]} onChange={(e) => set(f.c, e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">
                <option value="">{f.blank || "— choose —"}</option>
                {f.options(config).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === "yesno" ? (
              <select value={vals[f.c]} onChange={(e) => set(f.c, e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <input value={vals[f.c]} onChange={(e) => set(f.c, e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" />
            )}
          </div>
        ))}
        {err && <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{err}</div>}
        <div className="mt-auto"><BigButton color="green" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</BigButton></div>
      </div>
    </>
  );
}

/* Admin: a menu of categories, then an editable list per category. */
function AdminScreen({ config, onBack, refreshConfig }) {
  const [catKey, setCatKey] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | row object
  const [settingsRow, setSettingsRow] = useState(null); // {key,value} when editing a setting

  // ---- menu ----
  if (!catKey) {
    return (
      <>
        <TopBar left={<button onClick={onBack}>‹</button>} center="Settings" />
        <div className="space-y-2 overflow-auto p-3">
          <p className="px-1 text-[11px] text-slate-400">Edit anything — it saves straight to the backend. Nothing is hard-coded.</p>
          {ADMIN_CATS.map((cat) => (
            <button key={cat.key} onClick={() => setCatKey(cat.key)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left">
              <span className="font-bold text-slate-800">{cat.label}</span>
              <span className="text-slate-300">›</span>
            </button>
          ))}
          <button onClick={() => setCatKey("settings")} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left">
            <span className="font-bold text-slate-800">Scoring, schedule &amp; legend</span>
            <span className="text-slate-300">›</span>
          </button>
        </div>
      </>
    );
  }

  // ---- settings (key/value) ----
  if (catKey === "settings") {
    const entries = Object.keys(config.settings || {}).map((k) => ({ key: k, value: config.settings[k] }));
    if (settingsRow) {
      return (
        <>
          <TopBar left={<button onClick={() => setSettingsRow(null)}>‹</button>} center={settingsRow.key} />
          <SettingEditor row={settingsRow} onCancel={() => setSettingsRow(null)} onSaved={async () => { await refreshConfig(); setSettingsRow(null); }} />
        </>
      );
    }
    return (
      <>
        <TopBar left={<button onClick={() => setCatKey(null)}>‹</button>} center="Scoring / Schedule / Legend" />
        <div className="space-y-2 overflow-auto p-3">
          {entries.map((e) => (
            <button key={e.key} onClick={() => setSettingsRow(e)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left">
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">{e.key}</span>
                <span className="block truncate text-sm text-slate-700">{String(e.value)}</span>
              </span>
              <span className="text-xs font-semibold text-sky-600">Edit</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  const cat = ADMIN_CATS.find((x) => x.key === catKey);
  if (editing) {
    return <RecordForm cat={cat} config={config} initial={editing === "new" ? null : editing}
      onCancel={() => setEditing(null)} onSaved={async () => { await refreshConfig(); setEditing(null); }} />;
  }

  const rows = (cat.items(config) || []);
  async function remove(row) {
    if (!window.confirm("Remove " + cat.title(row) + "?")) return;
    try { await apiPost({ action: "removeRecord", tab: cat.tab, id: row[cat.idCol] }); await refreshConfig(); } catch (e) {}
  }

  return (
    <>
      <TopBar left={<button onClick={() => setCatKey(null)}>‹</button>} center={cat.label} />
      <div className="space-y-2 overflow-auto p-3">
        {rows.map((r) => (
          <div key={r[cat.idCol]} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
            <div className="min-w-0">
              <div className="truncate font-bold text-slate-800">{cat.title(r)}</div>
              {cat.sub(r, config) && <div className="truncate text-[11px] text-slate-400">{cat.sub(r, config)}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button onClick={() => setEditing(r)} className="text-sm font-semibold text-sky-600">Edit</button>
              <button onClick={() => remove(r)} className="text-red-500">✕</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="p-2 text-sm text-slate-400">None yet.</p>}
        <button onClick={() => setEditing("new")} className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500">+ Add {cat.label.replace(/s$/, "")}</button>
      </div>
    </>
  );
}

/* Edit a single Settings value. */
function SettingEditor({ row, onCancel, onSaved }) {
  const [value, setValue] = useState(String(row.value));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setSaving(true); setErr("");
    try {
      const r = await apiPost({ action: "saveRecord", tab: "Settings", row: { key: row.key, value } });
      if (r && r.ok) await onSaved(); else setErr((r && r.error) || "Save failed");
    } catch (e) { setErr("Network error"); } finally { setSaving(false); }
  }
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{row.key}</label>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 p-3 text-sm" />
      {err && <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{err}</div>}
      <div className="mt-auto"><BigButton color="green" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</BigButton></div>
    </div>
  );
}

/* ================================= App ================================== */

const PHASE = { LOADING: "loading", SETUP_URL: "setupUrl", LOGIN: "login", HUB: "hub", ADMIN: "admin", TOPIC: "topic", SESSION: "session", COMPANY: "company", CHART: "chart", GRADE: "grade", ROUNDEND: "roundend" };

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
  const [pool, setPool] = useState([]);                 // sorted roster for the chart builder
  const [gradedThisRound, setGradedThisRound] = useState([]); // groups actually submitted this round
  const [gradePlan, setGradePlan] = useState([]);       // groups currently being graded, in order
  const [planIndex, setPlanIndex] = useState(0);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [groupNumber, setGroupNumber] = useState(1);
  const [resuming, setResuming] = useState(false);      // returning to the builder mid-session
  const [builderQueue, setBuilderQueue] = useState([]); // groups preloaded into the builder when editing
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
    if (config) setPhase(grader ? PHASE.HUB : PHASE.LOGIN);
    try {
      const r = await apiGet({ action: "config" });
      if (r && r.ok) { setConfig(r.config); LS.set(KEYS.config, r.config); if (!config) setPhase(grader ? PHASE.HUB : PHASE.LOGIN); }
      else if (!config) setLoadErr("Backend reachable but returned an error.");
    } catch (e) {
      if (!config) { setLoadErr("Can't reach the backend and there's no saved copy yet. Connect once online."); }
    }
  }

  // Pull fresh config (used after an admin edit).
  async function refreshConfig() {
    try { const r = await apiGet({ action: "config" }); if (r && r.ok) { setConfig(r.config); LS.set(KEYS.config, r.config); } } catch (e) {}
  }

  function logout() { LS.del(KEYS.grader); setGrader(null); resetSession(); setPhase(PHASE.LOGIN); }
  function resetSession() { setTopic(null); setSides({}); setCompanyIds([]); setSessionId(null); setPool([]); setGradedThisRound([]); setGradePlan([]); setPlanIndex(0); setCurrentGroup(null); setGroupNumber(1); setResuming(false); setBuilderQueue([]); }

  /* ---- flow handlers ---- */
  function handleLogin(g) { setGrader(g); LS.set(KEYS.grader, g); setPhase(PHASE.HUB); }
  function pickTopic(t) { setTopic(t); setPhase(PHASE.SESSION); }
  function lockSides(s) { setSides(s); setPhase(PHASE.COMPANY); }
  function pickCompanies(ids) {
    setCompanyIds(ids);
    const sid = uuid(); setSessionId(sid);
    // best-effort session start (audit only; safe to fail offline)
    apiPost({ action: "startSession", session_id: sid, grader_id: grader.grader_id, topic_id: topic.topic_id, company_ids: ids }).catch(() => {});
    setPool(sortedRoster(config, ids));   // sorted A–Z; the chart builds groups off this
    setGradedThisRound([]); setGradePlan([]); setGroupNumber(1); setResuming(false); setBuilderQueue([]);
    setPhase(PHASE.CHART);
  }

  // Add/remove a company mid-session: the new roster swaps into Available.
  // Already-graded results are untouched; swaps are logged for the audit trail.
  function changeCompanies(newIds) {
    const added = newIds.filter((x) => companyIds.indexOf(x) < 0);
    const removed = companyIds.filter((x) => newIds.indexOf(x) < 0);
    added.forEach((cid) => apiPost({ action: "swapCompany", session_id: sessionId, add_company_id: cid }).catch(() => {}));
    removed.forEach((cid) => apiPost({ action: "swapCompany", session_id: sessionId, remove_company_id: cid }).catch(() => {}));
    setCompanyIds(newIds);
    setPool(sortedRoster(config, newIds));
  }

  // Called from the builder's "Start grading". Fresh build resets the round;
  // resuming (after Edit groups) keeps the groups already graded.
  function startGrading(groups) {
    if (!resuming) setGradedThisRound([]);
    setGradePlan(groups); setPlanIndex(0); setCurrentGroup(groups[0] || null);
    setGroupNumber((resuming ? gradedThisRound.length : 0) + 1);
    setResuming(false); setBuilderQueue([]);
    setPhase(groups.length ? PHASE.GRADE : PHASE.CHART);
  }

  // Re-grade an already-graded set (round-end run again / swap) as new attempts.
  function beginReplay(groups) {
    setGradedThisRound([]); setGradePlan(groups); setPlanIndex(0); setCurrentGroup(groups[0] || null);
    setGroupNumber(1); setResuming(false); setBuilderQueue([]);
    setPhase(groups.length ? PHASE.GRADE : PHASE.ROUNDEND);
  }

  // Mid-session: hop back to the builder with the not-yet-graded groups so the
  // grader can swap, drop people who left, or add someone for a 2nd attempt.
  function editGroups() {
    setBuilderQueue(gradePlan.slice(planIndex)); // current (ungraded) + the rest
    setResuming(true);
    setPhase(PHASE.CHART);
  }

  // Swap the two people in the current group (before they're graded).
  function swapCurrent() {
    setCurrentGroup((g) => (g ? reversePairing(g) : g));
    setGradePlan((p) => p.map((grp, i) => (i === planIndex ? reversePairing(grp) : grp)));
  }

  /* Save a graded group, then advance to the next queued group (or end). */
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

    setGradedThisRound((g) => [...g, currentGroup]);
    if (planIndex < gradePlan.length - 1) {
      const next = planIndex + 1;
      setPlanIndex(next); setCurrentGroup(gradePlan[next]); setGroupNumber((n) => n + 1);
    } else {
      setCurrentGroup(null); setPhase(PHASE.ROUNDEND);
    }
  }

  function runSame() { if (gradedThisRound.length) beginReplay(gradedThisRound); }
  function runSwap() { if (gradedThisRound.length) beginReplay(gradedThisRound.map(reversePairing)); }
  function endSession() {
    if (sessionId) apiPost({ action: "endSession", session_id: sessionId }).catch(() => {});
    resetSession(); setPhase(PHASE.HUB);
  }

  /* ---------------------------- render ---------------------------- */
  let body;
  if (phase === PHASE.LOADING) body = <Spinner label={loadErr || "Starting…"} />;
  else if (phase === PHASE.SETUP_URL) body = <SetupUrlScreen onSaved={() => { setLoadErr(""); setPhase(PHASE.LOADING); bootWithConfig(); }} />;
  else if (phase === PHASE.LOGIN) body = <LoginScreen onLogin={handleLogin} />;
  else if (!config) body = <Spinner label={loadErr || "Loading config…"} />;
  else if (phase === PHASE.HUB) body = <HubScreen grader={grader} onGrade={() => setPhase(PHASE.TOPIC)} onSettings={() => setPhase(PHASE.ADMIN)} />;
  else if (phase === PHASE.ADMIN) body = <AdminScreen config={config} onBack={() => setPhase(PHASE.HUB)} refreshConfig={refreshConfig} />;
  else if (phase === PHASE.TOPIC) body = <TopicScreen config={config} onBack={() => setPhase(PHASE.HUB)} onPick={pickTopic} />;
  else if (phase === PHASE.SESSION) body = <SessionSetupScreen config={config} topic={topic} onBack={() => setPhase(PHASE.TOPIC)} onNext={lockSides} />;
  else if (phase === PHASE.COMPANY) body = <CompanyScreen config={config} onBack={() => setPhase(PHASE.SESSION)} onNext={pickCompanies} />;
  else if (phase === PHASE.CHART) body = <ChartScreen config={config} topic={topic} sides={sides} companyIds={companyIds} pool={pool} initialQueue={builderQueue} gradedIds={gradedThisRound.reduce((a, g) => a.concat(g.map((c) => c.recruit_id)), [])} resuming={resuming} onCompaniesChange={changeCompanies} onBack={() => (resuming ? startGrading(builderQueue) : setPhase(PHASE.COMPANY))} onStartGrading={startGrading} />;
  else if (phase === PHASE.GRADE) body = <GradeScreen key={"g" + groupNumber} config={config} group={currentGroup} groupNumber={groupNumber} busy={busy} onEdit={editGroups} onSwap={swapCurrent} onSubmit={submitGroup} />;
  else if (phase === PHASE.ROUNDEND) body = <RoundEndScreen count={gradedThisRound.length} onSame={runSame} onSwap={runSwap} onEnd={endSession} />;

  const showStatus = phase !== PHASE.SETUP_URL && phase !== PHASE.LOADING;

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-slate-50">
      {showStatus && <StatusStrip grader={grader} online={online} pending={pending} onLogout={logout} />}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
