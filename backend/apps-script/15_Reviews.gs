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
