// Cloudflare Worker — CORS proxy for football-data.org
// Deploy: https://workers.cloudflare.com → Create Worker → Paste this code
const ALLOWED_ORIGIN = 'https://joao1975-rgb.github.io';
const API_BASE = 'https://api.football-data.org/v4';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname + url.search;

    if (!path.startsWith('/v4/')) {
      return new Response(JSON.stringify({ error: 'Use /v4/... paths' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    const apiUrl = API_BASE + path.slice(3);
    const token = request.headers.get('X-Auth-Token') || url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing X-Auth-Token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    const resp = await fetch(apiUrl, { headers: { 'X-Auth-Token': token } });
    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Cache-Control': 'public, max-age=60',
      },
    });
  },
};
