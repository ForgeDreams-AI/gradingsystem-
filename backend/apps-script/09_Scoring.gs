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
