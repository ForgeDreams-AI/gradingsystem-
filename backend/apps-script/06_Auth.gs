/**
 * 06_Auth.gs
 * =============================================================================
 * Grader sign-in. Graders are the ONLY people who log in. They type a PIN; we
 * match it against the Graders tab here on the server so the PIN list never
 * leaves the spreadsheet.
 *
 * NOTE: PINs are stored in plain text in the Sheet for simplicity (this is a
 * low-stakes field tool, not a bank). If you ever need more security, hash the
 * PINs and compare hashes here.
 * =============================================================================
 */

/** body = { pin }. Returns the matching grader (id + name) or an error. */
function login_(body) {
  var pin = String(body.pin || '').trim();
  if (!pin) return { ok: false, error: 'PIN required' };

  var grader = readRows_('Graders').filter(isActive_).filter(function (g) {
    return String(g.pin).trim() === pin;
  })[0];

  if (!grader) return { ok: false, error: 'Invalid PIN' };
  return { ok: true, grader: { grader_id: grader.grader_id, name: grader.name } };
}
