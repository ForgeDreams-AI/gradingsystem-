/**
 * Code.gs — COMBINED single-file build of the grading backend.
 */


/* ===== 01_Schema.gs ===== */

/**
 * 01_Schema.gs
 * =============================================================================
 * THE SINGLE SOURCE OF TRUTH for the spreadsheet layout and default settings.
 *
 * ▸ If you want to ADD A COLUMN to a tab, add it to that tab's list in SCHEMA
 *   below, then re-run `setupSpreadsheet()` (see 02_Setup.gs). The header row
 *   is rebuilt from this list, so the code and the Sheet never drift apart.
 *
 * ▸ Tabs come in two kinds:
 *     CONFIG tabs  — you edit these by hand in the Sheet (companies, recruits…).
 *     DATA tabs    — the app appends to these; treat them as append-only logs.
 *
 * Nothing here is hard-coded business logic — it's just names and defaults.
 * =============================================================================
 */

/**
 * Every tab and its column headers, in order.
 * Column names are also the keys used everywhere in the code, so keep them
 * lowercase_with_underscores and don't rename casually.
 */
var SCHEMA = {
  // ----------------------------- CONFIG TABS -------------------------------
  // Key/Value settings (see DEFAULT_SETTINGS for the list of keys + meanings).
  'Settings':         ['key', 'value', 'notes'],

  // Engine companies. captain_id links to a row in Captains.
  'Companies':        ['company_id', 'name', 'captain_id', 'active'],

  // Captains = name + email only. One captain may own several companies.
  'Captains':         ['captain_id', 'name', 'email', 'active'],

  // Higher-ups = name + email. They receive an all-companies report.
  'HigherUps':        ['higherup_id', 'name', 'email', 'active'],

  // Recruits (the people being graded). work_email receives their own report.
  'Recruits':         ['recruit_id', 'company_id', 'first_name', 'last_name', 'work_email', 'active'],

  // A topic is a set of events (e.g. "Quick Attack / Plug").
  'Topics':           ['topic_id', 'name', 'active'],

  // Events = the columns inside a topic. position orders them left→right.
  // side_required = 'yes' means the grader must pick a side at session start.
  // grade_style (added at the END so existing sheets stay aligned) = 'group'
  // (build groups, default) or 'individual' (go down the roster, pass/fail).
  'Events':           ['event_id', 'topic_id', 'name', 'position', 'side_required', 'active', 'grade_style'],

  // The side/role options for an event (e.g. Plug → Engineer, Captain).
  'EventSides':       ['side_id', 'event_id', 'name', 'active'],

  // Fail/Memo reason buttons. Leave event_id blank for a GLOBAL reason,
  // or set it to scope the reason to one event.
  'FailReasons':      ['reason_id', 'event_id', 'label', 'active'],

  // Graders log in with a PIN. (Captains/higher-ups never log in.)
  'Graders':          ['grader_id', 'name', 'pin', 'active'],

  // ------------------------------ DATA TABS --------------------------------
  // One row per grading session (audit trail).
  'Sessions':         ['session_id', 'grader_id', 'topic_id', 'started_at', 'ended_at', 'status'],

  // Audit of which companies were added/removed from a session and when.
  'SessionCompanies': ['id', 'session_id', 'company_id', 'action', 'at'],

  // THE PERMANENT RECORD. Append-only, immutable. One row per graded attempt.
  // client_submit_id makes saves idempotent (no double-posting on retry/offline).
  'Evaluations':      ['eval_id', 'client_submit_id', 'session_id', 'recruit_id',
                       'topic_id', 'event_id', 'side_id', 'company_at_time',
                       'result', 'attempt_number', 'note', 'graded_by', 'graded_at'],

  // The reason(s) attached to a Fail/Memo (many reasons per evaluation allowed).
  'EvalReasons':      ['id', 'eval_id', 'reason_id', 'reason_text'],

  // Log of every report email we send (also used to avoid double-sending).
  'SendLog':          ['id', 'run_date', 'recipient_type', 'recipient_id', 'email', 'status', 'detail', 'sent_at'],

  // Memos / peer-reviews: captain creates → recruit signs → stored here, keyed
  // by engine company + name. type = 'memo' | 'peer_review'.
  'Reviews':          ['review_id', 'type', 'recruit_id', 'recruit_name', 'company_id', 'company_name',
                       'captain_id', 'captain_email', 'recruit_email', 'week_start', 'score_pct',
                       'captain_notes', 'status', 'signed_name', 'signed_at', 'created_at']
};

/**
 * Default values written into the Settings tab the first time you run setup.
 * Each is [key, value, human-readable note]. Edit values in the SHEET later —
 * NOT here — so your changes survive future setups.
 */
var DEFAULT_SETTINGS = [
  ['org_name',              'Fire Department',         'Display name shown on reports'],
  ['report_time',           '13:00',                   'When daily reports send (24h HH:MM, in the timezone below)'],
  ['timezone',              'America/Phoenix',         'IANA timezone. Arizona = America/Phoenix (no daylight saving)'],
  ['send_days',             'Mon,Tue,Wed,Thu,Fri,Sat,Sun', 'Days reports MAY send (still only sends on days with new data)'],
  ['week_start_day',        'Mon',                     'Day the weekly totals reset (Mon/Sun/etc.)'],
  ['low_attempt_threshold', '3',                       'Flag a recruit who has fewer than this many attempts on an event this week'],
  ['recruit_flag_days',     'Wed,Thu',                 'Days the low-attempt flag appears on RECRUIT reports'],
  ['captain_flag_days',     'Tue,Wed,Thu',             'Days the low-attempt flag appears on CAPTAIN/HIGHER-UP reports'],
  ['band_green_min',        '85',                      'Pass% at or above this = GREEN'],
  ['band_yellow_min',       '70',                      'Pass% at or above this (and below green) = YELLOW; below = RED'],
  ['daily_min_pct',         '75',                      'Daily minimum a recruit should stay above'],
  ['weekly_min_pct',        '80',                      'Weekly minimum a recruit should stay above'],
  ['memo_threshold_pct',    '65',                      'End of week: a recruit BELOW this weekly % gets a MEMO (captain notified)'],
  ['peer_review_threshold_pct', '50',                  'End of week: a recruit BELOW this weekly % needs a PEER REVIEW (captain notified)'],
  ['legend_pass',           'PASS — recruit met the standard for the event on this attempt.', 'Printed on every report'],
  ['legend_fail',           'FAIL — recruit did not meet the standard; see reason(s).',        'Printed on every report'],
  ['sender_name',           'Grading System',          'From-name shown on report emails']
];

/**
 * The three grade-band colors are FIXED (green / yellow / red) by design.
 * Only the PERCENT cut-offs are editable (band_green_min / band_yellow_min in
 * Settings). If you ever truly need different colors, change them here.
 */
var BAND_COLORS = {
  green:  { color: '#16a34a', text: '#ffffff', label: 'On track' },
  yellow: { color: '#f59e0b', text: '#1f2937', label: 'Watch' },
  red:    { color: '#dc2626', text: '#ffffff', label: 'Below standard' }
};

/* ===== 02_Setup.gs ===== */

/**
 * 02_Setup.gs
 * =============================================================================
 * RUN THESE ONCE when you first create the project (from the Apps Script editor
 * pick the function name and click ▶ Run):
 *
 *   1) setupSpreadsheet()  — creates every tab + header row from SCHEMA and
 *                            seeds default Settings. Safe to re-run anytime;
 *                            it never deletes your data, only fixes headers.
 *
 *   2) seedSampleData()    — OPTIONAL. Adds a little demo data (one topic with
 *                            Quick Attack / Plug, a couple companies, recruits,
 *                            a grader with PIN 1234) so you can test end-to-end.
 *                            Skips any tab that already has data.
 *
 *   3) installDailyTrigger() — schedules the 1 PM report job (see 12_Triggers).
 * =============================================================================
 */

/**
 * Create/repair all tabs and header rows. Idempotent: re-running only rewrites
 * the bold header row, leaving every data row untouched.
 */
function setupSpreadsheet() {
  var ss = ss_();

  Object.keys(SCHEMA).forEach(function (tab) {
    var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
    var headers = SCHEMA[tab];

    // Write + style the header row.
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#1f2937')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });

  // Remove the default empty "Sheet1" if it isn't one of our tabs.
  var def = ss.getSheetByName('Sheet1');
  if (def && !SCHEMA['Sheet1'] && ss.getSheets().length > 1) {
    ss.deleteSheet(def);
  }

  seedSettingsIfEmpty_();
  Logger.log('✅ setupSpreadsheet complete. Tabs ready: ' + Object.keys(SCHEMA).join(', '));
}

/**
 * Writes DEFAULT_SETTINGS into the Settings tab, but only if it's still empty,
 * so we never clobber values you've customized.
 */
function seedSettingsIfEmpty_() {
  if (readRows_('Settings').length > 0) return;
  DEFAULT_SETTINGS.forEach(function (row) {
    appendRow_('Settings', { key: row[0], value: row[1], notes: row[2] });
  });
  Logger.log('Seeded default Settings.');
}

/**
 * OPTIONAL demo data so you can click through the whole flow immediately.
 * Each section is skipped if that tab already has rows.
 */
function seedSampleData() {
  // --- Captains ---
  if (readRows_('Captains').length === 0) {
    appendRow_('Captains', { captain_id: 'cap1', name: 'Capt. Reyes', email: 'captain1@example.com', active: 'yes' });
    appendRow_('Captains', { captain_id: 'cap2', name: 'Capt. Olsen', email: 'captain2@example.com', active: 'yes' });
  }
  // --- Companies ---
  if (readRows_('Companies').length === 0) {
    appendRow_('Companies', { company_id: 'c1', name: 'Engine 1', captain_id: 'cap1', active: 'yes' });
    appendRow_('Companies', { company_id: 'c2', name: 'Engine 4', captain_id: 'cap2', active: 'yes' });
  }
  // --- Higher-ups ---
  if (readRows_('HigherUps').length === 0) {
    appendRow_('HigherUps', { higherup_id: 'h1', name: 'Chief Doyle', email: 'chief@example.com', active: 'yes' });
  }
  // --- Recruits ---
  if (readRows_('Recruits').length === 0) {
    var recruits = [
      ['r1', 'c1', 'Alex',  'Carter', 'r1@example.com'],
      ['r2', 'c1', 'Bri',   'Nguyen', 'r2@example.com'],
      ['r3', 'c1', 'Cory',  'Flores', 'r3@example.com'],
      ['r4', 'c2', 'Dana',  'Patel',  'r4@example.com'],
      ['r5', 'c2', 'Erin',  'Ross',   'r5@example.com'],
      ['r6', 'c2', 'Finn',  'Kim',    'r6@example.com']
    ];
    recruits.forEach(function (x) {
      appendRow_('Recruits', { recruit_id: x[0], company_id: x[1], first_name: x[2], last_name: x[3], work_email: x[4], active: 'yes' });
    });
  }
  // --- Topic + Events + Sides ---
  if (readRows_('Topics').length === 0) {
    appendRow_('Topics', { topic_id: 't1', name: 'Quick Attack / Plug', active: 'yes' });
    appendRow_('Events', { event_id: 'e1', topic_id: 't1', name: 'Quick Attack', position: 1, side_required: 'no',  active: 'yes' });
    appendRow_('Events', { event_id: 'e2', topic_id: 't1', name: 'Plug',         position: 2, side_required: 'yes', active: 'yes' });
    appendRow_('EventSides', { side_id: 's1', event_id: 'e2', name: 'Engineer', active: 'yes' });
    appendRow_('EventSides', { side_id: 's2', event_id: 'e2', name: 'Captain',  active: 'yes' });
  }
  // --- Fail reasons (global + per-event examples) ---
  if (readRows_('FailReasons').length === 0) {
    appendRow_('FailReasons', { reason_id: 'fr1', event_id: '',   label: 'PPE not donned',   active: 'yes' });
    appendRow_('FailReasons', { reason_id: 'fr2', event_id: '',   label: 'Out of sequence',  active: 'yes' });
    appendRow_('FailReasons', { reason_id: 'fr3', event_id: 'e1', label: 'Slow to charge line', active: 'yes' });
    appendRow_('FailReasons', { reason_id: 'fr4', event_id: 'e2', label: 'Wrong hydrant wrap',  active: 'yes' });
  }
  // --- A grader with PIN 1234 ---
  if (readRows_('Graders').length === 0) {
    appendRow_('Graders', { grader_id: 'g1', name: 'Capt. Reyes', pin: '1234', active: 'yes' });
  }

  Logger.log('✅ seedSampleData complete. Test grader PIN = 1234.');
}

/* ===== 03_Utils.gs ===== */

/**
 * 03_Utils.gs
 * =============================================================================
 * Small, generic helpers used everywhere. Nothing here knows about grading
 * rules — these just read/write the Sheet and format values.
 *
 * The key idea: every tab is read as an array of plain objects keyed by its
 * header names, e.g. { recruit_id: 'r1', first_name: 'Alex', _row: 2 }.
 * `_row` is the 1-based sheet row (handy when we need to update a cell).
 * =============================================================================
 */

/** The spreadsheet this script is bound to. */
function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Get a tab by name, with a clear error if setup hasn't been run. */
function sheetFor_(tab) {
  var sh = ss_().getSheetByName(tab);
  if (!sh) throw new Error('Missing tab "' + tab + '". Run setupSpreadsheet() first.');
  return sh;
}

/** The header row (column names) of a tab. */
function headers_(tab) {
  var sh = sheetFor_(tab);
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

/**
 * Read every data row of a tab as an array of objects.
 * Returns [] if the tab only has a header row.
 */
function readRows_(tab) {
  var sh = sheetFor_(tab);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(1, 1, lastRow, sh.getLastColumn()).getValues();
  var head = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = { _row: r + 1 };
    for (var c = 0; c < head.length; c++) obj[head[c]] = values[r][c];
    out.push(obj);
  }
  return out;
}

/**
 * Append one object as a new row. Columns are written in the tab's header
 * order; any key not present in the object is left blank.
 */
function appendRow_(tab, obj) {
  var head = headers_(tab);
  var row = head.map(function (h) {
    return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
  });
  sheetFor_(tab).appendRow(row);
}

/** Overwrite a single cell, given a row object (uses its _row) and column name. */
function updateCell_(tab, rowObj, columnName, value) {
  var col = headers_(tab).indexOf(columnName) + 1;
  if (col < 1) throw new Error('No column "' + columnName + '" on tab "' + tab + '"');
  sheetFor_(tab).getRange(rowObj._row, col).setValue(value);
}

/** A fresh unique id. */
function uuid_() {
  return Utilities.getUuid();
}

/** Current time as an ISO-8601 UTC string (stable + sortable). */
function nowIso_() {
  return new Date().toISOString();
}

/**
 * Treat a cell as "active/yes" unless it explicitly says no/false/0/n.
 * Blank counts as active so a half-filled row still works.
 */
function isYes_(v) {
  var s = String(v).trim().toLowerCase();
  return !(s === 'no' || s === 'false' || s === 'n' || s === '0');
}

/** Filter helper: keep rows whose `active` column isn't a "no". */
function isActive_(row) {
  return isYes_(row.active);
}

/** Strip the internal _row key before sending objects to the app. */
function clean_(arr) {
  return arr.map(function (o) {
    var c = {};
    Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; });
    return c;
  });
}

/** Is `item` present in a comma-separated list like "Mon,Tue,Wed"? */
function inList_(item, csv) {
  return String(csv).split(',').map(function (x) { return x.trim(); }).indexOf(String(item)) >= 0;
}

/** Escape text so it's safe to drop into report HTML. */
function esc_(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ===== 04_Config.gs ===== */

/**
 * 04_Config.gs
 * =============================================================================
 * Reads the Settings tab and assembles the "config payload" the front-end app
 * downloads on launch (so NOTHING is hard-coded in the UI — every company,
 * topic, reason, color and label comes from the Sheet).
 * =============================================================================
 */

/** Read the Settings tab into a simple { key: value } object. */
function getSettings_() {
  var map = {};
  readRows_('Settings').forEach(function (r) { map[String(r.key)] = r.value; });
  return map;
}

/** Get one setting from a settings map, falling back to a default. */
function setting_(map, key, def) {
  var v = map[key];
  return (v === undefined || v === null || v === '') ? def : v;
}

/** Same as setting_, but coerced to a Number. */
function settingNum_(map, key, def) {
  return Number(setting_(map, key, def));
}

/**
 * Everything the app needs to render itself. Note we deliberately DO NOT send
 * grader PINs to the browser — only id + name. PIN checking happens server-side
 * in 06_Auth.gs.
 */
function getConfigPayload_() {
  return {
    settings:    getSettings_(),
    colors:      BAND_COLORS,
    companies:   clean_(readRows_('Companies').filter(isActive_)),
    captains:    clean_(readRows_('Captains').filter(isActive_)),
    higherUps:   clean_(readRows_('HigherUps').filter(isActive_)),
    recruits:    clean_(readRows_('Recruits').filter(isActive_)),
    topics:      clean_(readRows_('Topics').filter(isActive_)),
    events:      clean_(readRows_('Events').filter(isActive_)),
    eventSides:  clean_(readRows_('EventSides').filter(isActive_)),
    failReasons: clean_(readRows_('FailReasons').filter(isActive_)),
    graders:     readRows_('Graders').filter(isActive_).map(function (g) {
      return { grader_id: g.grader_id, name: g.name }; // PIN intentionally omitted
    })
  };
}

/** Active recruits belonging to any of the given company ids. */
function rosterFor_(companyIds) {
  var set = {};
  companyIds.forEach(function (c) { set[String(c)] = true; });
  return clean_(readRows_('Recruits').filter(isActive_).filter(function (r) {
    return set[String(r.company_id)];
  }));
}

/* ===== 05_Api.gs ===== */

/**
 * 05_Api.gs
 * =============================================================================
 * The web-app entry points. Apps Script calls doGet() for GET requests and
 * doPost() for POST requests to your deployed /exec URL. Everything returns
 * JSON of the shape { ok: true, ... } or { ok: false, error: "..." }.
 *
 * CORS NOTE (important for the GitHub Pages front-end):
 *   Apps Script web apps can't set custom CORS headers, and they don't answer
 *   the browser's OPTIONS preflight. To stay a "simple request" (no preflight),
 *   the front-end must POST with Content-Type: text/plain and put the JSON in
 *   the body. We just JSON.parse() that body below. GETs are unaffected.
 * =============================================================================
 */

/**
 * GET handler. Supported actions (?action=...):
 *   ping     → health check
 *   config   → full config payload for the app
 *   roster   → recruits for ?company_ids=c1,c2
 */
function doGet(e) {
  try {
    // Memo / peer-review web pages (HTML, not JSON) — see 15_Reviews.gs.
    var page = e && e.parameter && e.parameter.page;
    if (page) {
      switch (page) {
        case 'captainForm': return captainFormPage_(e.parameter);
        case 'doCreate':    return createReview_(e.parameter);
        case 'sign':        return signPage_(e.parameter);
        case 'doSign':      return signReview_(e.parameter);
        default:            return HtmlService.createHtmlOutput('Unknown page.');
      }
    }
    var action = (e && e.parameter && e.parameter.action) || 'ping';
    switch (action) {
      case 'ping':
        return json_({ ok: true, service: 'grading', time: nowIso_() });
      case 'config':
        return json_({ ok: true, config: getConfigPayload_() });
      case 'roster':
        var ids = String((e.parameter && e.parameter.company_ids) || '')
          .split(',').filter(String);
        return json_({ ok: true, recruits: rosterFor_(ids) });
      default:
        return json_({ ok: false, error: 'Unknown GET action: ' + action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * POST handler. The body is a JSON string with an "action" field. Supported:
 *   login        → { pin }
 *   startSession → { grader_id, topic_id, company_ids[] }
 *   submitGroup  → { session_id, client_submit_id, grader_id, items[] }
 *   swapCompany  → { session_id, remove_company_id?, add_company_id? }
 *   endSession   → { session_id }
 */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'login':        return json_(login_(body));
      case 'startSession': return json_(startSession_(body));
      case 'submitGroup':  return json_(submitGroup_(body));
      case 'swapCompany':  return json_(swapCompany_(body));
      case 'endSession':   return json_(endSession_(body));
      case 'saveRecord':   return json_(saveRecord_(body));    // admin add/edit
      case 'removeRecord': return json_(removeRecord_(body));  // admin deactivate
      default:             return json_({ ok: false, error: 'Unknown POST action: ' + body.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Wrap any object as a JSON HTTP response. */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===== 06_Auth.gs ===== */

/**
 * 06_Auth.gs
 * =============================================================================
 * Grader sign-in. Graders are the ONLY people who log in. They type a PIN; we
 * match it against the Graders tab here on the server so the PIN list never
 * leaves the spreadsheet.
 *
 * NOTE: PINs are stored in plain text in the Sheet for simplicity (this is a
 * low-stakes field tool, not a bank). If you ever need more security, hash the
 * PINs and compare hashes here.
 * =============================================================================
 */

/** body = { pin }. Returns the matching grader (id + name) or an error. */
function login_(body) {
  var pin = String(body.pin || '').trim();
  if (!pin) return { ok: false, error: 'PIN required' };

  var grader = readRows_('Graders').filter(isActive_).filter(function (g) {
    return String(g.pin).trim() === pin;
  })[0];

  if (!grader) return { ok: false, error: 'Invalid PIN' };
  return { ok: true, grader: { grader_id: grader.grader_id, name: grader.name } };
}

/* ===== 07_Sessions.gs ===== */

/**
 * 07_Sessions.gs
 * =============================================================================
 * A "session" is one grader sitting down to grade a topic for a set of
 * companies. Sessions are mostly an audit trail — the real data is the
 * Evaluations rows (see 08_Submit.gs). Companies added/removed mid-session are
 * logged to SessionCompanies with timestamps.
 * =============================================================================
 */

/** body = { grader_id, topic_id, company_ids[] }. Returns a new session_id. */
function startSession_(body) {
  var sessionId = uuid_();
  appendRow_('Sessions', {
    session_id: sessionId,
    grader_id:  body.grader_id || '',
    topic_id:   body.topic_id || '',
    started_at: nowIso_(),
    ended_at:   '',
    status:     'open'
  });
  (body.company_ids || []).forEach(function (cid) {
    appendRow_('SessionCompanies', {
      id: uuid_(), session_id: sessionId, company_id: cid, action: 'add', at: nowIso_()
    });
  });
  return { ok: true, session_id: sessionId };
}

/**
 * body = { session_id, remove_company_id?, add_company_id? }.
 * Logs the swap. (Already-saved Evaluations are never touched — immutability is
 * handled by the fact that we only ever append.)
 */
function swapCompany_(body) {
  if (body.remove_company_id) {
    appendRow_('SessionCompanies', {
      id: uuid_(), session_id: body.session_id, company_id: body.remove_company_id, action: 'remove', at: nowIso_()
    });
  }
  if (body.add_company_id) {
    appendRow_('SessionCompanies', {
      id: uuid_(), session_id: body.session_id, company_id: body.add_company_id, action: 'add', at: nowIso_()
    });
  }
  return { ok: true };
}

/** body = { session_id }. Marks the session closed. */
function endSession_(body) {
  var s = readRows_('Sessions').filter(function (x) {
    return x.session_id === body.session_id;
  })[0];
  if (!s) return { ok: false, error: 'Session not found' };

  updateCell_('Sessions', s, 'ended_at', nowIso_());
  updateCell_('Sessions', s, 'status', 'closed');
  return { ok: true };
}

/* ===== 08_Submit.gs ===== */

/**
 * 08_Submit.gs
 * =============================================================================
 * The heart of the system: saving graded results.
 *
 * Two guarantees the field requires:
 *   1) IMMEDIATE + NEVER LOST  — each Submit appends immutable rows right away.
 *   2) NO DOUBLE-POSTING       — the app sends a `client_submit_id` (a UUID it
 *      made when the grader tapped Submit). If that id is already saved (e.g. an
 *      offline retry resent it), we return the existing rows instead of adding
 *      duplicates. This is what makes the offline queue safe to retry.
 *
 * Concurrency: 4–5 graders may submit at the same instant. LockService
 * serializes the critical section so attempt numbers stay correct and rows
 * never interleave badly.
 * =============================================================================
 */

/**
 * body = {
 *   session_id, grader_id, client_submit_id,
 *   items: [{
 *     recruit_id, topic_id, event_id,
 *     side_id?, company_id,         // company_id is stored as company_at_time
 *     result: 'pass'|'fail'|'memo',
 *     note?,                        // free text (used for memo / "Other")
 *     reasons?: [{ reason_id?, text? }]   // multiple reasons allowed
 *   }, ...]
 * }
 */
function submitGroup_(body) {
  if (!body.client_submit_id) return { ok: false, error: 'client_submit_id required' };
  if (!body.items || !body.items.length) return { ok: false, error: 'No items to submit' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // wait up to 30s for other graders' writes to finish
  try {
    var allEvals = readRows_('Evaluations');

    // --- Idempotency: have we already saved this exact submit? ---
    var existing = allEvals.filter(function (e) {
      return e.client_submit_id === body.client_submit_id;
    });
    if (existing.length) {
      return { ok: true, deduped: true, evals: existing.map(summarizeEval_) };
    }

    // --- Track next attempt number per (recruit, event, side) within this run ---
    var nextAttempt = makeAttemptCounter_(allEvals);
    var saved = [];

    body.items.forEach(function (item) {
      var attempt = nextAttempt(item.recruit_id, item.event_id, item.side_id);
      var evalId = uuid_();

      appendRow_('Evaluations', {
        eval_id:          evalId,
        client_submit_id: body.client_submit_id,
        session_id:       body.session_id || '',
        recruit_id:       item.recruit_id,
        topic_id:         item.topic_id || '',
        event_id:         item.event_id,
        side_id:          item.side_id || '',
        company_at_time:  item.company_id || '',
        result:           String(item.result || '').toLowerCase(),
        attempt_number:   attempt,
        note:             item.note || '',
        graded_by:        body.grader_id || '',
        graded_at:        nowIso_()
      });

      // Attach any reasons (works for the "Other" free-text case too).
      (item.reasons || []).forEach(function (rs) {
        appendRow_('EvalReasons', {
          id: uuid_(), eval_id: evalId,
          reason_id: rs.reason_id || '', reason_text: rs.text || ''
        });
      });

      saved.push({
        eval_id: evalId, recruit_id: item.recruit_id, event_id: item.event_id,
        side_id: item.side_id || '', attempt_number: attempt
      });
    });

    return { ok: true, evals: saved };
  } finally {
    lock.releaseLock();
  }
}

/** Compact view of a saved evaluation (used in the idempotent response). */
function summarizeEval_(e) {
  return {
    eval_id: e.eval_id, recruit_id: e.recruit_id, event_id: e.event_id,
    side_id: e.side_id || '', attempt_number: e.attempt_number
  };
}

/**
 * Returns a function nextAttempt(recruitId, eventId, sideId) that yields the
 * next attempt number, starting from however many already exist and counting
 * up correctly even if the same recruit/event appears twice in one submit.
 */
function makeAttemptCounter_(allEvals) {
  var counts = {};
  function key(r, ev, sd) { return r + '|' + ev + '|' + (sd || ''); }

  return function (recruitId, eventId, sideId) {
    var k = key(recruitId, eventId, sideId);
    if (counts[k] === undefined) {
      counts[k] = allEvals.filter(function (e) {
        return e.recruit_id === recruitId &&
               e.event_id === eventId &&
               String(e.side_id || '') === String(sideId || '');
      }).length;
    }
    counts[k] += 1;
    return counts[k];
  };
}

/* ===== 09_Scoring.gs ===== */

/**
 * 09_Scoring.gs
 * =============================================================================
 * The grading math, in one place so it's easy to audit/change.
 *
 *   Score = passes ÷ total attempts   (per event, and per side).
 *   A MEMO counts as a FAIL by default (configurable: memo_counts_as).
 *   Colors: GREEN ≥ band_green_min, else YELLOW ≥ band_yellow_min, else RED.
 * =============================================================================
 */

/**
 * Tally a set of evaluation rows.
 * Returns { passes, attempts, pct } where pct is an integer 0–100.
 *
 * memo_counts_as controls how a MEMO is treated:
 *   'fail'    → counts in attempts, not in passes (hurts the %).  [default]
 *   'pass'    → counts in both (helps the %).
 *   'neutral' → ignored entirely (doesn't affect the %).
 */
function scoreRows_(evals, settings) {
  var memoMode = String(setting_(settings, 'memo_counts_as', 'fail')).toLowerCase();
  var passes = 0, attempts = 0;

  evals.forEach(function (e) {
    var r = String(e.result).toLowerCase();
    if (r === 'pass') { passes++; attempts++; }
    else if (r === 'fail') { attempts++; }
    else if (r === 'memo') {
      if (memoMode === 'pass') { passes++; attempts++; }
      else if (memoMode === 'neutral') { /* ignored */ }
      else { attempts++; } // 'fail'
    }
  });

  return { passes: passes, attempts: attempts, pct: attempts ? Math.round((passes / attempts) * 100) : 0 };
}

/**
 * Map a percentage to its color band. The colors are fixed (BAND_COLORS);
 * only the cut-offs (band_green_min / band_yellow_min) come from Settings.
 * Returns an object like { key:'green', color:'#16a34a', text:'#fff', label:'On track' }.
 */
function bandForPct_(pct, settings) {
  var greenMin = settingNum_(settings, 'band_green_min', 85);
  var yellowMin = settingNum_(settings, 'band_yellow_min', 70);
  if (pct >= greenMin) return bandObj_('green');
  if (pct >= yellowMin) return bandObj_('yellow');
  return bandObj_('red');
}

/** Build a band object from BAND_COLORS plus its key. */
function bandObj_(key) {
  var c = BAND_COLORS[key];
  return { key: key, color: c.color, text: c.text, label: c.label };
}

/* ===== 10_Reporting.gs ===== */

/**
 * 10_Reporting.gs
 * =============================================================================
 * Builds and sends the daily reports. This is the function the 1 PM trigger
 * calls (see 12_Triggers.gs). You can also run it by hand for testing.
 *
 * Who gets what:
 *   • Recruit   → their own week-to-date results (per event, side breakdown).
 *   • Captain   → one report per company they own: a roster summary PLUS a
 *                 "by attempts" view per event (who needs reps / who's struggling).
 *   • Higher-up → the same company report, but for ALL companies.
 *
 * Gates:
 *   • Only on days listed in send_days.
 *   • Only if there's NEW data today ("data day"); empty days are skipped.
 *   • Low-attempt flag only shows on the configured days (recruit vs captain).
 * =============================================================================
 */

/** MAIN ENTRY — called by the daily trigger (and by runReportsNow for tests). */
function sendDailyReports() {
  var ctx = buildContext_();
  var s = ctx.settings;
  var now = new Date();
  var todayStr = Utilities.formatDate(now, ctx.tz, 'yyyy-MM-dd');
  var dow = Utilities.formatDate(now, ctx.tz, 'EEE'); // Mon, Tue, ...
  var runDate = todayStr;

  // Gate 1: is today an allowed send day?
  var sendDays = String(setting_(s, 'send_days', '')).split(',').map(function (x) { return x.trim(); }).filter(String);
  if (sendDays.length && sendDays.indexOf(dow) === -1) {
    logSend_(runDate, 'system', '-', '-', 'skipped', 'not a send day (' + dow + ')');
    return;
  }

  var allEvals = readRows_('Evaluations');
  var dateStrOf = function (e) { return Utilities.formatDate(new Date(e.graded_at), ctx.tz, 'yyyy-MM-dd'); };

  // Gate 2: only send on days with new data.
  var hasDataToday = allEvals.some(function (e) { return dateStrOf(e) === todayStr; });
  if (!hasDataToday) {
    logSend_(runDate, 'system', '-', '-', 'skipped', 'no new data today');
    return;
  }

  // Week window (week-to-date): from week_start_day through today.
  var weekStart = weekStartStr_(now, ctx.tz, setting_(s, 'week_start_day', 'Mon'));
  var weekEvals = allEvals.filter(function (e) {
    var d = dateStrOf(e);
    return d >= weekStart && d <= todayStr;
  });

  // Should the "low attempts" flag show today?
  var recruitFlag = inList_(dow, setting_(s, 'recruit_flag_days', 'Wed,Thu'));
  var captainFlag = inList_(dow, setting_(s, 'captain_flag_days', 'Tue,Wed,Thu'));

  // Index this week's evals by recruit for quick lookup.
  var byRecruit = {};
  weekEvals.forEach(function (e) { (byRecruit[e.recruit_id] = byRecruit[e.recruit_id] || []).push(e); });

  // --- 1) Recruit reports ---
  ctx.recruits.forEach(function (r) {
    var evs = byRecruit[r.recruit_id];
    if (!evs || !evs.length || !r.work_email) return;
    var html = recruitReportHtml_(r, evs, ctx, recruitFlag, weekStart);
    var pdf = htmlToPdf_(html, 'Report-' + r.last_name + '-' + todayStr);
    sendReportEmail_(r.work_email, 'Your training results — week of ' + weekStart, html, pdf, 'recruit', r.recruit_id, runDate);
  });

  // --- 2) Captain reports (one per company they own) ---
  ctx.companies.filter(isActive_).forEach(function (co) {
    var cap = ctx.captainsById[co.captain_id];
    if (!cap || !cap.email) return;
    var coEvals = evalsForCompany_(weekEvals, co.company_id, ctx);
    if (!coEvals.length) return; // nothing happened in this company this week
    var html = companyReportHtml_(co.name, [co], ctx, weekEvals, captainFlag, weekStart);
    var pdf = htmlToPdf_(html, 'Company-' + co.name + '-' + todayStr);
    sendReportEmail_(cap.email, co.name + ' — training results week of ' + weekStart, html, pdf, 'captain', co.company_id, runDate);
  });

  // --- 3) Higher-up reports (all companies) ---
  ctx.higherUps.forEach(function (h) {
    if (!h.email) return;
    var html = companyReportHtml_('All Companies', ctx.companies.filter(isActive_), ctx, weekEvals, captainFlag, weekStart);
    var pdf = htmlToPdf_(html, 'AllCompanies-' + todayStr);
    sendReportEmail_(h.email, 'All companies — training results week of ' + weekStart, html, pdf, 'higherup', h.higherup_id, runDate);
  });

  logSend_(runDate, 'system', '-', '-', 'done', 'daily run complete');
}

/* -------------------------------------------------------------------------- */
/*  Context + small helpers                                                   */
/* -------------------------------------------------------------------------- */

/** Load everything once and build id→row lookup maps for fast joins. */
function buildContext_() {
  var byId = function (arr, key) {
    var m = {};
    arr.forEach(function (r) { m[String(r[key])] = r; });
    return m;
  };
  var settings = getSettings_();
  return {
    settings:      settings,
    tz:            setting_(settings, 'timezone', 'America/Phoenix'),
    companies:     readRows_('Companies'),
    companiesById: byId(readRows_('Companies'), 'company_id'),
    captainsById:  byId(readRows_('Captains'), 'captain_id'),
    higherUps:     readRows_('HigherUps').filter(isActive_),
    recruits:      readRows_('Recruits').filter(isActive_),
    recruitsById:  byId(readRows_('Recruits'), 'recruit_id'),
    eventsById:    byId(readRows_('Events'), 'event_id'),
    sidesById:     byId(readRows_('EventSides'), 'side_id'),
    topicsById:    byId(readRows_('Topics'), 'topic_id')
  };
}

/** The yyyy-MM-dd of the most recent week_start_day on/before `now`. */
function weekStartStr_(now, tz, weekStartDay) {
  var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  var cur = map[Utilities.formatDate(now, tz, 'EEE')];
  var start = (map[weekStartDay] !== undefined) ? map[weekStartDay] : 1;
  var back = (cur - start + 7) % 7;
  var d = new Date(now.getTime() - back * 24 * 3600 * 1000);
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

/** Evals (from a pool) belonging to recruits in one company. */
function evalsForCompany_(evals, companyId, ctx) {
  return evals.filter(function (e) {
    var r = ctx.recruitsById[e.recruit_id];
    return r && String(r.company_id) === String(companyId);
  });
}

/**
 * Group a recruit's evals into a per-event breakdown:
 *   [{ eventName, hasSides, sides:[{sideName,passes,attempts,pct,band}],
 *      combined:{passes,attempts,pct,band} }]
 */
function breakdownForEvals_(evals, ctx) {
  var byEvent = {};
  evals.forEach(function (e) { (byEvent[e.event_id] = byEvent[e.event_id] || []).push(e); });

  return Object.keys(byEvent).map(function (eventId) {
    var rows = byEvent[eventId];
    var ev = ctx.eventsById[eventId] || { name: '(event ' + eventId + ')' };

    var bySide = {};
    rows.forEach(function (r) { (bySide[r.side_id || ''] = bySide[r.side_id || ''] || []).push(r); });

    var sides = Object.keys(bySide).map(function (sid) {
      var sc = scoreRows_(bySide[sid], ctx.settings);
      var sideName = sid ? (ctx.sidesById[sid] ? ctx.sidesById[sid].name : sid) : '';
      return { sideName: sideName, passes: sc.passes, attempts: sc.attempts, pct: sc.pct, band: bandForPct_(sc.pct, ctx.settings) };
    });

    var comb = scoreRows_(rows, ctx.settings);
    return {
      eventName: ev.name,
      hasSides: sides.some(function (s) { return s.sideName; }),
      sides: sides,
      combined: { passes: comb.passes, attempts: comb.attempts, pct: comb.pct, band: bandForPct_(comb.pct, ctx.settings) }
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  HTML builders (inline styles only — email/PDF clients ignore <style>)     */
/* -------------------------------------------------------------------------- */

/** A small colored pill, e.g. "7/9 · 78%" on its band color. */
function badge_(text, band) {
  return '<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-weight:bold;background:' +
    band.color + ';color:' + band.text + '">' + esc_(text) + '</span>';
}

/** The Pass/Fail/Memo legend, printed on every report. */
function legendHtml_(s) {
  var dot = function (c) {
    return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + c + ';margin-right:6px"></span>';
  };
  var memoPct = settingNum_(s, 'memo_threshold_pct', 65);
  var peerPct = settingNum_(s, 'peer_review_threshold_pct', 50);
  return '<div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:10px;font-size:11px;color:#6b7280">' +
    '<b style="text-transform:uppercase">Legend</b><br>' +
    dot('#16a34a') + esc_(setting_(s, 'legend_pass', '')) + '<br>' +
    dot('#dc2626') + esc_(setting_(s, 'legend_fail', '')) + '<br>' +
    dot('#f59e0b') + 'MEMO — issued automatically when a recruit finishes the week below ' + memoPct + '%.<br>' +
    dot('#b91c1c') + 'PEER REVIEW — required when a recruit finishes the week below ' + peerPct + '%.' +
    '</div>';
}

/** One recruit's personal report. */
function recruitReportHtml_(recruit, weekEvals, ctx, showLowFlag, weekStart) {
  var s = ctx.settings;
  var overall = scoreRows_(weekEvals, s);
  var oband = bandForPct_(overall.pct, s);
  var weeklyMin = settingNum_(s, 'weekly_min_pct', 80);
  var threshold = settingNum_(s, 'low_attempt_threshold', 3);
  var company = ctx.companiesById[recruit.company_id];

  var h = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;color:#1f2937">';
  h += '<h2 style="margin:0">' + esc_(recruit.first_name + ' ' + recruit.last_name) + '</h2>';
  h += '<div style="color:#6b7280;font-size:13px">' + esc_(company ? company.name : '') + ' · Week of ' + esc_(weekStart) + '</div>';

  // Overall % banner.
  h += '<div style="margin:12px 0;padding:14px;border-radius:10px;text-align:center;background:' + oband.color + ';color:' + oband.text + '">';
  h += '<div style="font-size:30px;font-weight:800">' + overall.pct + '%</div>';
  h += '<div style="font-size:12px;text-transform:uppercase">' + esc_(oband.label) + '</div>';
  h += '<div style="font-size:11px;opacity:.9">Weekly min ' + weeklyMin + '% · ' + (overall.pct >= weeklyMin ? 'meets standard' : 'below standard') + '</div>';
  h += '</div>';

  // Per-event cards with side breakdown + combined.
  breakdownForEvals_(weekEvals, ctx).forEach(function (ev) {
    var low = showLowFlag && ev.combined.attempts < threshold;
    h += '<div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:10px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:8px 12px">';
    h += '<span style="font-weight:bold">' + esc_(ev.eventName) +
      (low ? ' <span style="background:#fef3c7;color:#b45309;font-size:10px;padding:1px 4px;border-radius:3px">&#9888; &lt;' + threshold + ' ATTEMPTS</span>' : '') +
      '</span>';
    h += badge_(ev.combined.passes + '/' + ev.combined.attempts + ' · ' + ev.combined.pct + '%', ev.combined.band);
    h += '</div>';
    if (ev.hasSides) {
      ev.sides.forEach(function (sd) {
        h += '<div style="display:flex;justify-content:space-between;padding:6px 12px;font-size:13px;border-top:1px solid #f1f5f9">';
        h += '<span style="color:#6b7280">&#8627; ' + esc_(sd.sideName || '(no side)') + ' side</span>';
        h += badge_(sd.passes + '/' + sd.attempts + ' · ' + sd.pct + '%', sd.band);
        h += '</div>';
      });
    }
    h += '</div>';
  });

  h += legendHtml_(s);
  h += '</div>';
  return h;
}

/**
 * A company report (or several companies, for higher-ups). For each company:
 *   • a recruit summary table (name → week %), and
 *   • a "by attempts" section: for each event, recruits sorted fewest-attempts
 *     first, each colored by their pass-rate band.
 */
function companyReportHtml_(title, companies, ctx, weekEvals, showLowFlag, weekStart) {
  var s = ctx.settings;
  var threshold = settingNum_(s, 'low_attempt_threshold', 3);

  var h = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:auto;color:#1f2937">';
  h += '<h2 style="margin:0">' + esc_(title) + '</h2>';
  h += '<div style="color:#6b7280;font-size:13px">Week of ' + esc_(weekStart) + '</div>';

  companies.forEach(function (co) {
    var recruits = ctx.recruits.filter(function (r) { return String(r.company_id) === String(co.company_id); });
    var coEvals = evalsForCompany_(weekEvals, co.company_id, ctx);

    if (companies.length > 1) {
      h += '<h3 style="margin:16px 0 6px;border-bottom:2px solid #e5e7eb">' + esc_(co.name) + '</h3>';
    }
    if (!coEvals.length) {
      h += '<div style="color:#9ca3af;font-size:13px">No data this week.</div>';
      return;
    }

    // ----- ACTION NEEDED: weekly memo / peer-review flags (for the captain) -----
    var memoPct = settingNum_(s, 'memo_threshold_pct', 65);
    var peerPct = settingNum_(s, 'peer_review_threshold_pct', 50);
    var memos = [], peers = [];
    recruits.forEach(function (r) {
      var evs = coEvals.filter(function (e) { return String(e.recruit_id) === String(r.recruit_id); });
      if (!evs.length) return;
      var pct = scoreRows_(evs, s).pct;
      var nm = r.first_name + ' ' + r.last_name + ' (' + pct + '%)';
      if (pct < peerPct) peers.push(nm);
      else if (pct < memoPct) memos.push(nm);
    });
    if (peers.length || memos.length) {
      h += '<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:10px 12px;margin-bottom:12px">';
      h += '<div style="font-weight:bold;color:#b91c1c;font-size:13px;text-transform:uppercase">&#9888; Action needed this week</div>';
      if (peers.length) h += '<div style="font-size:13px;margin-top:6px;color:#7f1d1d"><b>Peer review (below ' + peerPct + '%):</b> ' + esc_(peers.join(', ')) + '</div>';
      if (memos.length) h += '<div style="font-size:13px;margin-top:6px;color:#92400e"><b>Memo (below ' + memoPct + '%):</b> ' + esc_(memos.join(', ')) + '</div>';
      // Captain link to fill out + send the memo/peer-review form for signature.
      if (co.captain_id) {
        var formUrl = ScriptApp.getService().getUrl() + '?page=captainForm&cap=' + encodeURIComponent(co.captain_id);
        h += '<div style="margin-top:10px"><a href="' + formUrl + '" style="display:inline-block;padding:9px 14px;background:#b91c1c;color:#fff;border-radius:7px;text-decoration:none;font-weight:bold;font-size:13px">Create &amp; send form &rarr;</a></div>';
      }
      h += '</div>';
    }

    // Recruit summary table.
    h += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">';
    h += '<tr style="color:#6b7280;text-align:left"><th style="padding:4px">Recruit</th><th style="padding:4px;text-align:right">Week %</th></tr>';
    recruits.forEach(function (r) {
      var evs = coEvals.filter(function (e) { return String(e.recruit_id) === String(r.recruit_id); });
      if (!evs.length) return;
      var sc = scoreRows_(evs, s);
      h += '<tr style="border-top:1px solid #f1f5f9"><td style="padding:6px">' + esc_(r.first_name + ' ' + r.last_name) + '</td>' +
        '<td style="padding:6px;text-align:right">' + badge_(sc.pct + '%', bandForPct_(sc.pct, s)) + '</td></tr>';
    });
    h += '</table>';

    // By-attempts, per event.
    h += '<div style="font-size:12px;font-weight:bold;text-transform:uppercase;color:#6b7280;margin:8px 0 4px">By attempts (per event)</div>';
    var byEvent = {};
    coEvals.forEach(function (e) { (byEvent[e.event_id] = byEvent[e.event_id] || []).push(e); });

    Object.keys(byEvent).forEach(function (eventId) {
      var ev = ctx.eventsById[eventId] || { name: '(event)' };
      h += '<div style="font-weight:bold;margin-top:8px">' + esc_(ev.name) + '</div>';

      // Aggregate per recruit for this event, then sort fewest attempts first.
      var perRecruit = {};
      byEvent[eventId].forEach(function (e) { (perRecruit[e.recruit_id] = perRecruit[e.recruit_id] || []).push(e); });
      var rows = Object.keys(perRecruit).map(function (rid) {
        var sc = scoreRows_(perRecruit[rid], s);
        var r = ctx.recruitsById[rid] || {};
        return { name: (r.first_name || '') + ' ' + (r.last_name || ''), passes: sc.passes, attempts: sc.attempts, pct: sc.pct, band: bandForPct_(sc.pct, s) };
      }).sort(function (a, b) { return a.attempts - b.attempts; });

      h += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
      rows.forEach(function (row) {
        var low = showLowFlag && row.attempts < threshold;
        h += '<tr style="border-top:1px solid #f1f5f9"><td style="padding:5px">' + esc_(row.name) +
          (low ? ' <span style="background:#fef3c7;color:#b45309;font-size:10px;padding:1px 4px;border-radius:3px">&#9888; needs reps</span>' : '') +
          '</td><td style="padding:5px;text-align:right">' + badge_(row.passes + '/' + row.attempts + ' · ' + row.pct + '%', row.band) + '</td></tr>';
      });
      h += '</table>';
    });
  });

  h += legendHtml_(s);
  h += '</div>';
  return h;
}

/* ===== 11_Email.gs ===== */

/**
 * 11_Email.gs
 * =============================================================================
 * Turns report HTML into a PDF and emails it, then records the send in SendLog.
 * The SendLog also makes sends idempotent: if the daily job runs twice on the
 * same date, a recipient who already got their email is skipped.
 *
 * Email is sent with Gmail's built-in MailApp (no external service, no API key).
 * Daily quota is ~100 recipients on consumer Gmail / ~1500 on Workspace — plenty
 * here, but worth knowing if the roster ever gets huge.
 * =============================================================================
 */

/** Convert an HTML string into a downloadable PDF blob named <name>.pdf. */
function htmlToPdf_(html, name) {
  return Utilities
    .newBlob(html, 'text/html', name + '.html')
    .getAs('application/pdf')
    .setName(name + '.pdf');
}

/**
 * Send one report. Skips if there's no email, or if we already sent to this
 * recipient on this run date. Always writes a SendLog row (sent/skipped/error).
 *
 * recipientType: 'recruit' | 'captain' | 'higherup'
 * recipientId:   the id of that person/company (used for the idempotency check)
 */
function sendReportEmail_(toEmail, subject, html, pdfBlob, recipientType, recipientId, runDate) {
  if (!toEmail) {
    logSend_(runDate, recipientType, recipientId, '', 'skipped', 'no email on file');
    return;
  }

  var already = readRows_('SendLog').some(function (l) {
    return l.run_date === runDate &&
           l.recipient_type === recipientType &&
           String(l.recipient_id) === String(recipientId) &&
           l.status === 'sent';
  });
  if (already) {
    logSend_(runDate, recipientType, recipientId, toEmail, 'skipped', 'already sent today');
    return;
  }

  var senderName = setting_(getSettings_(), 'sender_name', 'Grading System');
  try {
    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      htmlBody: html,
      name: senderName,
      attachments: pdfBlob ? [pdfBlob] : []
    });
    logSend_(runDate, recipientType, recipientId, toEmail, 'sent', subject);
  } catch (err) {
    logSend_(runDate, recipientType, recipientId, toEmail, 'error', String(err));
  }
}

/** Append a row to SendLog. */
function logSend_(runDate, type, id, email, status, detail) {
  appendRow_('SendLog', {
    id: uuid_(), run_date: runDate, recipient_type: type, recipient_id: id,
    email: email, status: status, detail: detail || '', sent_at: nowIso_()
  });
}

/* ===== 12_Triggers.gs ===== */

/**
 * 12_Triggers.gs
 * =============================================================================
 * Schedules the daily report job.
 *
 *   installDailyTrigger() — reads report_time from Settings and creates a
 *                           time-based trigger that runs sendDailyReports()
 *                           once a day near that hour. Run this once (and again
 *                           if you change report_time). Safe to re-run; it
 *                           clears old copies first.
 *
 *   runReportsNow()       — fire the report job immediately, for testing.
 *                           (It still respects the send-day / data-day gates.)
 *
 * Time zone: triggers fire in the PROJECT timezone, which the manifest
 * (appsscript.json) pins to America/Phoenix. Keep them in sync.
 * =============================================================================
 */

/** Create (or recreate) the once-a-day trigger at the configured report_time. */
function installDailyTrigger() {
  removeDailyTriggers_();

  var s = getSettings_();
  var parts = String(setting_(s, 'report_time', '13:00')).split(':');
  var hour = Number(parts[0]);
  var minute = Number(parts[1] || 0);

  ScriptApp.newTrigger('sendDailyReports')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .nearMinute(minute)
    .create();

  Logger.log('✅ Daily trigger installed for ~' + hour + ':' + (minute < 10 ? '0' : '') + minute +
    ' ' + setting_(s, 'timezone', 'America/Phoenix'));
}

/** Remove any existing sendDailyReports triggers so we don't stack duplicates. */
function removeDailyTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyReports') ScriptApp.deleteTrigger(t);
  });
}

/** Manual test: run the report job right now. */
function runReportsNow() {
  sendDailyReports();
}

/* ===== 13_Admin.gs ===== */

/**
 * 13_Admin.gs
 * =============================================================================
 * Lets the in-app Settings screens add/edit/remove config rows. Only the CONFIG
 * tabs below are writable — the data tabs (Evaluations, Sessions, …) can never
 * be touched this way, so the permanent record stays immutable.
 *
 * saveRecord_   — insert a new row, or update an existing one (matched by its
 *                 id column). New rows get a generated id automatically.
 * removeRecord_ — soft-delete: sets the row's `active` column to "no" (keeps
 *                 history and avoids breaking references).
 * =============================================================================
 */

/** The only tabs the admin UI is allowed to write to. */
var ADMIN_WRITE_TABS = ['Companies', 'Captains', 'HigherUps', 'Recruits', 'Topics', 'Events', 'EventSides', 'FailReasons', 'Graders', 'Settings'];

/** body = { tab, row }. Upserts the row. */
function saveRecord_(body) {
  var tab = body.tab;
  var row = body.row || {};
  if (ADMIN_WRITE_TABS.indexOf(tab) < 0) return { ok: false, error: 'Tab not editable: ' + tab };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Settings is keyed by `key`; every other tab by its first column (the id).
    var keyCol = (tab === 'Settings') ? 'key' : SCHEMA[tab][0];

    // New record on a non-Settings tab: mint an id if none was supplied.
    if (tab !== 'Settings' && !row[keyCol]) row[keyCol] = uuid_();
    if (tab === 'Settings' && !row.key) return { ok: false, error: 'Setting key required' };

    var existing = readRows_(tab).filter(function (r) { return String(r[keyCol]) === String(row[keyCol]); })[0];

    if (existing) {
      // Update only the columns we were given (that actually exist on the tab).
      Object.keys(row).forEach(function (c) {
        if (SCHEMA[tab].indexOf(c) >= 0) updateCell_(tab, existing, c, row[c]);
      });
    } else {
      appendRow_(tab, row);
    }
    return { ok: true, id: row[keyCol] };
  } finally {
    lock.releaseLock();
  }
}

/** body = { tab, id }. Soft-deletes by setting active = "no". */
function removeRecord_(body) {
  var tab = body.tab;
  if (ADMIN_WRITE_TABS.indexOf(tab) < 0) return { ok: false, error: 'Tab not editable: ' + tab };
  var idCol = SCHEMA[tab][0];
  var r = readRows_(tab).filter(function (x) { return String(x[idCol]) === String(body.id); })[0];
  if (!r) return { ok: false, error: 'Record not found' };
  if (SCHEMA[tab].indexOf('active') >= 0) updateCell_(tab, r, 'active', 'no');
  else return { ok: false, error: 'This tab has no active column to deactivate' };
  return { ok: true };
}

/* ===== 14_DemoData.gs ===== */

/**
 * 14_DemoData.gs
 * =============================================================================
 * DEMO DATA for a presentation. Run `seedDemoData()` once to wipe the CONFIG
 * tabs and fill them with a realistic department:
 *   • 14 engine companies (Engine 1–14), each with its own captain
 *   • ~4 recruits per company (Engine 9 has only 3)
 *   • 3 higher-ups
 *   • 2 topics: "SCBA" (graded individually) and "Quick Attack / Plug" (grouped,
 *     Plug has Engineer/Captain sides)
 *   • Fail-reason buttons (global + per event)
 *   • 2 graders: PIN 1234 and 2468
 *
 * SAFE: only touches CONFIG tabs. It never clears Evaluations/Sessions/etc.
 *
 * SETUP ORDER (do this once): run setupSpreadsheet() → seedDemoData() →
 * then Deploy → Manage deployments → New version.
 * =============================================================================
 */

function seedDemoData() {
  clearConfigTabs_();

  // --- 14 companies + captains ---
  var capSurnames = ['Reyes', 'Olsen', 'Doyle', 'Park', 'Nguyen', 'Carter', 'Flores',
                     'Patel', 'Ross', 'Kim', 'Hayes', 'Brooks', 'Ford', 'Wells'];
  for (var i = 1; i <= 14; i++) {
    appendRow_('Captains', { captain_id: 'cap' + i, name: 'Capt. ' + capSurnames[i - 1], email: 'captain' + i + '@firedept.example', active: 'yes' });
    appendRow_('Companies', { company_id: 'co' + i, name: 'Engine ' + i, captain_id: 'cap' + i, active: 'yes' });
  }

  // --- 3 higher-ups ---
  appendRow_('HigherUps', { higherup_id: 'h1', name: 'B/C Daniels', email: 'bc.daniels@firedept.example', active: 'yes' });
  appendRow_('HigherUps', { higherup_id: 'h2', name: 'Deputy Chief Marsh', email: 'dc.marsh@firedept.example', active: 'yes' });
  appendRow_('HigherUps', { higherup_id: 'h3', name: 'Chief Alvarez', email: 'chief.alvarez@firedept.example', active: 'yes' });

  // --- recruits (4 per company; Engine 9 only 3) ---
  var firsts = ['James', 'Maria', 'David', 'Sarah', 'Luis', 'Emily', 'Marcus', 'Olivia', 'Daniel', 'Sofia',
                'Ryan', 'Grace', 'Tyler', 'Hannah', 'Andre', 'Chloe', 'Nathan', 'Mia', 'Victor', 'Lily',
                'Caleb', 'Zoe', 'Owen', 'Ava', 'Eli', 'Nora', 'Ian', 'Ruby', 'Cole', 'Jade'];
  var lasts = ['Diaz', 'Cole', 'Pratt', 'Shaw', 'Vance', 'Reed', 'Gomez', 'Lane', 'Webb', 'Frost',
               'Nash', 'Hale', 'Boyd', 'Rhodes', 'Cruz', 'Tate', 'Quinn', 'Beck', 'Lowe', 'Mann',
               'Page', 'Sims', 'Watts', 'Hunt', 'Dean', 'Pope', 'York', 'Burke', 'Knox', 'Glenn'];
  var rid = 1;
  for (var c = 1; c <= 14; c++) {
    var count = (c === 9) ? 3 : 4;
    for (var j = 0; j < count; j++) {
      var f = firsts[(rid * 3) % firsts.length];
      var l = lasts[(rid * 7) % lasts.length];
      appendRow_('Recruits', {
        recruit_id: 'r' + rid, company_id: 'co' + c,
        first_name: f, last_name: l,
        work_email: (f + '.' + l + rid + '@firedept.example').toLowerCase(),
        active: 'yes'
      });
      rid++;
    }
  }

  // --- topic 1: SCBA (individual) ---
  appendRow_('Topics', { topic_id: 'tSCBA', name: 'SCBA', active: 'yes' });
  appendRow_('Events', { event_id: 'eSCBA', topic_id: 'tSCBA', name: 'SCBA Donning', position: 1, side_required: 'no', grade_style: 'individual', active: 'yes' });

  // --- topic 2: Quick Attack / Plug (grouped, Plug has sides) ---
  appendRow_('Topics', { topic_id: 'tQA', name: 'Quick Attack / Plug', active: 'yes' });
  appendRow_('Events', { event_id: 'eQA', topic_id: 'tQA', name: 'Quick Attack', position: 1, side_required: 'no', grade_style: 'group', active: 'yes' });
  appendRow_('Events', { event_id: 'ePlug', topic_id: 'tQA', name: 'Plug', position: 2, side_required: 'yes', grade_style: 'group', active: 'yes' });
  appendRow_('EventSides', { side_id: 'sEng', event_id: 'ePlug', name: 'Engineer', active: 'yes' });
  appendRow_('EventSides', { side_id: 'sCap', event_id: 'ePlug', name: 'Captain', active: 'yes' });

  // --- fail reasons (global + per event) ---
  appendRow_('FailReasons', { reason_id: 'fr1', event_id: '', label: 'PPE not donned', active: 'yes' });
  appendRow_('FailReasons', { reason_id: 'fr2', event_id: '', label: 'Out of sequence', active: 'yes' });
  appendRow_('FailReasons', { reason_id: 'fr3', event_id: 'eQA', label: 'Slow to charge line', active: 'yes' });
  appendRow_('FailReasons', { reason_id: 'fr4', event_id: 'ePlug', label: 'Wrong hydrant wrap', active: 'yes' });
  appendRow_('FailReasons', { reason_id: 'fr5', event_id: 'eSCBA', label: 'Over 60 seconds', active: 'yes' });
  appendRow_('FailReasons', { reason_id: 'fr6', event_id: 'eSCBA', label: 'Face seal fail', active: 'yes' });

  // --- graders (PINs) ---
  appendRow_('Graders', { grader_id: 'g1', name: 'Capt. Reyes', pin: '1234', active: 'yes' });
  appendRow_('Graders', { grader_id: 'g2', name: 'Lt. Park', pin: '2468', active: 'yes' });

  Logger.log('✅ seedDemoData complete: 14 companies, ' + (rid - 1) + ' recruits, 2 topics. Grader PINs 1234 / 2468.');
}

/** Clears data rows (keeps headers) from the CONFIG tabs only. */
function clearConfigTabs_() {
  ['Companies', 'Captains', 'HigherUps', 'Recruits', 'Topics', 'Events', 'EventSides', 'FailReasons', 'Graders'].forEach(function (tab) {
    var sh = sheetFor_(tab);
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
  });
}

/* ===== 15_Reviews.gs ===== */

/**
 * 15_Reviews.gs
 * =============================================================================
 * Memo / Peer-review SIGN-AND-RETURN workflow.
 *
 * Flow:
 *   1) Each week, a recruit below the memo % (default 65) is flagged for a MEMO;
 *      below the peer-review % (default 50) for a PEER REVIEW. The captain's
 *      report email lists them with a "Create form" link.
 *   2) The captain opens that link → a web page (served here) lists their
 *      flagged recruits. They pick one, add notes, and Send for signature.
 *   3) The recruit gets an email with a link → a page showing the memo/peer
 *      review. They check a box and type their name to sign.
 *   4) On signing, it's stored in the Reviews tab (by company + name) and the
 *      captain gets a confirmation email.
 *
 * Everything is served via doGet (GET forms, target=_top) so it works reliably
 * inside Apps Script — no CORS/iframe POST issues. Routed from 05_Api by the
 * ?page=... parameter.
 * =============================================================================
 */

/** The deployed web-app /exec URL (used for links + form actions). */
function baseUrl_() { return ScriptApp.getService().getUrl(); }

/** Context + the current week's evaluations, for flagging. */
function reviewContext_() {
  var ctx = buildContext_();
  var now = new Date();
  ctx.todayStr = Utilities.formatDate(now, ctx.tz, 'yyyy-MM-dd');
  ctx.weekStart = weekStartStr_(now, ctx.tz, setting_(ctx.settings, 'week_start_day', 'Mon'));
  ctx.weekEvals = readRows_('Evaluations').filter(function (e) {
    var d = Utilities.formatDate(new Date(e.graded_at), ctx.tz, 'yyyy-MM-dd');
    return d >= ctx.weekStart && d <= ctx.todayStr;
  });
  return ctx;
}

function recruitWeekPct_(ctx, recruitId) {
  var evs = ctx.weekEvals.filter(function (e) { return String(e.recruit_id) === String(recruitId); });
  if (!evs.length) return null;
  return scoreRows_(evs, ctx.settings).pct;
}

/** Returns 'peer_review', 'memo', or null based on the weekly %. */
function reviewTypeFor_(ctx, pct) {
  if (pct === null || pct === undefined) return null;
  var memoPct = settingNum_(ctx.settings, 'memo_threshold_pct', 65);
  var peerPct = settingNum_(ctx.settings, 'peer_review_threshold_pct', 50);
  if (pct < peerPct) return 'peer_review';
  if (pct < memoPct) return 'memo';
  return null;
}

/** The recruits in a captain's companies who are flagged this week. */
function flaggedForCaptain_(ctx, captainId) {
  var cos = ctx.companies.filter(function (c) { return String(c.captain_id) === String(captainId) && isActive_(c); });
  var out = [];
  cos.forEach(function (co) {
    ctx.recruits.filter(function (r) { return String(r.company_id) === String(co.company_id); }).forEach(function (r) {
      var pct = recruitWeekPct_(ctx, r.recruit_id);
      var t = reviewTypeFor_(ctx, pct);
      if (t) out.push({ recruit: r, company: co, pct: pct, type: t });
    });
  });
  return out;
}

function typeLabel_(t) { return t === 'peer_review' ? 'Peer Review' : 'Memo'; }

/** A small styled HTML page. `<base target="_top">` makes the GET forms
 *  navigate the whole window, not the Apps Script iframe. */
function htmlOut_(title, inner) {
  var css = 'body{font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937}' +
    'h2{margin:0 0 4px}.muted{color:#6b7280;font-size:13px}' +
    '.card{border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:16px}' +
    'label{display:block;font-size:12px;font-weight:bold;text-transform:uppercase;color:#6b7280;margin-top:12px}' +
    'input[type=text],textarea,select{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;margin-top:4px;box-sizing:border-box}' +
    'button{margin-top:16px;width:100%;padding:14px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-size:16px;font-weight:bold}' +
    '.chk{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:14px;text-transform:none;color:#1f2937;font-weight:normal}';
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_top"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>' + css + '</style><title>' + esc_(title) + '</title></head><body>' + inner + '</body></html>'
  ).setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* --------------------------- pages (via doGet) --------------------------- */

/** page=captainForm&cap=<captain_id> — the captain picks a recruit + notes. */
function captainFormPage_(p) {
  var ctx = reviewContext_();
  var cap = ctx.captainsById[p.cap];
  if (!cap) return htmlOut_('Not found', '<h2>Captain not found.</h2>');
  var flags = flaggedForCaptain_(ctx, p.cap);
  if (!flags.length) return htmlOut_('All clear', '<h2>' + esc_(cap.name) + '</h2><p class="muted">No memos or peer reviews needed this week. 🎉</p>');

  var opts = flags.map(function (f) {
    return '<option value="' + esc_(f.recruit.recruit_id) + '">' + esc_(f.recruit.first_name + ' ' + f.recruit.last_name) +
      ' — ' + (f.type === 'peer_review' ? 'PEER REVIEW' : 'MEMO') + ' (' + f.pct + '%)</option>';
  }).join('');

  var inner = '<h2>' + esc_(cap.name) + '</h2><p class="muted">Week of ' + esc_(ctx.weekStart) +
    ' · pick a recruit and send for signature.</p>' +
    '<div class="card"><form action="' + baseUrl_() + '" method="get">' +
    '<input type="hidden" name="page" value="doCreate"><input type="hidden" name="cap" value="' + esc_(p.cap) + '">' +
    '<label>Recruit</label><select name="recruit_id">' + opts + '</select>' +
    '<label>Notes (optional)</label><textarea name="notes" rows="4" placeholder="What to work on…"></textarea>' +
    '<button type="submit">Send for signature →</button></form></div>';
  return htmlOut_('Create review', inner);
}

/** page=doCreate — create the review, email the recruit a signing link. */
function createReview_(p) {
  var ctx = reviewContext_();
  var r = ctx.recruitsById[p.recruit_id];
  if (!r) return htmlOut_('Error', '<h2>Recruit not found.</h2>');
  var pct = recruitWeekPct_(ctx, p.recruit_id);
  var type = reviewTypeFor_(ctx, pct) || 'memo';
  var co = ctx.companiesById[r.company_id] || {};
  var cap = ctx.captainsById[p.cap] || {};
  var id = uuid_();

  appendRow_('Reviews', {
    review_id: id, type: type, recruit_id: r.recruit_id, recruit_name: (r.first_name + ' ' + r.last_name),
    company_id: r.company_id, company_name: co.name || '', captain_id: p.cap, captain_email: cap.email || '',
    recruit_email: r.work_email || '', week_start: ctx.weekStart, score_pct: pct, captain_notes: p.notes || '',
    status: 'sent', signed_name: '', signed_at: '', created_at: nowIso_()
  });

  var label = typeLabel_(type);
  var link = baseUrl_() + '?page=sign&id=' + id;
  if (r.work_email) {
    MailApp.sendEmail({
      to: r.work_email, name: setting_(ctx.settings, 'sender_name', 'Grading System'),
      subject: 'Action required: ' + label,
      htmlBody: '<p>Hi ' + esc_(r.first_name) + ',</p><p>You have a <b>' + esc_(label) + '</b> from ' +
        esc_(cap.name || 'your captain') + ' for the week of ' + esc_(ctx.weekStart) + ' (weekly score ' + pct + '%).</p>' +
        (p.notes ? ('<p><b>Notes:</b> ' + esc_(p.notes) + '</p>') : '') +
        '<p><a href="' + link + '" style="display:inline-block;padding:12px 18px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Review &amp; sign &rarr;</a></p>'
    });
  }
  return htmlOut_('Sent', '<h2>Sent ✓</h2><p class="muted">' + esc_(label) + ' sent to ' +
    esc_(r.first_name + ' ' + r.last_name) + ' for signature. You\'ll get an email when they sign.</p>');
}

/** page=sign&id=<review_id> — the recruit reads it and signs. */
function signPage_(p) {
  var rev = readRows_('Reviews').filter(function (x) { return x.review_id === p.id; })[0];
  if (!rev) return htmlOut_('Not found', '<h2>This link isn\'t valid.</h2>');
  var label = typeLabel_(rev.type);
  if (String(rev.status) === 'signed') return htmlOut_('Signed', '<h2>Already signed ✓</h2><p class="muted">Signed by ' + esc_(rev.signed_name) + '.</p>');

  var inner = '<h2>' + esc_(label) + '</h2><p class="muted">' + esc_(rev.recruit_name) + ' · ' + esc_(rev.company_name) +
    ' · week of ' + esc_(rev.week_start) + ' · ' + esc_(String(rev.score_pct)) + '%</p>' +
    '<div class="card">' + (rev.captain_notes ? ('<p><b>From your captain:</b><br>' + esc_(rev.captain_notes) + '</p>') : '<p class="muted">No additional notes.</p>') +
    '<form action="' + baseUrl_() + '" method="get"><input type="hidden" name="page" value="doSign"><input type="hidden" name="id" value="' + esc_(p.id) + '">' +
    '<label class="chk"><input type="checkbox" name="ack" value="yes" required> I acknowledge this ' + esc_(label.toLowerCase()) + '.</label>' +
    '<label>Type your full name to sign</label><input type="text" name="signed_name" required placeholder="Your name">' +
    '<button type="submit">Sign &amp; return</button></form></div>';
  return htmlOut_('Sign ' + label, inner);
}

/** page=doSign — record the signature, email the captain. */
function signReview_(p) {
  var rev = readRows_('Reviews').filter(function (x) { return x.review_id === p.id; })[0];
  if (!rev) return htmlOut_('Not found', '<h2>This link isn\'t valid.</h2>');
  if (String(rev.status) === 'signed') return htmlOut_('Signed', '<h2>Already signed ✓</h2>');
  var name = String(p.signed_name || '').trim();
  if (!name || p.ack !== 'yes') {
    return htmlOut_('Incomplete', '<h2>Please check the box and type your name.</h2><p><a href="' + baseUrl_() + '?page=sign&id=' + esc_(p.id) + '">Go back</a></p>');
  }
  updateCell_('Reviews', rev, 'status', 'signed');
  updateCell_('Reviews', rev, 'signed_name', name);
  updateCell_('Reviews', rev, 'signed_at', nowIso_());

  var label = typeLabel_(rev.type);
  if (rev.captain_email) {
    MailApp.sendEmail({
      to: rev.captain_email, subject: 'Signed: ' + label + ' — ' + rev.recruit_name,
      htmlBody: '<p>' + esc_(rev.recruit_name) + ' (' + esc_(rev.company_name) + ') signed their <b>' + esc_(label) + '</b>.</p>'
    });
  }
  return htmlOut_('Thank you', '<h2>Signed ✓</h2><p class="muted">Thank you, ' + esc_(name) +
    '. Your ' + esc_(label.toLowerCase()) + ' has been returned to ' + esc_(rev.company_name) + '\'s captain and recorded.</p>');
}
