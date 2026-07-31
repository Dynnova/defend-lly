/**
 * partner-list.js
 * Tujuan     : Netlify Function - return semua server yang terdaftar pakai DEFFEND
 * Dipakai    : Web dashboard via GET /api/partner-list?key=xxx
 * Dependensi : @netlify/blobs
 * Side effect: Netlify Blobs read
 */

import { getStore } from '@netlify/blobs';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get('key');

  if (!key) {
    return new Response(JSON.stringify({ error: 'key required' }), { status: 400 });
  }

  try {
    const store      = getStore('defend');
    const normalized = key.trim().toUpperCase();

    // Validasi key
    const keyData = await store.get(`key:${normalized}`, { type: 'json' });
    if (!keyData || !keyData.active) {
      return new Response(JSON.stringify({ error: 'Key tidak valid' }), { status: 403 });
    }

    // List semua blob dengan prefix guild:
    const { blobs } = await store.list({ prefix: 'guild:' });

    const servers = [];
    for (const blob of blobs) {
      try {
        const data = await store.get(blob.key, { type: 'json' });
        if (!data) continue;

        // Ambil detail dari key data
        const kData = await store.get(`key:${data.key}`, { type: 'json' });
        if (!kData) continue;

        servers.push({
          guildId  : kData.guildId,
          guildName: kData.guildName,
          iconUrl  : kData.guildIconUrl ?? null,
          createdAt: kData.createdAt,
          active   : kData.active,
        });
      } catch { /* skip */ }
    }

    // Sort by createdAt terbaru
    servers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return new Response(JSON.stringify({ ok: true, servers }), {
      status : 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[partner-list] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}

export const config = { path: '/api/partner-list' };
