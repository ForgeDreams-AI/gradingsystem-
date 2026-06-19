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
