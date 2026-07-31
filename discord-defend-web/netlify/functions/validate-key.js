/**
 * validate-key.js
 * Tujuan     : Netlify Function - validasi key DEFFEND-XXX-XXX-XXX-SR
 * Dipakai    : Web dashboard (index.html) via POST /api/validate-key
 * Dependensi : Netlify Blobs (@netlify/blobs)
 * Fungsi     : handler(req) - lookup key, return payload user + guild info
 * Side effect: Netlify Blobs read (key:{key})
 */

import { getStore } from '@netlify/blobs';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { key } = body;
  if (!key || typeof key !== 'string') {
    return new Response(JSON.stringify({ error: 'Key required' }), { status: 400 });
  }

  const normalized = key.trim().toUpperCase();
  if (!/^DEFFEND-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}-SR$/.test(normalized)) {
    return new Response(JSON.stringify({ error: 'Format key tidak valid' }), { status: 400 });
  }

  try {
    const store = getStore('defend');
    const data  = await store.get(`key:${normalized}`, { type: 'json' });

    if (!data) {
      return new Response(JSON.stringify({ error: 'Key tidak ditemukan' }), { status: 404 });
    }

    if (!data.active) {
      return new Response(JSON.stringify({ error: 'Key sudah dinonaktifkan' }), { status: 403 });
    }

    return new Response(JSON.stringify({
      ok          : true,
      guildId     : data.guildId,
      guildName   : data.guildName,
      username    : data.username,
      displayName : data.displayName,
      pfpUrl      : data.pfpUrl,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[validate-key] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}

export const config = { path: '/api/validate-key' };
