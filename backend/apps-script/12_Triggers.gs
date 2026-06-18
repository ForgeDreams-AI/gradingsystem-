/**
 * 12_Triggers.gs
 * =============================================================================
 * Schedules the daily report job.
 *
 *   installDailyTrigger() — reads report_time from Settings and creates a
 *                           time-based trigger that runs sendDailyReports()
 *                           once a day near that hour. Run this once (and again
 *                           if you change report_time). Safe to re-run; it
 *                           clears old copies first.
 *
 *   runReportsNow()       — fire the report job immediately, for testing.
 *                           (It still respects the send-day / data-day gates.)
 *
 * Time zone: triggers fire in the PROJECT timezone, which the manifest
 * (appsscript.json) pins to America/Phoenix. Keep them in sync.
 * =============================================================================
 */

/** Create (or recreate) the once-a-day trigger at the configured report_time. */
function installDailyTrigger() {
  removeDailyTriggers_();

  var s = getSettings_();
  var parts = String(setting_(s, 'report_time', '13:00')).split(':');
  var hour = Number(parts[0]);
  var minute = Number(parts[1] || 0);

  ScriptApp.newTrigger('sendDailyReports')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .nearMinute(minute)
    .create();

  Logger.log('✅ Daily trigger installed for ~' + hour + ':' + (minute < 10 ? '0' : '') + minute +
    ' ' + setting_(s, 'timezone', 'America/Phoenix'));
}

/** Remove any existing sendDailyReports triggers so we don't stack duplicates. */
function removeDailyTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyReports') ScriptApp.deleteTrigger(t);
  });
}

/** Manual test: run the report job right now. */
function runReportsNow() {
  sendDailyReports();
}
