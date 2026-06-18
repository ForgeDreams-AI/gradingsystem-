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
