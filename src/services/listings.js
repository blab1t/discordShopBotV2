const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { EmbedBuilder } = require('discord.js');
const capes = require('./capes');
const db = require('../db');
const proxyCategories = require('./proxyCategories');

const INFO_FIELDS = [
  { key: 'ranks', label: 'Ranks / NWL', placeholder: 'MVP+ | NWL 120' },
  { key: 'bans', label: 'Bans / History / Status', placeholder: 'Unbanned | Clean history | Full access' },
  { key: 'stats', label: 'BW / SW / Duels Stats', placeholder: 'BW: 100* 1.2 FKDR | SW: 5* | Duels: 300W' },
  { key: 'cosmetics', label: 'Cosmetics', placeholder: 'Rare skins, cosmetics, bundles...' },
  { key: 'extra', label: 'Other Info (one item per line)', placeholder: 'One extra detail per line', multiline: true },
];

const NAME_CHANGE_CATEGORIES = new Set(['og', 'semi', '3cn', 'minecon']);
const NAME_CHANGES_FIELD = {
  key: 'namechanges', label: 'Name Changes', placeholder: 'e.g. 12, or one previous name per line',
};

function infoFieldsForCategory(category) {
  if (!NAME_CHANGE_CATEGORIES.has(category)) return INFO_FIELDS;
  return [
    INFO_FIELDS[0], INFO_FIELDS[1], NAME_CHANGES_FIELD,
    INFO_FIELDS[3], INFO_FIELDS[4],
  ];
}

function avatarUrl(listing) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(listing.uuid || listing.ign)}/100`;
}

function displayIgn(listing) {
  if (!listing.ign_hidden) return listing.ign;
  if (listing.category === 'minecon') {
    const year = mineconYear(listing);
    return `${year ? `${year} Minecon` : 'Minecon'} (IGN Hidden)`;
  }
  return 'Hidden';
}

function normalizeUsdPrice(value) {
  const input = String(value || '').trim();
  if (!input || /^offer$/i.test(input)) return 'Offer';
  const withoutCurrency = input
    .replace(/^\$\s*/, '')
    .replace(/\s*usd\s*$/i, '')
    .replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(withoutCurrency) || Number(withoutCurrency) <= 0) {
    throw new Error('Enter a positive USD amount such as 100 or $100.00, or leave the field blank for Offer.');
  }
  const amount = Number(withoutCurrency);
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

// Numeric USD value of a stored price, or null for "Offer"/blank/unparseable.
// Used to compare offers against the current C/O.
function usdToNumber(value) {
  const input = String(value || '').trim();
  if (!input || /^offer$/i.test(input)) return null;
  const cleaned = input.replace(/[^0-9.]/g, '');
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Legacy listings can still contain an older free-text value. New input is
// validated by normalizeUsdPrice; plain stored numbers are also rendered as USD.
function displayUsdPrice(value) {
  const input = String(value || '').trim();
  if (!input) return 'Offer';
  try {
    return normalizeUsdPrice(input);
  } catch (err) {
    return input;
  }
}

// Values used for arranging managed channels inside the Stats category.
// Prefer editable stats text, then fall back to the generated channel name.
function statSortValues(listing) {
  const sources = [listing.info && listing.info.stats, listing.name_suggestion]
    .filter(Boolean)
    .map((value) => String(value));
  const starMatch = sources.map((value) => value.match(/(\d+(?:\.\d+)?)\s*(?:⭐|stars?)/i)).find(Boolean);
  const fkdrMatch = sources.map((value) => value.match(/(\d+(?:\.\d+)?)\s*fkdr\b/i)).find(Boolean);
  const rawStars = starMatch ? Math.max(0, Number(starMatch[1])) : 0;
  const stars = rawStars < 50 ? Math.round(rawStars) : Math.round(rawStars / 50) * 50;
  const fkdr = fkdrMatch ? Math.max(0, Math.round(Number(fkdrMatch[1]))) : 0;
  return { stars, fkdr };
}

// "12" -> "12nc", but "12 nc" or a list of previous names is left alone.
function formatNameChanges(value) {
  const text = String(value || '').trim();
  if (!text) return text;
  const bare = text.match(/^(\d+)\s*$/);
  return bare ? `${bare[1]}nc` : text;
}

function nameChangeCount(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const explicit = text.match(/^\s*(\d+)\s*(?:nc|name\s*changes?)?\s*$/i) ||
    text.match(/\b(\d+)\s*(?:nc|name\s*changes?)\b/i);
  if (explicit) return Math.max(0, parseInt(explicit[1], 10) || 0);
  return text.split(/[\r\n,;]+/).map((entry) => entry.trim()).filter(Boolean).length;
}

function mineconYear(listing) {
  for (const key of listing.capes || []) {
    const cape = capes.getCape(key);
    const match = `${key} ${cape ? cape.name : ''}`.match(/minecon[_ -]?(\d{4})/i);
    if (match) return match[1];
  }
  return null;
}

// Minecon channels use the requested year-namechanges format: e.g. 2011-12nc.
function mineconChannelName(listing) {
  return `${mineconYear(listing) || 'minecon'}-${nameChangeCount(listing.info && listing.info.namechanges)}nc`;
}

// 3-character names group as: digits (000-999), then letters (aaa-zzz), then
// anything containing an underscore or a mix.
function threeCharClass(ign) {
  const name = String(ign || '');
  if (/^\d{3}$/.test(name)) return 0;
  if (/^[A-Za-z]{3}$/.test(name)) return 1;
  return 2;
}

// Sort key per account category, compared element by element. Numbers sort
// ascending, so "best first" values are negated.
function listingSortKey(listing) {
  switch (listing.category) {
    case 'minecon':
      // Oldest Minecon first, then fewest name changes.
      return [Number(mineconYear(listing)) || 9999, nameChangeCount(listing.info && listing.info.namechanges)];
    case 'og':
    case 'semi':
      // Longest name on top.
      return [-String(listing.ign || '').length, String(listing.ign || '').toLowerCase()];
    case '3cn':
      return [threeCharClass(listing.ign), String(listing.ign || '').toLowerCase()];
    case 'stat': {
      const { stars, fkdr } = statSortValues(listing);
      return [-stars, -fkdr];
    }
    default: {
      // Everything else (high tier, cosmetics, custom categories): dearest first.
      const price = usdToNumber(listing.bin) ?? usdToNumber(listing.co) ?? 0;
      return [-price, String(listing.ign || '').toLowerCase()];
    }
  }
}

function compareListings(a, b) {
  const keyA = listingSortKey(a);
  const keyB = listingSortKey(b);
  for (let i = 0; i < Math.max(keyA.length, keyB.length); i += 1) {
    const left = keyA[i];
    const right = keyB[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (typeof left === 'string' || typeof right === 'string') {
      const cmp = String(left).localeCompare(String(right), 'en', { numeric: true });
      if (cmp) return cmp;
    } else if (left !== right) {
      return left - right;
    }
  }
  return (a.created_at || 0) - (b.created_at || 0);
}

function buildCategorySelectRow(customId, categories = proxyCategories.list()) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Pick the account category')
    .addOptions(
      categories.map((category) => ({ label: category.label, value: category.key }))
    );
  return new ActionRowBuilder().addComponents(select);
}

// Modals cannot hold buttons, so the "hide it publicly" choice is a small
// yes/no field right under the username instead of a separate step.
function parseYesNo(value, fallback = false) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  return ['y', 'yes', 'true', '1', 'hide', 'hidden', 'private', 'ja'].includes(text);
}

function buildIgnModal(customId, { ignHidden = false } = {}) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Account username')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ign')
          .setLabel('Minecraft username (IGN)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(16)
          .setPlaceholder('Notch')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('hidden')
          .setLabel('Hide the username publicly? (yes/no)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(5)
          .setPlaceholder('no')
          .setValue(ignHidden ? 'yes' : 'no')
      )
    );
}

function textInput(field, value) {
  const input = new TextInputBuilder()
    .setCustomId(field.key)
    .setLabel(field.label)
    .setStyle(field.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(Boolean(field.required))
    .setMaxLength(field.multiline ? 1000 : 300)
    .setPlaceholder(field.placeholder);
  if (value && String(value).trim()) input.setValue(String(value).trim().slice(0, field.multiline ? 1000 : 300));
  return new ActionRowBuilder().addComponents(input);
}

function buildInfoModal(customId, values = {}, category = null) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle('General information');
  for (const field of infoFieldsForCategory(category)) modal.addComponents(textInput(field, values[field.key]));
  return modal;
}

function buildPriceModal(customId, values = {}) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle('Prices');
  const co = new TextInputBuilder()
    .setCustomId('co').setLabel('C/O (USD)').setStyle(TextInputStyle.Short)
    .setRequired(false).setMaxLength(64).setPlaceholder('e.g. 100 or $100 USD; blank = Offer');
  const bin = new TextInputBuilder()
    .setCustomId('bin').setLabel('BIN (USD)').setStyle(TextInputStyle.Short)
    .setRequired(false).setMaxLength(64).setPlaceholder('e.g. 100 or $100 USD; blank = Offer');
  if (values.co && values.co !== 'Offer') co.setValue(String(values.co).slice(0, 64));
  if (values.bin && values.bin !== 'Offer') bin.setValue(String(values.bin).slice(0, 64));
  modal.addComponents(
    new ActionRowBuilder().addComponents(co),
    new ActionRowBuilder().addComponents(bin)
  );
  return modal;
}

// One select row per registry page (Discord caps selects at 25 options).
function buildCapeSelectRows(customIdBase, selectedKeys = []) {
  const pages = capes.capeSelectPages(selectedKeys);
  return pages.map((page) => {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${customIdBase}:${page.index}`)
      .setPlaceholder(
        pages.length > 1
          ? `Add or remove capes (page ${page.index + 1}/${pages.length})`
          : 'Add or remove capes'
      )
      .setMinValues(0)
      .setMaxValues(page.options.length)
      .addOptions(page.options);
    return new ActionRowBuilder().addComponents(select);
  });
}

function buildMetaModal(customId, listing) {
  const ignInput = new TextInputBuilder()
    .setCustomId('ign').setLabel('Minecraft username (IGN)')
    .setStyle(TextInputStyle.Short).setMaxLength(16);
  if (listing.ign_hidden) {
    ignInput
      .setRequired(false)
      .setPlaceholder('Leave blank to keep the hidden IGN unchanged');
  } else {
    ignInput.setRequired(true).setValue(listing.ign);
  }
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Username and category')
    .addComponents(
      new ActionRowBuilder().addComponents(ignInput),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('category')
          .setLabel('Category')
          .setPlaceholder(proxyCategories.list().map((category) => category.key).join(', ').slice(0, 100))
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16)
          .setValue(listing.category)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('hidden')
          .setLabel('Hide the username publicly? (yes/no)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5)
          .setPlaceholder('no')
          .setValue(listing.ign_hidden ? 'yes' : 'no')
      )
    );
}

function buildEditSelectRow(listingId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rv:editsel:${listingId}`)
    .setPlaceholder('What do you want to edit?')
    .addOptions(
      { label: 'General information', value: 'info', emoji: '📝' },
      { label: 'Prices (C/O and BIN)', value: 'prices', emoji: '💶' },
      { label: 'Capes', value: 'capes', emoji: '🧥' },
      { label: 'Username and category', value: 'meta', emoji: '🏷️' }
    );
  return new ActionRowBuilder().addComponents(select);
}

function buildSoldButtonRow(listingId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ls:sold:${listingId}`).setLabel('Mark Sold').setStyle(ButtonStyle.Danger)
  );
}

// Lets a buyer bid again from inside their own ticket, without going back to the
// public card. Lives here (not in buyFlow) so the outbid notice can use it too
// without listings depending on the interaction layer.
function buildOfferAgainRow(listingId, label = 'Offer again') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ls:again:${listingId}`).setLabel(label).setStyle(ButtonStyle.Primary).setEmoji('💰')
  );
}

// mode: 'preview' (ticket, with accept/edit/deny), 'published' (offer/bin), 'plain'
function buildListingContainer(listing, mode, { revealIgn = false } = {}) {
  // No accent colour: listing cards should not show a coloured vertical bar.
  const container = new ContainerBuilder();

  // Header: big IGN with the account head beside it, info as a plain
  // bullet list underneath (no field labels), capes as emoji only.
  const bullets = [];
  for (const field of infoFieldsForCategory(listing.category)) {
    const value = listing.info ? listing.info[field.key] : null;
    if (!value || !String(value).trim()) continue;
    if (field.key === 'extra') {
      for (const line of String(value).split(/\r?\n/)) {
        const cleanLine = line.trim().replace(/^(?:-\s*)+/, '');
        if (cleanLine) bullets.push(`- ${cleanLine}`);
      }
    } else {
      bullets.push(`- ${String(value).trim()}`);
    }
  }
  if (listing.capes && listing.capes.length) {
    bullets.push(`- Has ${listing.capes.map((key) => capes.capeEmoji(key)).join(' ')}`);
  }
  // Inside tickets staff see the real IGN, tagged so it is obvious the public
  // listing hides it.
  const headerName = revealIgn
    ? `${listing.ign}${listing.ign_hidden ? ' (Hidden)' : ''}`
    : displayIgn(listing);
  const headerTexts = [new TextDisplayBuilder().setContent(`# ${headerName}`)];
  if (bullets.length) {
    headerTexts.push(new TextDisplayBuilder().setContent(bullets.join('\n').slice(0, 2000)));
  }
  // Section components need an accessory. Hidden listings intentionally have
  // none, so use a plain text display for them; other cards retain the player
  // head thumbnail without triggering the missing-accessory serialization bug.
  if (listing.ign_hidden) {
    container.addTextDisplayComponents(...headerTexts);
  } else {
    const section = new SectionBuilder()
      .addTextDisplayComponents(...headerTexts)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl(listing)));
    container.addSectionComponents(section);
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`BIN: **${displayUsdPrice(listing.bin)}**\nC/O: **${displayUsdPrice(listing.co)}**`)
  );
  if (mode === 'sold' || !listing.hide_proxy_label) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(mode === 'sold' ? '**SOLD**' : '**PROXY**')
    );
  }

  if (mode === 'preview') {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Requested by <@${listing.requester_id}> | Category: ${(proxyCategories.resolve(listing.category) || {}).label || listing.category}`
      )
    );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rv:accept:${listing.id}`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`rv:edit:${listing.id}`).setLabel('Edit').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`rv:deny:${listing.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setEmoji('⛔')
      )
    );
  } else if (mode === 'published') {
    const watchers = db.watcherCount(listing.id);
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ls:offer:${listing.id}`).setLabel('Offer').setStyle(ButtonStyle.Primary).setEmoji('💰'),
        new ButtonBuilder().setCustomId(`ls:bin:${listing.id}`).setLabel('BIN').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId(`ls:watch:${listing.id}`)
          .setLabel(watchers ? `Watch (${watchers})` : 'Watch')
          .setStyle(ButtonStyle.Secondary).setEmoji('🔔')
      )
    );
  }
  if (mode === 'ticket-published') {
    // Mark Sold plus an Edit control: staff can always edit here, and the
    // account owner can keep editing until the listing goes public.
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ls:sold:${listing.id}`).setLabel('Mark Sold').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rv:edit:${listing.id}`).setLabel('Edit').setStyle(ButtonStyle.Primary).setEmoji('✏️')
      )
    );
  }
  return container;
}

// Standard Discord embed used when importing a legacy proxy. It keeps the
// transferred listing readable in clients that do not render Components V2.
function buildListingEmbed(listing, { imported = false } = {}) {
  const category = proxyCategories.resolve(listing.category);
  const embed = new EmbedBuilder()
    .setTitle(displayIgn(listing))
    .addFields(
      { name: 'Category', value: category ? category.label : listing.category, inline: true },
      { name: 'BIN', value: displayUsdPrice(listing.bin), inline: true },
      { name: 'C/O', value: displayUsdPrice(listing.co), inline: true },
    );
  if (!listing.ign_hidden) embed.setThumbnail(avatarUrl(listing));
  for (const field of infoFieldsForCategory(listing.category)) {
    const value = listing.info ? String(listing.info[field.key] || '').trim() : '';
    if (!value) continue;
    embed.addFields({
      name: field.key === 'extra' ? 'Other Information' : field.label,
      value: value.slice(0, 1024),
      inline: false,
    });
  }
  if (listing.capes && listing.capes.length) {
    embed.addFields({ name: 'Capes', value: listing.capes.map((key) => capes.capeEmoji(key)).join(' '), inline: false });
  }
  if (imported) embed.setFooter({ text: 'Imported proxy listing' });
  return embed;
}

function listingPayload(listing, mode, { isEdit = false, revealIgn = false } = {}) {
  const payload = {
    components: [buildListingContainer(listing, mode, { revealIgn })],
    allowedMentions: { parse: [] },
  };
  if (!isEdit) payload.flags = MessageFlags.IsComponentsV2;
  return payload;
}

// Re-renders the preview message inside the proxy ticket.
async function renderPreview(client, listingRow) {
  const listing = db.parseListing(listingRow);
  if (!listing.ticket_channel_id || !listing.preview_message_id) return;
  try {
    const channel = await client.channels.fetch(listing.ticket_channel_id);
    const message = await channel.messages.fetch(listing.preview_message_id);
    // Pending listings keep the review controls; once accepted the card swaps
    // them for Mark Sold, and a sold listing just shows its SOLD state.
    const mode = listing.status === 'pending'
      ? 'preview'
      : listing.status === 'sold'
      ? 'sold'
      : 'ticket-published';
    await message.edit(listingPayload(listing, mode, { isEdit: true, revealIgn: true }));
  } catch (err) {
    // ticket message may have been deleted
  }
}

// DMs everyone watching a listing. Used for price changes and sales; failures
// (closed DMs) are ignored so one blocked user cannot break the update.
async function notifyWatchers(client, listingRow, text, { skipUserId = null } = {}) {
  const listing = db.parseListing(listingRow);
  if (!listing) return 0;
  const ids = db.watcherIds(listing.id).filter((id) => id !== skipUserId);
  if (!ids.length) return 0;
  const link = listing.listing_channel_id
    ? `\nhttps://discord.com/channels/${require('../config').GUILD_ID}/${listing.listing_channel_id}`
    : '';
  let sent = 0;
  for (const id of ids) {
    const user = await client.users.fetch(id).catch(() => null);
    if (!user) continue;
    const ok = await user.send({ content: `🔔 **${displayIgn(listing)}** - ${text}${link}` })
      .then(() => true).catch(() => false);
    if (ok) sent += 1;
  }
  return sent;
}

// Tells earlier bidders that their offer is no longer the highest, both by DM
// and in their own offer ticket. The new bidder is never named: buyer and
// seller must not be able to find each other and skip the proxy fee.
async function notifyOutbid(client, listingRow, newAmount, { excludeUserId = null } = {}) {
  const listing = db.parseListing(listingRow);
  if (!listing) return 0;
  const top = usdToNumber(newAmount);
  if (top === null) return 0;
  let notified = 0;
  for (const ticket of db.offerTicketsForListing(listing.id)) {
    if (String(ticket.creator_id) === String(excludeUserId)) continue;
    const theirs = usdToNumber(ticket.offer_amount);
    if (theirs === null || theirs >= top) continue;
    const text = `Your offer of **${displayUsdPrice(ticket.offer_amount)}** on **${displayIgn(listing)}** has been outbid.
`
      + `The current offer is now **${displayUsdPrice(newAmount)}**. Place a higher offer if you are still interested.`;
    // In their ticket first, so there is a record even when DMs are closed.
    if (ticket.status === 'open' && ticket.channel_id) {
      const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
      if (channel && typeof channel.send === 'function') {
        await channel.send({
          content: `<@${ticket.creator_id}>`,
          embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('You have been outbid').setDescription(text)],
          // One click to re-bid from the ticket they are already reading.
          components: listing.status === 'published' ? [buildOfferAgainRow(listing.id, 'Offer again')] : [],
          allowedMentions: { users: [ticket.creator_id] },
        }).catch(() => {});
      }
    }
    const user = await client.users.fetch(ticket.creator_id).catch(() => null);
    if (user) await user.send({ content: `🔔 ${text}` }).catch(() => {}); // closed DMs are fine
    notified += 1;
  }
  return notified;
}

// Posts a short price update line in the public listing channel, e.g.
// "Current offer: **$120**" or "Bin raised to **$300**".
async function announceListingUpdate(client, listingRow, text) {
  const listing = db.parseListing(listingRow);
  if (!listing || !listing.listing_channel_id) return false;
  const channel = await client.channels.fetch(listing.listing_channel_id).catch(() => null);
  if (!channel || typeof channel.send !== 'function') return false;
  await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}

// "set" the first time, then "raised"/"lowered" relative to the old price.
function priceChangeVerb(oldValue, newValue) {
  const before = usdToNumber(oldValue);
  const after = usdToNumber(newValue);
  if (before === null || after === null) return 'set';
  if (after > before) return 'raised';
  if (after < before) return 'lowered';
  return 'set';
}

// Clears Mark Sold controls left on older bot messages in a proxy ticket, so a
// sold listing cannot be "sold" twice from a stale button.
async function stripSoldButtons(client, listingRow) {
  const listing = db.parseListing(listingRow);
  if (!listing || !listing.ticket_channel_id) return 0;
  const channel = await client.channels.fetch(listing.ticket_channel_id).catch(() => null);
  if (!channel || typeof channel.messages?.fetch !== 'function') return 0;
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return 0;
  let cleared = 0;
  for (const message of messages.values()) {
    if (!message.author.bot || message.author.id !== client.user.id) continue;
    if (message.id === listing.preview_message_id) continue; // handled by renderPreview
    const raw = JSON.stringify(message.components || []);
    if (!raw.includes(`ls:sold:${listing.id}`)) continue;
    // Components V2 messages must keep a components array, so those are skipped.
    if (message.flags && message.flags.has(MessageFlags.IsComponentsV2)) continue;
    await message.edit({ components: [] }).then(() => { cleared += 1; }).catch(() => {});
  }
  return cleared;
}

// Re-renders the published listing message, if it exists.
async function renderPublished(client, listingRow) {
  const listing = db.parseListing(listingRow);
  if (!listing.listing_channel_id || !listing.listing_message_id) return;
  try {
    const channel = await client.channels.fetch(listing.listing_channel_id);
    const message = await channel.messages.fetch(listing.listing_message_id);
    await message.edit(listingPayload(listing, listing.status === 'sold' ? 'sold' : 'published', { isEdit: true }));
  } catch (err) {
    // listing message may have been deleted
  }
}

module.exports = {
  INFO_FIELDS, infoFieldsForCategory, avatarUrl, displayIgn, normalizeUsdPrice, displayUsdPrice, usdToNumber, statSortValues, mineconYear, mineconChannelName,
  formatNameChanges, nameChangeCount, threeCharClass, listingSortKey, compareListings,
  buildCategorySelectRow, buildIgnModal, buildInfoModal, buildPriceModal, parseYesNo,
  buildCapeSelectRows, buildMetaModal, buildEditSelectRow, buildSoldButtonRow, buildOfferAgainRow,
  buildListingContainer, buildListingEmbed, listingPayload, renderPreview, renderPublished, stripSoldButtons,
  announceListingUpdate, priceChangeVerb, notifyWatchers, notifyOutbid,
};
