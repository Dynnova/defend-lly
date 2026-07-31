/**
 * bot-status.js
 * Tujuan     : Netlify Function - cek bot ada di guild + validasi permissions + list channels
 * Dipakai    : Web dashboard via GET /api/bot-status?guildId=xxx
 * Dependensi : Discord REST API, env BOT_TOKEN, BOT_CLIENT_ID
 * Fungsi     : handler(req) - fetch guild member (bot), hitung missing perms, list channels
 * Side effect: Discord API read (guilds/{id}/members/{botId}, guilds/{id}/channels)
 */

const REQUIRED_PERMS = BigInt('1099511696400');

const PERM_NAMES = {
  0x00000002n : 'Kick Members',
  0x00000004n : 'Ban Members',
  0x00000008n : 'Administrator',
  0x00000400n : 'View Channels',
  0x00010000n : 'View Audit Log',
  0x00000800n : 'Send Messages',
  0x10000000n : 'Moderate Members',
  0x00000040n : 'Read Message History',
  0x00008000n : 'Attach Files',
};

function getMissingPerms(effectivePerms) {
  // Administrator override — semua permission granted
  if (effectivePerms & 0x8n) return [];

  const missing = [];
  for (const [bit, name] of Object.entries(PERM_NAMES)) {
    const bigBit = BigInt(bit);
    if ((REQUIRED_PERMS & bigBit) === bigBit && !(effectivePerms & bigBit)) {
      missing.push(name);
    }
  }
  return [...new Set(missing)];
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url     = new URL(req.url);
  const guildId = url.searchParams.get('guildId');

  if (!guildId) {
    return new Response(JSON.stringify({ error: 'guildId required' }), { status: 400 });
  }

  const BOT_TOKEN     = process.env.BOT_TOKEN;
  const BOT_CLIENT_ID = process.env.BOT_CLIENT_ID;
  const BASE          = 'https://discord.com/api/v10';
  const headers       = { Authorization: `Bot ${BOT_TOKEN}` };

  // ─── Cek bot ada di guild ─────────────────────────────────────────────────
  let botMember;
  try {
    const res = await fetch(`${BASE}/guilds/${guildId}/members/${BOT_CLIENT_ID}`, { headers });
    if (res.status === 404) {
      return new Response(JSON.stringify({
        inGuild     : false,
        inviteUrl   : `https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}&permissions=1099511696400&scope=bot`,
        missingPerms: [],
        channels    : [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    botMember = await res.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Discord API error' }), { status: 502 });
  }

  // ─── Ambil guild info untuk hitung perms ─────────────────────────────────
  let guildRoles = {};
  try {
    const res   = await fetch(`${BASE}/guilds/${guildId}`, { headers });
    const guild = await res.json();
    for (const role of (guild.roles ?? [])) {
      guildRoles[role.id] = role;
    }
  } catch { /* lanjut tanpa role calc */ }

  // ─── Hitung effective permissions dari roles bot ──────────────────────────
  let effectivePerms = 0n;

  // Tambah @everyone role dulu
  const everyoneRole = guildRoles[guildId];
  if (everyoneRole) effectivePerms |= BigInt(everyoneRole.permissions);

  // Loop semua role bot
  for (const roleId of (botMember.roles ?? [])) {
    const role = guildRoles[roleId];
    if (role) {
      const rolePerm = BigInt(role.permissions);
      effectivePerms |= rolePerm;
      // Kalau punya Administrator, langsung skip — semua permission granted
      if (effectivePerms & 0x8n) break;
    }
  }

  const missingPerms = getMissingPerms(effectivePerms);

  // ─── Ambil list channels ──────────────────────────────────────────────────
  let channels = [];
  try {
    const res  = await fetch(`${BASE}/guilds/${guildId}/channels`, { headers });
    const data = await res.json();
    channels = data
      .filter(ch => ch.type === 0) // GUILD_TEXT only
      .sort((a, b) => a.position - b.position)
      .map(ch => ({ id: ch.id, name: ch.name, parentId: ch.parent_id }));
  } catch { /* channels kosong */ }

  return new Response(JSON.stringify({
    inGuild     : true,
    missingPerms,
    channels,
    inviteUrl   : `https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}&permissions=1099511696400&scope=bot`,
        // debug
    _botRoles   : botMember.roles,
    _effectivePerms: effectivePerms.toString(),
    _guildRoleIds: Object.keys(guildRoles),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export const config = { path: '/api/bot-status' };
