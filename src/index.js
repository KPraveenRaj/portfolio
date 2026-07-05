// Cloudflare Worker entry point.
// Serves /api/steam from src/steam.js; everything else falls through to the
// static assets in public/ (configured in wrangler.jsonc).

import { handleSteam } from './steam.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/steam') {
      return handleSteam(env);
    }
    return env.ASSETS.fetch(request);
  }
};
