/**
 * 04_Config.gs
 * =============================================================================
 * Reads the Settings tab and assembles the "config payload" the front-end app
 * downloads on launch (so NOTHING is hard-coded in the UI — every company,
 * topic, reason, color and label comes from the Sheet).
 * =============================================================================
 */

/** Read the Settings tab into a simple { key: value } object. */
function getSettings_() {
  var map = {};
  readRows_('Settings').forEach(function (r) { map[String(r.key)] = r.value; });
  return map;
}

/** Get one setting from a settings map, falling back to a default. */
function setting_(map, key, def) {
  var v = map[key];
  return (v === undefined || v === null || v === '') ? def : v;
}

/** Same as setting_, but coerced to a Number. */
function settingNum_(map, key, def) {
  return Number(setting_(map, key, def));
}

/**
 * Everything the app needs to render itself. Note we deliberately DO NOT send
 * grader PINs to the browser — only id + name. PIN checking happens server-side
 * in 06_Auth.gs.
 */
function getConfigPayload_() {
  return {
    settings:    getSettings_(),
    colors:      BAND_COLORS,
    companies:   clean_(readRows_('Companies').filter(isActive_)),
    captains:    clean_(readRows_('Captains').filter(isActive_)),
    higherUps:   clean_(readRows_('HigherUps').filter(isActive_)),
    recruits:    clean_(readRows_('Recruits').filter(isActive_)),
    topics:      clean_(readRows_('Topics').filter(isActive_)),
    events:      clean_(readRows_('Events').filter(isActive_)),
    eventSides:  clean_(readRows_('EventSides').filter(isActive_)),
    failReasons: clean_(readRows_('FailReasons').filter(isActive_)),
    graders:     readRows_('Graders').filter(isActive_).map(function (g) {
      return { grader_id: g.grader_id, name: g.name }; // PIN intentionally omitted
    })
  };
}

/** Active recruits belonging to any of the given company ids. */
function rosterFor_(companyIds) {
  var set = {};
  companyIds.forEach(function (c) { set[String(c)] = true; });
  return clean_(readRows_('Recruits').filter(isActive_).filter(function (r) {
    return set[String(r.company_id)];
  }));
}
