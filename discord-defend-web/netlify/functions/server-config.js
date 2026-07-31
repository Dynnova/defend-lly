/**
 * server-config.js
 * Tujuan     : Netlify Function - GET/POST config server (watch channels, punishment, DM, log)
 * Dipakai    : Web dashboard via /api/server-config?guildId=xxx
 * Dependensi : Netlify Blobs (@netlify/blobs), validate key via store
 * Fungsi     : GET handler - return config, POST handler - save config
 * Side effect: Netlify Blobs read/write (config:{guildId}, key:{key})
 */

import { getStore } from '@netlify/blobs';

export default async function handler(req) {
  const url     = new URL(req.url);
  const guildId = url.searchParams.get('guildId');
  const key     = url.searchParams.get('key');

  if (!guildId || !key) {
    return json({ error: 'guildId dan key required' }, 400);
  }

  // Validasi key dulu
  const store   = getStore('defend');
  const keyData = await store.get(`key:${key.trim().toUpperCase()}`, { type: 'json' }).catch(() => null);

  if (!keyData || !keyData.active || keyData.guildId !== guildId) {
    return json({ error: 'Akses tidak valid' }, 403);
  }

  // ─── GET config ───────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const config = await store.get(`config:${guildId}`, { type: 'json' }).catch(() => null);
    return json({ ok: true, config: config ?? {} });
  }

  // ─── POST / save config ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }

    const allowed = ['watchChannels', 'logChannelId', 'dmMessage', 'punishment', 'dmBeforePunish', 'active'];
    const config  = {};
    for (const field of allowed) {
      if (body[field] !== undefined) config[field] = body[field];
    }

    // Validasi punishment value
    if (config.punishment && !['timeout', 'kick', 'ban'].includes(config.punishment)) {
      return json({ error: 'punishment harus timeout/kick/ban' }, 400);
    }

    config.guildId   = guildId;
    config.updatedAt = new Date().toISOString();

    await store.setJSON(`config:${guildId}`, config);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = { path: '/api/server-config' };
