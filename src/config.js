require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const path = require('node:path');

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value.trim();
}

const CATEGORY_LABELS = {
  og: 'OG',
  semi: 'Semi OG',
  '3cn': '3 Character Name',
  stat: 'Stats',
  cosmetics: 'Cosmetics',
  minecon: 'Minecon',
  other: 'Other',
};

const RULES_TEXT = [
  'Read the rules below, then react with the verification emoji to unlock the server.',
  '',
  '**1.** Be respectful. No harassment, slurs or drama.',
  '**2.** No scamming, no chargebacks, no fake vouches. Instant ban.',
  '**3.** All deals must go through tickets. Deals outside tickets are at your own risk.',
  '**4.** Use the panels to open a ticket for buying, proxying or anything else.',
  '**5.** Do not advertise or DM members without permission.',
  '**6.** Vouch after every completed deal in the vouches channel.',
  '**7.** Do not ping staff without a reason.',
  '**8.** Staff decisions are final.',
].join('\n');

// Coins users can save a receiving address for via /setwallet and view with /wallet.
const WALLET_COINS = [
  { key: 'ltc', label: 'Litecoin (LTC)' },
  { key: 'btc', label: 'Bitcoin (BTC)' },
  { key: 'eth', label: 'Ethereum (ETH)' },
  { key: 'sol', label: 'Solana (SOL)' },
  { key: 'usdt', label: 'Tether (USDT)' },
  { key: 'usdc', label: 'USD Coin (USDC)' },
  { key: 'bnb', label: 'BNB (BSC)' },
  { key: 'xmr', label: 'Monero (XMR)' },
  { key: 'doge', label: 'Dogecoin (DOGE)' },
  { key: 'trx', label: 'Tron (TRX)' },
  { key: 'ada', label: 'Cardano (ADA)' },
];

const OWNER_ID = (process.env.OWNER_ID || '').trim();
const STAFF_ROLE_ID = (process.env.STAFF_ROLE_ID || '').trim();
if (!STAFF_ROLE_ID) {
  console.error('Set STAFF_ROLE_ID in .env. It is the minimum role allowed to manage proxies and take over TicketsBot tickets.');
  process.exit(1);
}

module.exports = {
  TOKEN: requireEnv('DISCORD_TOKEN'),
  GUILD_ID: requireEnv('GUILD_ID'),
  OWNER_ID,
  STAFF_ROLE_ID,
  BLABIT_API_KEY: (process.env.BLABIT_API_KEY || '').trim(),
  // Optional fallback for the staff audit log; /logchannel overrides it.
  LOG_CHANNEL_ID: (process.env.LOG_CHANNEL_ID || '').trim(),
  // Optional Angels API key; when set, public listings are mirrored to it.
  ANGELS_API_KEY: (process.env.ANGELS_API_KEY || '').trim(),
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'bot.db'),

  PROXY_CATEGORIES: ['og', 'semi', '3cn', 'stat', 'cosmetics', 'minecon', 'other'],
  CATEGORY_LABELS,
  WALLET_COINS,
  RULES_TEXT,

  PING_DELETE_MS: 15 * 60 * 1000,
  CLOSE_DEFAULT_MS: 24 * 60 * 60 * 1000,
  WIZARD_TTL_MS: 30 * 60 * 1000,

  ROLE_MEMBER: 'Member',
  ROLE_CUSTOMER: 'Customer',
  CAT_PROXY: 'Proxy Tickets',
  CAT_SOLD: 'Sold Listings',
  CAT_BUY: 'Buy Tickets',
  CAT_SUPPORT: 'Support Tickets',
  CH_VERIFY: 'verify',
  CH_TICKETS: 'tickets',
  CH_PROXY: 'proxy',
  CH_VOUCHES_PREFIX: 'vouches',

  VERIFY_EMOJI: '\u2705',
  // Neutral grey accent stripe instead of Discord blurple.
  EMBED_COLOR: 0x99aab5,
};
