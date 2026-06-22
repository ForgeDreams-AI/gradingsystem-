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
