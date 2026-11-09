'use strict';

const fs = require('node:fs');

/** Lists given as commas or new lines. */
const list = (v) =>
  String(v || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Replaces {{name}} style fields; unknown fields become empty. */
const fill = (template, values) => String(template).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => (values[k.toLowerCase()] ?? '').toString());

/** What a release (or other event) can put in the text. */
function eventValues(env, event) {
  const rel = (event && event.release) || {};
  const repo = env.GITHUB_REPOSITORY || (event && event.repository && event.repository.full_name) || '';
  const tag = rel.tag_name || (env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : '') || '';
  return {
    repo: repo.split('/').pop() || '',
    tag,
    name: rel.name || tag,
    url: rel.html_url || (repo ? `${env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}` : ''),
    body: (rel.body || '').trim(),
    author: (rel.author && rel.author.login) || env.GITHUB_ACTOR || '',
  };
}

const readEvent = (env) => {
  try {
    return env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
  } catch {
    return {};
  }
};

/** Turns the inputs into the API body. Throws a plain message the workflow log shows. */
function buildBody(inp, values, mediaIds, now = Date.now()) {
  const mode = String(inp.mode || 'draft').trim().toLowerCase();
  if (!['draft', 'schedule', 'publish'].includes(mode)) throw new Error('mode must be draft, schedule or publish.');
  const text = fill(inp.text, values).trim();
  if (!text && !mediaIds.length) throw new Error('The post has no text. Set the text input.');
  const accounts = list(inp.accountIds);
  const body = { text, account_ids: accounts, media_ids: mediaIds };
  if (mode !== 'draft' && !accounts.length) throw new Error('Set account-ids to schedule or publish (drafts do not need them).');
  if (mode === 'draft') body.draft = true;
  else if (mode === 'publish') body.publish_now = true;
  else {
    let at = String(inp.scheduleAt || '').trim();
    const mins = String(inp.scheduleInMinutes || '').trim();
    if (!at && mins) {
      const n = Number(mins);
      if (!Number.isFinite(n) || n < 5) throw new Error('schedule-in-minutes must be 5 or more.');
      at = new Date(now + n * 60000).toISOString();
    }
    if (!at) throw new Error('Set schedule-at or schedule-in-minutes when mode is schedule.');
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(at) || Number.isNaN(Date.parse(at))) throw new Error('schedule-at needs an ISO 8601 time with an offset, like 2026-12-01T09:00:00+06:00.');
    body.schedule_at = at;
  }
  if (String(inp.perAccountText || '').trim()) {
    let t;
    try {
      t = JSON.parse(inp.perAccountText);
    } catch {
      throw new Error('per-account-text must be valid JSON.');
    }
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error('per-account-text must be a JSON object keyed by account ID.');
    body.per_account_text = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, fill(String(v), values)]));
  }
  return { body, mode };
}

/** One call to the SolMarrow API; errors carry SolMarrow's own message. */
async function call(fetchFn, apiUrl, key, method, path, body, headers = {}) {
  const res = await fetchFn(`${apiUrl.replace(/\/+$/, '')}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'solmarrow-github-action', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data && data.error && data.error.message;
    if (res.status === 401) throw new Error('SolMarrow did not accept the API key. Check the secret, and that the key was not deleted.');
    throw new Error(`SolMarrow said (${res.status}): ${msg || 'no details'}`);
  }
  return data;
}

async function run({ inputs, env = process.env, fetchFn = fetch, log = () => {} }) {
  const key = String(inputs.apiKey || '').trim();
  if (!/^smk_[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error('api-key should be a SolMarrow API key starting with smk_ (Settings, API keys).');
  const ws = String(inputs.workspaceId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(ws)) throw new Error('workspace-id should be a workspace ID (36 characters).');
  const apiUrl = String(inputs.apiUrl || 'https://app.solmarrow.com/api/v1');
  if (!/^https:\/\//.test(apiUrl) && !/^http:\/\/localhost[:/]/.test(apiUrl)) throw new Error('api-url must start with https://.');
  const values = eventValues(env, readEvent(env));
  const mediaIds = [];
  for (const url of list(inputs.mediaUrls).slice(0, 35)) {
    const m = await call(fetchFn, apiUrl, key, 'POST', `/workspaces/${ws}/media/from-url`, { url });
    const id = m && (m.media_id || m.id);
    if (!id) throw new Error('SolMarrow did not return a media ID for ' + url);
    mediaIds.push(id);
    log(`Attached ${url}`);
  }
  const { body, mode } = buildBody(inputs, values, mediaIds);
  // A re-run of the same workflow run returns the first post instead of making a second one.
  const idem = `gh:${env.GITHUB_REPOSITORY || 'local'}:${env.GITHUB_RUN_ID || Date.now()}:${mode}`.slice(0, 200);
  const r = await call(fetchFn, apiUrl, key, 'POST', `/workspaces/${ws}/posts`, body, { 'Idempotency-Key': idem });
  const postId = r && (r.post_id || r.id);
  if (!postId) throw new Error('SolMarrow saved the post but did not return its ID.');
  return { postId, status: mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'published' };
}

module.exports = { list, fill, eventValues, buildBody, call, run };
