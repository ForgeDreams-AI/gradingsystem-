/**
 * 11_Email.gs
 * =============================================================================
 * Turns report HTML into a PDF and emails it, then records the send in SendLog.
 * The SendLog also makes sends idempotent: if the daily job runs twice on the
 * same date, a recipient who already got their email is skipped.
 *
 * Email is sent with Gmail's built-in MailApp (no external service, no API key).
 * Daily quota is ~100 recipients on consumer Gmail / ~1500 on Workspace — plenty
 * here, but worth knowing if the roster ever gets huge.
 * =============================================================================
 */

/** Convert an HTML string into a downloadable PDF blob named <name>.pdf. */
function htmlToPdf_(html, name) {
  return Utilities
    .newBlob(html, 'text/html', name + '.html')
    .getAs('application/pdf')
    .setName(name + '.pdf');
}

/**
 * Send one report. Skips if there's no email, or if we already sent to this
 * recipient on this run date. Always writes a SendLog row (sent/skipped/error).
 *
 * recipientType: 'recruit' | 'captain' | 'higherup'
 * recipientId:   the id of that person/company (used for the idempotency check)
 */
function sendReportEmail_(toEmail, subject, html, pdfBlob, recipientType, recipientId, runDate) {
  if (!toEmail) {
    logSend_(runDate, recipientType, recipientId, '', 'skipped', 'no email on file');
    return;
  }

  var already = readRows_('SendLog').some(function (l) {
    return l.run_date === runDate &&
           l.recipient_type === recipientType &&
           String(l.recipient_id) === String(recipientId) &&
           l.status === 'sent';
  });
  if (already) {
    logSend_(runDate, recipientType, recipientId, toEmail, 'skipped', 'already sent today');
    return;
  }

  var senderName = setting_(getSettings_(), 'sender_name', 'Grading System');
  try {
    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      htmlBody: html,
      name: senderName,
      attachments: pdfBlob ? [pdfBlob] : []
    });
    logSend_(runDate, recipientType, recipientId, toEmail, 'sent', subject);
  } catch (err) {
    logSend_(runDate, recipientType, recipientId, toEmail, 'error', String(err));
  }
}

/** Append a row to SendLog. */
function logSend_(runDate, type, id, email, status, detail) {
  appendRow_('SendLog', {
    id: uuid_(), run_date: runDate, recipient_type: type, recipient_id: id,
    email: email, status: status, detail: detail || '', sent_at: nowIso_()
  });
}
