# Discord Shop Bot V2

This is a separate, non-destructive bot project for a new Discord application and a different server. It has its own `.env` and SQLite data folder; it does not reuse the old bot token or database.

## Before starting

1. Create a **new** Discord application and bot at the [Discord Developer Portal](https://discord.com/developers/applications).
2. On the Bot page, enable **Message Content Intent** and **Server Members Intent**. Invite the new bot to the new server with the permissions it needs to manage channels, roles, messages, and application commands. Administrator is the simplest setup.
3. Enable Developer Mode in Discord, then copy the new server's ID and the ID of the minimum staff role that should manage proxies.
4. Copy `.env.example` to `.env` and fill it in. `GUILD_ID` prevents the bot from operating in any other server. `STAFF_ROLE_ID` is required: users with that role or any role above it can use proxy management and ticket migration commands.
5. Install and start:

```bash
npm install
npm start
```

The bot only registers commands at startup. It does **not** create, delete, rename, or restrict server channels automatically.

## Guided setup

Run `/setup` as an administrator. For each of these, it asks you to choose an existing text channel, use the saved channel, or explicitly create a new one:

- verification / rules
- ticket panel
- proxy panel
- vouches

Existing selected channels keep their current names and permissions. The bot never changes unselected channels, categories, roles, messages, or overwrites. It reuses matching ticket and listing categories when they already exist, creating only the missing categories.

When a vouches channel is selected, the bot reads its history, counts every human message that mentions another human, updates the sticky total, and renames the channel to `vouches-COUNT`. The format message is reposted after every human message so it remains at the bottom of the channel. Every new valid vouch updates both the sticky total and channel name. Discord-side rename limits can delay a rename, but the sticky total remains current.

The sticky vouch embed also lists every user mentioned in a valid vouch message, ordered by their total vouch count.

## Commands

| Command | Access | What it does |
|---|---|---|
| `/proxy create` | administrator | Starts the proxy listing wizard. |
| `/proxy edit ign` | administrator | Edits a listing. |
| `/proxy delete ign` | administrator | Deletes a listing channel and its managed listing. |
| `/proxy transfer` | administrator | Imports an existing proxy channel and an existing TicketsBot ticket together. |
| `/proxy category-create`, `/proxy category-rename`, `/proxy category-list`, `/proxy category-delete` | administrator | Creates, renames, lists, and removes custom or built-in categories. Empty listing categories are hidden from normal members. |
| `/proxy sold-category category:#category` | administrator | Uses an existing category for sold listings and moves managed sold listings into it. |
| `/proxy organize` | administrator | Moves known proxy listing channels and their tickets into the correct categories. |
| `/ticket takeover` | administrator | Takes over a non-proxy TicketsBot ticket channel. |
| `/verify everyone`, `/verify resend` | server/configured bot owner only | Verifies all humans or posts a new verification embed in the configured verify channel. |
| `/setup` | administrator | Starts the non-destructive channel-selection setup. |
| `/panel`, `/close`, `/add`, `/role`, `/vouch` | administrator | Existing panel, ticket, role, and vouch tools. |
| `/crypto [currency] [coin] [amount] [hidden]` | administrator | Shows crypto prices or a coin conversion. `amount:1.234 currency:eur coin:litecoin` calculates the EUR value of 1.234 LTC; output is hidden by default. |

## Importing existing proxies and TicketsBot tickets

For an existing proxy, run `/proxy transfer`, link the existing `proxy-channel` and the existing TicketsBot `ticket-channel`, and supply the IGN/category/owner when those cannot be safely inferred. The command fetches available Minecraft stats through the configured Blabit key, posts one staff confirmation card in the transferred ticket, and moves the proxy channel and ticket into the right categories without changing their existing channel overwrites. When staff accept it, the bot posts one managed listing card in the existing proxy channel.

Stats listing channels are arranged by nearest-50 star count (then nearest whole FKDR). Listings below 50 stars show their exact whole-star value, and listings below 100 stars use an `FKDR-stars` channel-name suggestion; other Stats listings use `stars-FKDR`.

BIN and C/O are USD-only. Enter `100`, `$100`, or `100 USD`; the bot stores and displays this as `$100`. A buyer's offer starts as pending in a private ticket, pings staff, and changes the public C/O only after staff accepts it.

OG, Semi OG, 3CN, and Minecon listings request Name Changes instead of Hypixel stats. Minecon year is derived from its selected Minecon cape and uses the listing-channel format `year-numbernc`, for example `2011-12nc`.

For a normal TicketsBot ticket, use `/ticket takeover channel:#ticket`. If the channel has exactly one non-staff member with access, the owner is inferred; otherwise set the optional `owner` argument. TicketsBot's old messages and controls are left intact because Discord bots cannot replace another bot's interactions. From that point, this bot's close button and `/close` manage the claimed ticket.

After a staff member presses **Finish** for a listing, the instruction message containing that Finish button is deleted; only the published listing remains.

The **Mark Sold** control is in the linked proxy ticket, not the public listing. It can be used by the proxier or staff; it pings staff and moves the listing channel to the configured Sold Listings category.

## Data

The new bot stores its independent database at `data/bot.db`. Back it up to retain listings, imported tickets, and vouch history. This project deliberately contains no server-nuking script.
