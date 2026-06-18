/**
 * 05_Api.gs
 * =============================================================================
 * The web-app entry points. Apps Script calls doGet() for GET requests and
 * doPost() for POST requests to your deployed /exec URL. Everything returns
 * JSON of the shape { ok: true, ... } or { ok: false, error: "..." }.
 *
 * CORS NOTE (important for the GitHub Pages front-end):
 *   Apps Script web apps can't set custom CORS headers, and they don't answer
 *   the browser's OPTIONS preflight. To stay a "simple request" (no preflight),
 *   the front-end must POST with Content-Type: text/plain and put the JSON in
 *   the body. We just JSON.parse() that body below. GETs are unaffected.
 * =============================================================================
 */

/**
 * GET handler. Supported actions (?action=...):
 *   ping     → health check
 *   config   → full config payload for the app
 *   roster   → recruits for ?company_ids=c1,c2
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'ping';
    switch (action) {
      case 'ping':
        return json_({ ok: true, service: 'grading', time: nowIso_() });
      case 'config':
        return json_({ ok: true, config: getConfigPayload_() });
      case 'roster':
        var ids = String((e.parameter && e.parameter.company_ids) || '')
          .split(',').filter(String);
        return json_({ ok: true, recruits: rosterFor_(ids) });
      default:
        return json_({ ok: false, error: 'Unknown GET action: ' + action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * POST handler. The body is a JSON string with an "action" field. Supported:
 *   login        → { pin }
 *   startSession → { grader_id, topic_id, company_ids[] }
 *   submitGroup  → { session_id, client_submit_id, grader_id, items[] }
 *   swapCompany  → { session_id, remove_company_id?, add_company_id? }
 *   endSession   → { session_id }
 */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'login':        return json_(login_(body));
      case 'startSession': return json_(startSession_(body));
      case 'submitGroup':  return json_(submitGroup_(body));
      case 'swapCompany':  return json_(swapCompany_(body));
      case 'endSession':   return json_(endSession_(body));
      default:             return json_({ ok: false, error: 'Unknown POST action: ' + body.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Wrap any object as a JSON HTTP response. */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
