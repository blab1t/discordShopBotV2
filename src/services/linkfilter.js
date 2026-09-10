const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');
const config = require('../config');
const { isStaffOrHigher } = require('../util/perms');

// Matches bare domains as well as full URLs, so "oguser.com/thread" and
// "https://example.com" are both caught.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<]*)?/gi;

// Only server invites are blocked. Discord's own media, emoji, sticker and
// message links are normal chat content and stay allowed.
const DISCORD_INVITE_RE = new RegExp([
  '(?:https?://)?(?:[a-z0-9-]+\\.)*discord(?:app)?\\.(?:com|gg)/invite/[A-Za-z0-9-]+',
  '(?:https?://)?(?:www\\.)?discord\\.gg/[A-Za-z0-9-]+',
  '(?:https?://)?(?:www\\.)?(?:dsc\\.gg|dis\\.gd|invite\\.gg|discord\\.me|disboard\\.org|discadia\\.com)/[A-Za-z0-9-]+',
  '(?:https?://)?(?:www\\.)?top\\.gg/servers?/\\d+',
].join('|'), 'i');
// "gg/name" and ".gg/name" written without a real domain in front.
const GG_SHORTHAND_RE = /(?<![\w./])\.?gg\/[A-Za-z0-9-]{2,32}/i;
// A bare "/name" invite shorthand. Must start the token (so "and/or", "12/05"
// and "he/him" are untouched) and start with a letter.
const BARE_SLASH_RE = /(?<![\w/.])\/([A-Za-z][A-Za-z0-9-]{1,31})\b/g;

// Marketplaces staff actually use, plus Discord's own media/CDN/message links
// (GIFs, stickers, emoji, attachments and channel jump links).
const DEFAULT_ALLOW = [
  'oguser.com', 'ogusers.com',
  'discord.com', 'discordapp.com', 'discordapp.net', 'discord.gift',
  'tenor.com', 'giphy.com', 'imgur.com', 'prnt.sc', 'gyazo.com',
  'mc-heads.net', 'namemc.com', 'minotar.net',
];

// Channel jump links, attachments and CDN media are ordinary chat content, so
// they are allowed structurally rather than through the editable list: a
// customised allow list must never start deleting links to the server's own
// channels. Invites are matched separately by DISCORD_INVITE_RE and stay
// blocked, including discord.com/invite/xxx.
const DISCORD_CONTENT_HOSTS = ['discord.com', 'discordapp.com', 'discordapp.net', 'discord.gift'];

// "/close" in conversation is a bot command, not an invite.
let commandNameCache = null;
function botCommandNames() {
  if (commandNameCache) return commandNameCache;
  try {
    commandNameCache = new Set(require('../commands/definitions').map((d) => d.name.toLowerCase()));
  } catch (err) {
    commandNameCache = new Set();
  }
  return commandNameCache;
}
// Everyday phrases people type with a leading slash.
const SLASH_ALLOWED_WORDS = new Set([
  'me', 'yes', 'no', 'ok', 'or', 'and', 'per', 'off', 'on', 'ea', 'each', 'hr', 'day', 'week',
  'month', 'year', 'usd', 'eur', 'btc', 'eth', 'ltc', 'gg', 'w', 'l', 's', 'o',
]);

function findInviteShorthand(content) {
  const text = String(content || '');
  const hits = [];
  if (DISCORD_INVITE_RE.test(text)) hits.push('server invite');
  if (GG_SHORTHAND_RE.test(text)) hits.push('gg/ invite');
  const commands = botCommandNames();
  let match;
  BARE_SLASH_RE.lastIndex = 0;
  while ((match = BARE_SLASH_RE.exec(text))) {
    const word = match[1].toLowerCase();
    if (commands.has(word) || SLASH_ALLOWED_WORDS.has(word)) continue;
    hits.push(`/${match[1]}`);
  }
  return [...new Set(hits)];
}

function enabled() {
  return db.getSetting('linkfilter_enabled') === '1';
}
function setEnabled(on) {
  db.setSetting('linkfilter_enabled', on ? '1' : '0');
}

function storedAllowList() {
  try {
    const raw = JSON.parse(db.getSetting('linkfilter_allow') || 'null');
    if (Array.isArray(raw)) return raw;
  } catch (err) {
    // fall through to the defaults
  }
  return null;
}
// Domains a staff member deliberately took off the list. Kept separately so the
// defaults floor below does not resurrect them on the next restart.
function removedDefaults() {
  try {
    const raw = JSON.parse(db.getSetting('linkfilter_removed') || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch (err) {
    return new Set();
  }
}

// DEFAULT_ALLOW is a floor, not a one-time seed. The old behaviour returned the
// saved list verbatim, so a server that ever ran `/linkfilter add` froze its
// list and never picked up domains added to the defaults later - which is how
// discord.com jump links started getting deleted on servers that customised
// their list before discord.com was a default.
function allowList() {
  const stored = storedAllowList();
  const removed = removedDefaults();
  return [...new Set([...(stored || []), ...DEFAULT_ALLOW])].filter((domain) => !removed.has(domain));
}
function saveAllowList(list) {
  db.setSetting('linkfilter_allow', JSON.stringify([...new Set(list)]));
}
function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '');
}
function addDomain(value) {
  const domain = normalizeDomain(value);
  if (!domain || !domain.includes('.')) throw new Error('Enter a domain like `oguser.com`.');
  const list = allowList();
  if (list.includes(domain)) throw new Error('That domain is already allowed.');
  // Re-adding something previously removed clears that removal.
  const removed = removedDefaults();
  if (removed.delete(domain)) db.setSetting('linkfilter_removed', JSON.stringify([...removed]));
  saveAllowList([...list, domain]);
  return domain;
}
function removeDomain(value) {
  const domain = normalizeDomain(value);
  if (DISCORD_CONTENT_HOSTS.includes(domain)) {
    throw new Error(`\`${domain}\` carries Discord's own channel, attachment and CDN links, so it cannot be removed. Server invites are blocked separately and stay blocked.`);
  }
  const list = allowList();
  if (!list.includes(domain)) throw new Error('That domain is not on the allow list.');
  saveAllowList(list.filter((entry) => entry !== domain));
  // Remember the removal so the defaults floor does not add it back.
  const removed = removedDefaults();
  removed.add(domain);
  db.setSetting('linkfilter_removed', JSON.stringify([...removed]));
  return domain;
}

function hostOf(match) {
  const host = String(match)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  return host;
}

// A domain is allowed when it matches an entry exactly or is a subdomain of one.
function isAllowedHost(host, list) {
  return list.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// Returns everything blockable in a message: disallowed domains plus Discord
// links and invite shorthands like "gg/name" or "/name".
function findDisallowed(content) {
  const list = allowList();
  const bad = [];
  const matches = String(content || '').match(URL_RE);
  for (const match of matches || []) {
    const host = hostOf(match);
    if (!host.includes('.')) continue;
    // Ignore things like "1.5" or file names such as "image.png".
    if (/^\d+(\.\d+)*$/.test(host)) continue;
    if (!/\.[a-z]{2,}$/i.test(host)) continue;
    if (isAllowedHost(host, DISCORD_CONTENT_HOSTS)) continue;
    if (!isAllowedHost(host, list)) bad.push(host);
  }
  for (const hit of findInviteShorthand(content)) {
    // Invites stay blocked unless the invite host itself was allowlisted.
    if (hit === 'server invite' && list.some((d) => /^(discord\.gg|dsc\.gg|invite\.gg|discord\.me)$/i.test(d))) continue;
    if (hit === 'gg/ invite' && list.some((d) => /\bgg$/i.test(d))) continue;
    bad.push(hit);
  }
  return [...new Set(bad)];
}

// Staff, admins and the bot owner are never filtered.
function isExempt(member, guild) {
  if (!member) return true;
  if (member.user && member.user.bot) return true;
  return isStaffOrHigher(member, guild);
}

// Called for every user message. Deletes disallowed links and warns briefly.
async function handleMessage(message) {
  try {
    if (!enabled()) return false;
    if (!message.guild || message.author.bot) return false;
    if (isExempt(message.member, message.guild)) return false;
    const bad = findDisallowed(message.content);
    if (!bad.length) return false;
    const me = message.guild.members.me;
    const perms = message.channel.permissionsFor(me);
    if (!perms || !perms.has(PermissionFlagsBits.ManageMessages)) return false;
    await message.delete().catch(() => {});
    const ticketsChannelId = db.getSetting('tickets_channel');
    const notice = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('Message removed by the link filter')
        .setDescription(
          `<@${message.author.id}>, your message was flagged because links are not allowed here.\n` +
          `Flagged: \`${bad.slice(0, 3).join('`, `')}\`\n\n` +
          `If you think this was a mistake, open a ticket${ticketsChannelId ? ` in <#${ticketsChannelId}>` : ''} and staff will take a look.`
        )],
      allowedMentions: { users: [message.author.id] },
    }).catch(() => null);
    // Keep it visible long enough to read, then tidy up.
    if (notice) setTimeout(() => notice.delete().catch(() => {}), 20000);
    // Send the same note by DM so it is not missed if the notice disappears.
    await message.author.send({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('Your message was removed')
        .setDescription(
          `Your message in **${message.guild.name}** (<#${message.channelId}>) was removed because links are not allowed there.\n` +
          `Flagged: \`${bad.slice(0, 3).join('`, `')}\`\n\n` +
          'If you believe this was a mistake, open a ticket in the server and staff will review it.\n\n' +
          `Your message:\n>>> ${String(message.content || '').slice(0, 1500)}`
        )],
    }).catch(() => {}); // closed DMs are fine
    const logs = require('./logs');
    logs.send(message.client, {
      title: 'Link blocked',
      description: `<@${message.author.id}> in <#${message.channelId}>`,
      fields: [
        { name: 'Blocked', value: bad.join(', ').slice(0, 1000), inline: false },
        { name: 'Message', value: String(message.content || '').slice(0, 900) || '-', inline: false },
      ],
      color: 0xed4245,
    });
    return true;
  } catch (err) {
    console.error('Link filter error:', err.message);
    return false;
  }
}

module.exports = {
  enabled, setEnabled, allowList, addDomain, removeDomain, normalizeDomain,
  findDisallowed, handleMessage, DEFAULT_ALLOW,
};
