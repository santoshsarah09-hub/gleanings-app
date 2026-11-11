/**
 * Gleanings — standalone server (Google Apps Script)
 * Paste this whole file into Code.gs. You paste it once; app updates arrive
 * through GitHub without touching this file.
 *
 * Where things live:
 *  - The app screens: loaded from GitHub (APP_URL below).
 *  - Ordinary notes: the "Gleanings Data (app storage)" sheet in your Gleanings folder.
 *  - PRIVATE notes and patient/family follow-ups: your private script settings
 *    (Apps Script UserProperties). Never in Drive, so no other tool or scheduled
 *    task that searches your Drive can see them.
 *  - Your Anthropic API key: your private script settings. Never in Drive, never in the page.
 */
const CFG = {
  TZ: 'America/Chicago',
  GLEAN_FOLDER: '1EC02ubL2DXM0aU_jw3XvegoKR7i-3DP6',        // Gleanings folder in Drive
  APP_URL: 'https://raw.githubusercontent.com/santoshsarah09-hub/gleanings-app/main/index.html',
  MODELS: { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-sonnet-5-5' },
  API: 'https://api.anthropic.com/v1/messages'
};

/* ------------------------------------------------------------------ page */
function doGet() {
  let html;
  try {
    const r = UrlFetchApp.fetch(CFG.APP_URL + '?v=' + Math.floor(Date.now() / 60000), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('GitHub answered ' + r.getResponseCode());
    html = r.getContentText();
  } catch (e) {
    html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;padding:24px">' +
      '<h2>Gleanings could not load</h2><p>' + String(e).replace(/</g, '&lt;') + '</p>' +
      '<p>Check that the GitHub repository <b>santoshsarah09-hub/gleanings-app</b> exists, is public, and has index.html.</p></body>';
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle('Gleanings')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/* ---------------------------------------------------------------- status */
function getStatus() {
  const up = PropertiesService.getUserProperties();
  return JSON.stringify({
    hasKey: provider_() === 'gemini' ? true : !!up.getProperty('ANTHROPIC_KEY'),
    provider: provider_(),
    hasAnthropicKey: !!up.getProperty('ANTHROPIC_KEY'),
    hasGeminiKey: !!up.getProperty('GEMINI_KEY'),
    url: ScriptApp.getService().getUrl(),
    email: Session.getActiveUser().getEmail(),
    usage: JSON.parse(up.getProperty('usage_' + month_()) || '{}'),
    privateBytes: privateBytes_()
  });
}
function setKey(key) {
  key = String(key || '').replace(/[\s​-‍﻿]+/g, ''); // drop spaces, line breaks and invisible characters from phone pasting
  if (!/^sk-ant-/.test(key)) throw new Error('[bad_request] That does not look like an Anthropic API key (it starts with sk-ant-api03-).');
  const shape = 'Your key starts with ' + key.slice(0, 13) + '… and is ' + key.length + ' characters long. ';
  let last = '';
  for (const model of [CFG.MODELS.quick, CFG.MODELS.default]) {
    const r = UrlFetchApp.fetch(CFG.API, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: model, max_tokens: 5, messages: [{ role: 'user', content: 'Say ok' }] })
    });
    const c = r.getResponseCode();
    let why = '';
    try { const j = JSON.parse(r.getContentText()); why = (j.error && (j.error.type + ': ' + j.error.message)) || ''; } catch (e) { why = r.getContentText().slice(0, 200); }
    if (c < 400 || c === 429 || c === 529) {
      PropertiesService.getUserProperties().setProperty('ANTHROPIC_KEY', key);
      return 'ok';
    }
    last = 'Anthropic answered ' + c + ' (' + why + '). ' + shape;
    if (c === 404) continue; // that model is not available to this key; try the next one
    if (c === 401) throw new Error('[not_granted] ' + last + 'A 401 means the key itself is wrong, disabled or deleted: check it says Active in Settings → API keys, or create a new one.');
    if (c === 403) throw new Error('[not_granted] ' + last + 'A 403 means the account is not allowed yet: check Billing has credit and any verification is finished.');
    if (c === 400 && /credit|billing|balance/i.test(why)) throw new Error('[not_granted] ' + last + 'Add credit under Settings → Billing, then try again.');
    throw new Error('[tool_error] ' + last);
  }
  throw new Error('[tool_error] ' + last);
}
function clearKey() { PropertiesService.getUserProperties().deleteProperty('ANTHROPIC_KEY'); return 'ok'; }

/* -------------------------------------------------------------------- AI */
function aiCall(reqJson) {
  const req = JSON.parse(reqJson);
  if (provider_() === 'gemini') return geminiCall_(req);
  const key = PropertiesService.getUserProperties().getProperty('ANTHROPIC_KEY');
  if (!key) throw new Error('[not_granted] Add your Anthropic API key in Settings.');
  const body = {
    model: CFG.MODELS[req.tier] || CFG.MODELS.default,
    max_tokens: req.max_tokens || 4096,
    messages: req.messages
  };
  if (req.system) body.system = req.system;
  if (req.tools && req.tools.length) body.tools = req.tools;
  const r = UrlFetchApp.fetch(CFG.API, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body)
  });
  const code = r.getResponseCode(), text = r.getContentText();
  if (code === 401 || code === 403) throw new Error('[not_granted] Your API key was rejected. Check it in Settings.');
  if (code === 429 || code === 529) throw new Error('[rate_limited] The AI is busy. Try again in a minute.');
  if (code >= 400) throw new Error('[tool_error] AI error ' + code + ': ' + text.slice(0, 300));
  const out = JSON.parse(text);
  try { // keep a simple monthly token count per model
    const up = PropertiesService.getUserProperties(), k = 'usage_' + month_();
    const u = JSON.parse(up.getProperty(k) || '{}'), m = body.model;
    u[m] = u[m] || { in: 0, out: 0, calls: 0 };
    u[m].in += (out.usage && out.usage.input_tokens) || 0;
    u[m].out += (out.usage && out.usage.output_tokens) || 0;
    u[m].calls += 1;
    up.setProperty(k, JSON.stringify(u));
  } catch (e) {}
  return JSON.stringify(out);
}

/* ------------------------------------------- Drive, Docs, Calendar bridge */
function mcpCall(server, tool, inputJson) {
  const i = JSON.parse(inputJson || '{}');
  try {
    return JSON.stringify(route_(server, tool, i));
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/^\[\w+\]/.test(msg)) throw e;
    throw new Error('[tool_error] ' + msg);
  }
}
function route_(server, tool, i) {
  const t = server + '/' + tool;
  switch (t) {
    case 'Google Drive/search_files': return driveSearch_(i);
    case 'Google Drive/read_file_content': return driveRead_(i.fileId);
    case 'Google Docs/read_doc': return { content: Docs.Documents.get(i.documentId, { includeTabsContent: true }) };
    case 'Google Docs/update_doc': {
      const req = { requests: i.requests };
      if (i.writeControl) req.writeControl = i.writeControl;
      const res = Docs.Documents.batchUpdate(req, i.documentId);
      return { replies: [{ api_replies: res.replies || [] }] };
    }
    case 'Google Calendar/create_event': {
      const ev = {
        summary: i.summary, description: i.description || '',
        start: { dateTime: i.startTime, timeZone: CFG.TZ }, end: { dateTime: i.endTime, timeZone: CFG.TZ }
      };
      if (i.visibility) ev.visibility = i.visibility;
      if (i.colorId) ev.colorId = i.colorId;
      if (i.overrideReminders) ev.reminders = { useDefault: false, overrides: i.overrideReminders };
      if (i.recurrenceData && i.recurrenceData.length) ev.recurrence = i.recurrenceData; // repeating Study reminders
      if (i.availability === 'AVAILABILITY_FREE') ev.transparency = 'transparent';
      return Calendar.Events.insert(ev, i.calendarId || 'primary', { sendUpdates: 'none' });
    }
    case 'Google Calendar/update_event': {
      const p = {};
      ['summary', 'description', 'visibility'].forEach(function (k) { if (i[k] != null) p[k] = i[k]; });
      if (i.colorId) p.colorId = i.colorId;
      if (i.startTime) p.start = { dateTime: i.startTime, timeZone: CFG.TZ };
      if (i.endTime) p.end = { dateTime: i.endTime, timeZone: CFG.TZ };
      return Calendar.Events.patch(p, i.calendarId || 'primary', i.eventId, { sendUpdates: 'none' });
    }
    case 'Google Calendar/list_events': {
      const o = { singleEvents: true, maxResults: Math.min(i.pageSize || 100, 250) };
      if (i.startTime) o.timeMin = iso_(i.startTime);
      if (i.endTime) o.timeMax = iso_(i.endTime);
      if (i.orderBy === 'startTime') o.orderBy = 'startTime';
      if (i.fullText) o.q = i.fullText;
      const r = Calendar.Events.list(i.calendarId || 'primary', o);
      return { events: (r.items || []) };
    }
    case 'Google Calendar/delete_event':
      Calendar.Events.remove(i.calendarId || 'primary', i.eventId, { sendUpdates: 'none' });
      return { id: i.eventId, status: 'cancelled' };
  }
  throw new Error('[tool_error] Unknown call ' + t);
}
function driveSearch_(i) {
  let q = String(i.query || '')
    .replace(/\btitle\s+contains\b/g, 'name contains')
    .replace(/\btitle\s*=\s*/g, 'name = ')
    .replace(/\btitle\s*!=\s*/g, 'name != ')
    .replace(/parentId\s*=\s*'([^']+)'/g, "'$1' in parents");
  if (!/trashed/.test(q)) q = '(' + q + ') and trashed = false';
  const r = Drive.Files.list({ q: q, pageSize: Math.min(i.pageSize || 20, 100), fields: 'files(id,name,mimeType,modifiedTime,webViewLink,trashed,parents)' });
  return {
    files: (r.files || []).map(function (f) {
      return { id: f.id, title: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, viewUrl: f.webViewLink, trashed: !!f.trashed, parentId: f.parents && f.parents[0] };
    })
  };
}
function driveRead_(id) {
  const f = Drive.Files.get(id, { fields: 'id,name,mimeType,webViewLink' });
  const tok = ScriptApp.getOAuthToken();
  const ex = { 'application/vnd.google-apps.document': 'text/markdown', 'application/vnd.google-apps.spreadsheet': 'text/csv', 'application/vnd.google-apps.presentation': 'text/plain' }[f.mimeType];
  let text = '';
  if (ex) {
    const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=' + encodeURIComponent(ex),
      { headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) text = r.getContentText();
    else if (ex === 'text/markdown') text = DocumentApp.openById(id).getBody().getText();
  } else if (/^text\//.test(f.mimeType)) {
    text = DriveApp.getFileById(id).getBlob().getDataAsString();
  }
  return { fileContent: text, title: f.name, viewUrl: f.webViewLink };
}

/* --------------------------------------------------------------- storage */
// Ordinary notes -> sheet. Private notes and patient/family follow-ups -> UserProperties (never Drive).
function isPrivate_(n) { return !!(n.private || (n.kind === 'Follow-up' && n.calPrivate !== false)); }
function sheet_() {
  const sp = PropertiesService.getScriptProperties();
  let id = sp.getProperty('SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Gleanings Data (app storage)');
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(CFG.GLEAN_FOLDER));
    const sh = ss.getSheets()[0];
    sh.setName('notes');
    sh.getRange(1, 1, 1, 3).setValues([['id', 'updated', 'json (do not edit by hand)']]);
    sh.setFrozenRows(1);
    sp.setProperty('SHEET_ID', ss.getId());
  }
  return ss.getSheetByName('notes') || ss.getSheets()[0];
}
const CELL = 45000;
function rowOf_(sh, id) {
  const f = sh.getRange('A:A').createTextFinder(id).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}
function sheetGetAll_() {
  const sh = sheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  const w = Math.max(3, sh.getLastColumn());
  return sh.getRange(2, 1, last - 1, w).getValues().filter(function (r) { return r[0]; }).map(function (r) {
    try { return JSON.parse(r.slice(2).join('')); } catch (e) { return null; }
  }).filter(Boolean);
}
function sheetPut_(n) {
  const sh = sheet_(), json = JSON.stringify(n), parts = [];
  for (let k = 0; k < json.length; k += CELL) parts.push(json.slice(k, k + CELL));
  const row = [n.id, new Date()].concat(parts);
  let r = rowOf_(sh, n.id);
  if (!r) { r = sh.getLastRow() + 1; }
  else { const w = sh.getLastColumn(); if (w > 2) sh.getRange(r, 3, 1, w - 2).clearContent(); }
  sh.getRange(r, 1, 1, row.length).setValues([row]);
}
function sheetDel_(id) { const sh = sheet_(), r = rowOf_(sh, id); if (r) sh.deleteRow(r); }

const PCH = 8500;
function privKeys_() { return PropertiesService.getUserProperties().getKeys().filter(function (k) { return /^p_[^#]+$/.test(k); }); }
function privGet_(id) {
  const up = PropertiesService.getUserProperties(), head = up.getProperty('p_' + id);
  if (head == null) return null;
  const m = head.match(/^#chunks:(\d+)$/);
  let json = head;
  if (m) { json = ''; for (let k = 0; k < +m[1]; k++) json += up.getProperty('p_' + id + '#' + k) || ''; }
  try { return JSON.parse(json); } catch (e) { return null; }
}
function privPut_(n) {
  privDel_(n.id);
  const up = PropertiesService.getUserProperties(), json = JSON.stringify(n);
  if (json.length <= PCH) { up.setProperty('p_' + n.id, json); return; }
  const o = {}; let k = 0;
  for (let s = 0; s < json.length; s += PCH, k++) o['p_' + n.id + '#' + k] = json.slice(s, s + PCH);
  o['p_' + n.id] = '#chunks:' + k;
  up.setProperties(o);
}
function privDel_(id) {
  const up = PropertiesService.getUserProperties(), head = up.getProperty('p_' + id);
  if (head == null) return;
  const m = head.match(/^#chunks:(\d+)$/);
  if (m) for (let k = 0; k < +m[1]; k++) up.deleteProperty('p_' + id + '#' + k);
  up.deleteProperty('p_' + id);
}
function privateBytes_() {
  const p = PropertiesService.getUserProperties().getProperties(); let b = 0;
  Object.keys(p).forEach(function (k) { if (/^p_/.test(k)) b += k.length + p[k].length; });
  return b;
}
function withLock_(fn) {
  const l = LockService.getUserLock(); l.waitLock(20000);
  try { return fn(); } finally { l.releaseLock(); }
}
function save_(n) {
  if (isPrivate_(n)) { privPut_(n); sheetDel_(n.id); }
  else { sheetPut_(n); privDel_(n.id); }
}
function find_(id) {
  const p = privGet_(id); if (p) return p;
  const sh = sheet_(), r = rowOf_(sh, id); if (!r) return null;
  const w = sh.getLastColumn(), v = sh.getRange(r, 1, 1, w).getValues()[0];
  try { return JSON.parse(v.slice(2).join('')); } catch (e) { return null; }
}

function dbList() {
  const all = sheetGetAll_();
  privKeys_().forEach(function (k) { const n = privGet_(k.slice(2)); if (n) all.push(n); });
  return JSON.stringify(all);
}
function dbAdd(json) {
  return withLock_(function () {
    const n = JSON.parse(json);
    n.id = n.id || ('n' + Utilities.getUuid().replace(/-/g, '').slice(0, 14));
    save_(n); return n.id;
  });
}
function dbSet(id, json) { return withLock_(function () { const n = JSON.parse(json); n.id = id; save_(n); return id; }); }
function dbUpdate(id, patchJson) {
  return withLock_(function () {
    const cur = find_(id); if (!cur) throw new Error('[not_found] That note no longer exists.');
    const n = Object.assign(cur, JSON.parse(patchJson)); n.id = id; save_(n); return id;
  });
}
function dbDelete(id) { return withLock_(function () { privDel_(id); sheetDel_(id); return id; }); }
function dbImport(arrJson) {
  return withLock_(function () {
    const arr = JSON.parse(arrJson); let k = 0;
    arr.forEach(function (n) { if (n && n.id) { save_(n); k++; } });
    return k;
  });
}

/* ---------------------------------------------------------------- photos */
function photoFolder_() {
  const sp = PropertiesService.getScriptProperties(); let id = sp.getProperty('PHOTO_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.getFolderById(CFG.GLEAN_FOLDER).createFolder('Gleanings Photos (app)');
  sp.setProperty('PHOTO_FOLDER', f.getId()); return f;
}
function assetUpload(b64, type, name) {
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), type || 'image/jpeg', name || ('page-' + Date.now() + '.jpg'));
  const f = photoFolder_().createFile(blob);
  return JSON.stringify({ id: f.getId(), url: 'https://drive.google.com/thumbnail?sz=w1600&id=' + f.getId(), sizeBytes: blob.getBytes().length, contentType: blob.getContentType() });
}
function assetDelete(id) { DriveApp.getFileById(id).setTrashed(true); return 'ok'; } // trash, never permanent delete

/* --------------------------------------------------------------- helpers */
function iso_(s) {
  s = String(s);
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return new Date(s).toISOString();
  return Utilities.parseDate(s.slice(0, 19).replace(/(T\d\d:\d\d)$/, '$1:00'), CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss").toISOString();
}
function month_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM'); }

/* Run this once from the editor (select "setup", press Run) to grant access. */
function setup() { sheet_(); photoFolder_(); return getStatus(); }

/* ------------------------------------------------------------ Gemini (optional AI provider) */
const GEM = {
  BASE: 'https://generativelanguage.googleapis.com/v1beta/models/',
  MODELS: { quick: 'gemini-3.1-flash-lite-preview', default: 'gemini-3-flash-preview', complex: 'gemini-3-flash-preview' },
  FALLBACK: 'gemini-2.5-flash'
};
function provider_() {
  const up = PropertiesService.getUserProperties();
  return up.getProperty('AI_PROVIDER') === 'gemini' && up.getProperty('GEMINI_KEY') ? 'gemini' : 'anthropic';
}
function gemFetch_(model, key, body) {
  return UrlFetchApp.fetch(GEM.BASE + model + ':generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body)
  });
}
function setGeminiKey(key) {
  key = String(key || '').replace(/[\s​-‍﻿]+/g, '');
  if (key.length < 20) throw new Error('[bad_request] That does not look like a Gemini API key. Create one at aistudio.google.com → Get API key.');
  const body = { contents: [{ role: 'user', parts: [{ text: 'Say ok' }] }], generationConfig: { maxOutputTokens: 20 } };
  let last = '';
  for (const model of [GEM.MODELS.default, GEM.FALLBACK]) {
    const r = gemFetch_(model, key, body), c = r.getResponseCode();
    let why = ''; try { const j = JSON.parse(r.getContentText()); why = (j.error && j.error.message) || ''; } catch (e) { why = r.getContentText().slice(0, 200); }
    if (c < 400 || c === 429) {
      const up = PropertiesService.getUserProperties();
      up.setProperty('GEMINI_KEY', key); up.setProperty('AI_PROVIDER', 'gemini');
      return 'ok';
    }
    last = 'Google answered ' + c + ' (' + why.slice(0, 160) + '). ';
    if (c === 404) continue;
    if (c === 400 && /API key/i.test(why)) throw new Error('[not_granted] ' + last + 'The key looks wrong. Copy it again from aistudio.google.com.');
    if (c === 401 || c === 403) throw new Error('[not_granted] ' + last + 'The key was rejected or is not allowed for this model.');
    throw new Error('[tool_error] ' + last);
  }
  throw new Error('[tool_error] ' + last);
}
function clearGeminiKey() {
  const up = PropertiesService.getUserProperties();
  up.deleteProperty('GEMINI_KEY'); up.deleteProperty('AI_PROVIDER'); return 'ok';
}
function setProvider(p) {
  const up = PropertiesService.getUserProperties();
  if (p === 'gemini') {
    if (!up.getProperty('GEMINI_KEY')) throw new Error('[bad_request] Add a Gemini key first.');
    up.setProperty('AI_PROVIDER', 'gemini');
  } else up.setProperty('AI_PROVIDER', 'anthropic');
  return 'ok';
}
function gemSchema_(s) {
  if (!s || typeof s !== 'object') return s;
  if (Array.isArray(s)) return s.map(gemSchema_);
  const out = {};
  Object.keys(s).forEach(function (k) {
    if (['additionalProperties', '$schema', 'default', 'examples', 'title', '$id', 'definitions', '$defs'].indexOf(k) >= 0) return;
    let v = s[k];
    if (k === 'type') {
      if (Array.isArray(v)) { const nn = v.filter(function (t) { return t !== 'null'; }); if (v.length > nn.length) out.nullable = true; v = nn[0] || 'string'; }
      out.type = String(v).toUpperCase(); return;
    }
    if (k === 'properties') { out.properties = {}; Object.keys(v).forEach(function (p) { out.properties[p] = gemSchema_(v[p]); }); return; }
    out[k] = gemSchema_(v);
  });
  return out;
}
function geminiCall_(req) {
  const up = PropertiesService.getUserProperties(), key = up.getProperty('GEMINI_KEY');
  const names = {};
  (req.messages || []).forEach(function (m) { if (Array.isArray(m.content)) m.content.forEach(function (b) { if (b.type === 'tool_use') names[b.id] = b.name; }); });
  const contents = (req.messages || []).map(function (m) {
    const parts = [];
    if (typeof m.content === 'string') parts.push({ text: m.content });
    else (m.content || []).forEach(function (b) {
      if (b.type === 'text') parts.push({ text: b.text || '' });
      else if (b.type === 'image' && b.source) parts.push({ inlineData: { mimeType: b.source.media_type || 'image/jpeg', data: b.source.data } });
      else if (b.type === 'tool_use') { const p = { functionCall: { name: b.name, args: b.input || {} } }; if (b._sig) p.thoughtSignature = b._sig; parts.push(p); }
      else if (b.type === 'tool_result') {
        let resp; try { resp = JSON.parse(b.content); } catch (e) { resp = b.content; }
        if (resp === null || typeof resp !== 'object' || Array.isArray(resp)) resp = { result: resp };
        parts.push({ functionResponse: { name: names[b.tool_use_id] || 'tool', response: resp } });
      }
    });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts.length ? parts : [{ text: '' }] };
  });
  const body = { contents: contents, generationConfig: { maxOutputTokens: req.max_tokens || 4096 } };
  if (req.system) body.systemInstruction = { parts: [{ text: typeof req.system === 'string' ? req.system : JSON.stringify(req.system) }] };
  if (req.tools && req.tools.length) body.tools = [{ functionDeclarations: req.tools.map(function (t) {
    const d = { name: t.name, description: t.description || t.name };
    const sc = gemSchema_(t.input_schema);
    if (sc && sc.properties && Object.keys(sc.properties).length) d.parameters = sc;
    return d;
  }) }];
  let model = GEM.MODELS[req.tier] || GEM.MODELS.default;
  let r = gemFetch_(model, key, body);
  if (r.getResponseCode() === 404 && model !== GEM.FALLBACK) { model = GEM.FALLBACK; r = gemFetch_(model, key, body); }
  const code = r.getResponseCode(), text = r.getContentText();
  if (code === 400 && /API key/i.test(text)) throw new Error('[not_granted] Your Gemini key was rejected. Check it in Settings.');
  if (code === 401 || code === 403) throw new Error('[not_granted] Your Gemini key was rejected. Check it in Settings.');
  if (code === 429 || code === 503) throw new Error('[rate_limited] The AI is busy or the free limit was reached. Try again in a minute.');
  if (code >= 400) throw new Error('[tool_error] AI error ' + code + ': ' + text.slice(0, 300));
  const j = JSON.parse(text), cand = j.candidates && j.candidates[0];
  if (!cand || !cand.content || !cand.content.parts) throw new Error('[tool_error] Gemini returned no answer' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (' + j.promptFeedback.blockReason + ')' : '') + '.');
  const content = []; let tool = false;
  cand.content.parts.forEach(function (p) {
    if (p.thought) return;
    if (p.functionCall) { tool = true; content.push({ type: 'tool_use', id: 'g' + Utilities.getUuid().slice(0, 12), name: p.functionCall.name, input: p.functionCall.args || {}, _sig: p.thoughtSignature }); }
    else if (typeof p.text === 'string' && p.text) content.push({ type: 'text', text: p.text });
  });
  const um = j.usageMetadata || {};
  const out = { content: content, stop_reason: tool ? 'tool_use' : (cand.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn'),
    usage: { input_tokens: um.promptTokenCount || 0, output_tokens: (um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0) } };
  try {
    const k = 'usage_' + month_(), u = JSON.parse(up.getProperty(k) || '{}');
    u[model] = u[model] || { in: 0, out: 0, calls: 0 };
    u[model].in += out.usage.input_tokens; u[model].out += out.usage.output_tokens; u[model].calls += 1;
    up.setProperty(k, JSON.stringify(u));
  } catch (e) {}
  return JSON.stringify(out);
}
