# Praveen Raj — Portfolio · deploy package

What's inside:

- `index.html` — the whole app, self-contained (fonts, scripts, styles inlined)
- `assets/Praveen-Raj-Resume.pdf` — linked by the résumé buttons
- `functions/api/steam.js` — Cloudflare Pages Function that serves your live Steam data at `/api/steam`

The Games tab shows sample data until step 3 is done, then switches to **LIVE · STEAM** automatically.

## 1 · Push this folder to GitHub

```bash
cd <this folder>
git init
git add .
git commit -m "Portfolio v1"
```

Create an empty repo on github.com (e.g. `portfolio`, no README), then:

```bash
git remote add origin https://github.com/KPraveenRaj/portfolio.git
git branch -M main
git push -u origin main
```

## 2 · Deploy on Cloudflare Pages

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Pick the repo. Framework preset: **None** · Build command: *(empty)* · Build output directory: `/`
3. **Save and Deploy** → site is live at `https://<project>.pages.dev`

> Note: use the Git flow (not dashboard drag-and-drop) — drag-and-drop skips the `functions/` folder, so Steam sync wouldn't run.

## 3 · Turn on live Steam data

1. API key: https://steamcommunity.com/dev/apikey (any domain name is fine)
2. Your 64-bit SteamID (starts `7656…`): visible in your profile URL, or via steamid.io
3. Steam → Edit Profile → **Privacy** → set **Game details = Public**
4. Cloudflare → your Pages project → **Settings → Variables and Secrets** (Production):
   - `STEAM_API_KEY` = your key (type: **Secret** — never commit this to git)
   - `STEAM_ID` = `7656…`
5. **Deployments** → redeploy the latest build. Open the site → Games tab shows **LIVE · STEAM**.

Responses cache for 30 min, so playtimes update roughly twice an hour.

## 4 · Custom domain (optional)

Pages project → **Custom domains** → add yours and follow the DNS prompt.

## Updating the site

Export a fresh `index.html` from the design project, replace it here, then:

```bash
git add . && git commit -m "update" && git push
```

Pages redeploys automatically on push.
