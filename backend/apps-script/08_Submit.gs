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
