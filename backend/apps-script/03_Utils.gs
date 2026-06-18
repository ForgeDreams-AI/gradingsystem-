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
