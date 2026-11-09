'use strict';

const fs = require('node:fs');
const { run } = require('./lib');

// Inputs arrive as INPUT_<NAME> environment variables (no runtime dependencies on purpose).
const input = (name) => (process.env[`INPUT_${name.replace(/ /g, '_').replace(/-/g, '_').toUpperCase()}`] || '').trim();
const out = (k, v) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

(async () => {
  const apiKey = input('api-key');
  if (apiKey) console.log(`::add-mask::${apiKey}`);
  try {
    const r = await run({
      inputs: {
        apiKey,
        workspaceId: input('workspace-id'),
        accountIds: input('account-ids'),
        text: input('text'),
        mode: input('mode'),
        scheduleAt: input('schedule-at'),
        scheduleInMinutes: input('schedule-in-minutes'),
        mediaUrls: input('media-urls'),
        perAccountText: input('per-account-text'),
        apiUrl: input('api-url'),
      },
      log: (m) => console.log(m),
    });
    out('post-id', r.postId);
    out('status', r.status);
    console.log(`SolMarrow post ${r.postId} (${r.status}).`);
  } catch (e) {
    console.log(`::error::${e.message.replace(/\r?\n/g, ' ')}`);
    process.exitCode = 1;
  }
})();
