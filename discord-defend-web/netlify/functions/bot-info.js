/**
 * bot-info.js
 * Tujuan     : Netlify Function - return blacklist info + watch server info
 * Dipakai    : Web dashboard via GET /api/bot-info?key=xxx
 * Dependensi : @netlify/blobs, validate key dari Netlify Blobs
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
    const store = getStore('defend');

    // Validasi key dulu
    const normalized = key.trim().toUpperCase();
    const keyData    = await store.get(`key:${normalized}`, { type: 'json' });
    if (!keyData || !keyData.active) {
      return new Response(JSON.stringify({ error: 'Key tidak valid' }), { status: 403 });
    }

    // Ambil blacklist info
    const info = await store.get('blacklist:info', { type: 'json' });
    if (!info) {
      return new Response(JSON.stringify({
        ok         : true,
        filenames  : [],
        lastUpdated: null,
        watchInfo  : {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      ok         : true,
      filenames  : info.filenames  ?? [],
      lastUpdated: info.lastUpdated ?? null,
      watchInfo  : info.watchInfo  ?? {},
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[bot-info] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}

export const config = { path: '/api/bot-info' };
