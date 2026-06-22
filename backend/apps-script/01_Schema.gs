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
