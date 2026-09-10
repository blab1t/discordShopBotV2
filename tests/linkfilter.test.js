// Self-check for the link filter. Run with `node tests/linkfilter.test.js`.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = path.join(os.tmpdir(), `linkfilter-test-${Date.now()}.db`);
process.env.DB_PATH = tmp;
const db = require('../src/db');
const lf = require('../src/services/linkfilter');

const JUMP_LINK = 'https://discord.com/channels/1500970263687332038/1537844084088242289';

// Defaults: Discord's own links pass, invites and unknown domains do not.
assert.deepStrictEqual(lf.findDisallowed(JUMP_LINK), []);
assert.deepStrictEqual(lf.findDisallowed('https://cdn.discordapp.com/attachments/1/2/x.png'), []);
assert.ok(lf.findDisallowed('https://discord.gg/abcdef').includes('server invite'));
assert.ok(lf.findDisallowed('https://evil.example.net/x').includes('evil.example.net'));

// The reported bug: a list saved before discord.com was a default. The old code
// returned this verbatim, so jump links were deleted.
db.setSetting('linkfilter_allow', JSON.stringify(['oguser.com', 'tenor.com']));
assert.deepStrictEqual(lf.findDisallowed(JUMP_LINK), [], 'stale saved list must not block jump links');
assert.ok(lf.allowList().includes('discord.com'), 'defaults are a floor, not a one-time seed');
assert.ok(lf.allowList().includes('oguser.com'), 'saved entries survive');
// New defaults reach servers that had customised their list.
assert.ok(lf.allowList().includes('namemc.com'), 'later-added defaults propagate');

// Invites stay blocked even though discord.com is structurally allowed.
assert.ok(lf.findDisallowed('https://discord.com/invite/abcdef').includes('server invite'));

// A deliberate removal sticks across the defaults floor.
lf.removeDomain('tenor.com');
assert.ok(!lf.allowList().includes('tenor.com'), 'removal is remembered');
assert.ok(lf.findDisallowed('https://tenor.com/view/x').includes('tenor.com'));
// Re-adding clears the removal.
lf.addDomain('tenor.com');
assert.ok(lf.allowList().includes('tenor.com'));
assert.deepStrictEqual(lf.findDisallowed('https://tenor.com/view/x'), []);

// Discord's content hosts cannot be removed out from under jump links.
assert.throws(() => lf.removeDomain('discord.com'), /cannot be removed/);
assert.deepStrictEqual(lf.findDisallowed(JUMP_LINK), []);

// Adding a domain still works and is not duplicated.
lf.addDomain('example.org');
assert.deepStrictEqual(lf.findDisallowed('https://example.org/a'), []);
assert.throws(() => lf.addDomain('example.org'), /already allowed/);

db.db.close();
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${tmp}${suffix}`, { force: true });
console.log('link filter: all checks passed');
