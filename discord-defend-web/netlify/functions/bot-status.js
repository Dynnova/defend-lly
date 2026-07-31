/**
 * bot-status.js
 * Tujuan     : Netlify Function - cek bot ada di guild + validasi permissions + list channels
 * Dipakai    : Web dashboard via GET /api/bot-status?guildId=xxx&key=xxx
 * Dependensi : Discord REST API, @netlify/blobs, env BOT_TOKEN, BOT_CLIENT_ID
 * Side effect: Discord API read, Netlify Blobs write (guild icon)
 */

import { getStore } from '@netlify/blobs';

const REQUIRED_PERMS = BigInt('1099511704582');

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

async function saveGuildIcon(guildName, guildId, iconHash, key) {
  try {
    const store      = getStore('defend');
    const iconUrl    = iconHash
      ? `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=128`
      : null;
    const normalized = key?.trim().toUpperCase();
    if (!normalized) return;
    const keyData = await store.get(`key:${normalized}`, { type: 'json' });
    if (!keyData) return;
    keyData.guildIconUrl = iconUrl;
    keyData.guildName    = guildName;
    await store.setJSON(`key:${normalized}`, keyData);
  } catch { /* skip */ }
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url     = new URL(req.url);
  const guildId = url.searchParams.get('guildId');
  const key     = url.searchParams.get('key') ?? null;

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
        inviteUrl   : `https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}&permissions=1099511704582&scope=bot%20applications.commands`,
        missingPerms: [],
        channels    : [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    botMember = await res.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Discord API error' }), { status: 502 });
  }

  // ─── Ambil guild info ─────────────────────────────────────────────────────
  let guildRoles = {};
  let guildName  = '';
  let iconHash   = null;
  try {
    const res   = await fetch(`${BASE}/guilds/${guildId}`, { headers });
    const guild = await res.json();
    guildName   = guild.name ?? '';
    iconHash    = guild.icon ?? null;
    for (const role of (guild.roles ?? [])) {
      guildRoles[role.id] = role;
    }
    // Simpan icon server ke Blobs kalau ada key
    if (key) saveGuildIcon(guildName, guildId, iconHash, key);
  } catch { /* lanjut */ }

  // ─── Hitung effective permissions ─────────────────────────────────────────
  let effectivePerms = 0n;
  const everyoneRole = guildRoles[guildId];
  if (everyoneRole) effectivePerms |= BigInt(everyoneRole.permissions);
  for (const roleId of (botMember.roles ?? [])) {
    const role = guildRoles[roleId];
    if (role) {
      effectivePerms |= BigInt(role.permissions);
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
      .filter(ch => ch.type === 0)
      .sort((a, b) => a.position - b.position)
      .map(ch => ({ id: ch.id, name: ch.name, parentId: ch.parent_id }));
  } catch { /* channels kosong */ }

  return new Response(JSON.stringify({
    inGuild     : true,
    guildName,
    missingPerms,
    channels,
    inviteUrl   : `https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}&permissions=1099511704582&scope=bot%20applications.commands`,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export const config = { path: '/api/bot-status' };
