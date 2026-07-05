// Cloudflare Worker entry point.
// Serves /api/steam from src/steam.js; everything else falls through to the
// static assets in public/ (configured in wrangler.jsonc).

import { handleSteam, refreshShared } from './steam.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/steam') {
      return handleSteam(env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
  // Cron (wrangler.jsonc triggers): probe family-share achievements in batches.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshShared(env, 35));
  }
};
