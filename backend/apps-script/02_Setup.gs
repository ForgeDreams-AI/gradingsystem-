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
