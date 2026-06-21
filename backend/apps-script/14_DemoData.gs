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
