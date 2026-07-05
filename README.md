# Praveen Raj — Portfolio

Live at https://portfolio.konatham-praveen-raj.workers.dev (Cloudflare **Worker** with static assets).

What's inside:

- `public/index.html` — the whole app, self-contained (fonts, scripts, styles inlined)
- `public/assets/Praveen-Raj-Resume.pdf` — linked by the résumé buttons
- `src/index.js` — Worker entry: serves `/api/steam`, falls back to static assets
- `src/steam.js` — the Steam API logic
- `wrangler.jsonc` — Worker config (`name: portfolio`, assets from `public/`)

The Games tab shows sample data until the Steam env vars are set, then switches to
**LIVE · STEAM** automatically.

## Deploys

The GitHub repo is connected to Cloudflare Workers Builds — every push to `main`
redeploys automatically:

```bash
git add . && git commit -m "update" && git push
```

You can also deploy directly from this folder:

```bash
npx wrangler deploy
```

## Live Steam data

1. API key: https://steamcommunity.com/dev/apikey (any domain name is fine)
2. Your 64-bit SteamID (starts `7656…`): visible in your profile URL, or via steamid.io
3. Steam → Edit Profile → Privacy → set **Game details = Public**
4. Set the env vars on the **Worker** (dashboard → Workers & Pages → `portfolio` →
   Settings → Variables and Secrets), or from this folder:

   ```bash
   npx wrangler secret put STEAM_API_KEY   # paste the key when prompted
   ```

   `STEAM_ID` can be a plain-text variable (dashboard) — `keep_vars: true` in
   `wrangler.jsonc` stops deploys from wiping it. Secrets always survive deploys.

Responses cache for 30 min, so playtimes update roughly twice an hour.

## Updating the site

Export a fresh `index.html` from the design project, replace `public/index.html`,
commit and push.

## Custom domain (optional)

Dashboard → Workers & Pages → `portfolio` → Settings → Domains & Routes.
