// Steam data endpoint: GET /api/steam
// Returns the profile + the FULL owned library (sorted by playtime) plus
// level, XP, badges, friend count and achievements for the top games.
// Required Worker settings (Cloudflare dashboard → Workers → portfolio →
// Settings → Variables and Secrets):
//   STEAM_API_KEY — from https://steamcommunity.com/dev/apikey (type: Secret)
//   STEAM_ID      — your 64-bit SteamID (starts with 7656…)
// Your Steam privacy setting "Game details" must be Public. Friends list and
// badges degrade gracefully (null) if their privacy setting is stricter.

// Family-share support: Steam's public API never lists borrowed games, but
// achievements you earn in them live on YOUR profile, and shared games show in
// your recently-played feed. So: FAMILY_STEAM_IDS (comma-separated 64-bit ids
// of the accounts sharing with you) lets refreshShared() diff their libraries
// against yours to learn the shared catalog, then probe your achievements per
// shared game a batch at a time (cron), persisting results in STEAM_CACHE KV.

const ACH_TOP_N = 10; // fetch per-game achievements only for the top N by playtime
const KV_KEY = 'shared:v1';

const API = 'https://api.steampowered.com';
const headerImg = (appid) => 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/header.jpg';
// Swallow every failure mode into null so a private or flaky sub-API
// never takes the whole payload down.
const j = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const ownedGamesUrl = (key, sid) => API + '/IPlayerService/GetOwnedGames/v1/?key=' + key + '&steamid=' + sid + '&include_appinfo=1&include_played_free_games=1&format=json';

const famIds = (env) => (env.FAMILY_STEAM_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

// One refresh pass: rebuild the shared catalog and probe the next `batch`
// appids for the user's achievements. Runs from cron (and as a lazy fallback
// from the fetch handler via waitUntil when the KV state is stale).
export async function refreshShared(env, batch) {
  const key = env.STEAM_API_KEY;
  const id = env.STEAM_ID;
  const fam = famIds(env);
  if (!key || !id || !fam.length || !env.STEAM_CACHE) return;

  const state = (await env.STEAM_CACHE.get(KV_KEY, 'json')) || { catalog: {}, ach: {} };
  const now = Math.floor(Date.now() / 1000);

  const own = await j(ownedGamesUrl(key, id));
  const ownGames = (own && own.response && own.response.games) || [];
  if (!ownGames.length) return; // Steam hiccup — don't wipe the catalog on bad data

  const ownSet = new Set(ownGames.map((g) => g.appid));
  for (const fid of fam) {
    const fo = await j(ownedGamesUrl(key, fid)); // needs their "Game details" set to Public
    for (const g of ((fo && fo.response && fo.response.games) || [])) {
      if (!ownSet.has(g.appid)) state.catalog[g.appid] = { name: g.name };
    }
  }
  for (const appid of Object.keys(state.catalog)) {
    if (ownSet.has(Number(appid))) { delete state.catalog[appid]; delete state.ach[appid]; }
  }

  // Recently-played includes shared games — the only public source of your
  // playtime in games you don't own. Persist it so it sticks once seen.
  const rec = await j(API + '/IPlayerService/GetRecentlyPlayedGames/v1/?key=' + key + '&steamid=' + id + '&format=json');
  for (const g of ((rec && rec.response && rec.response.games) || [])) {
    if (state.catalog[g.appid]) {
      const e = state.ach[g.appid] = state.ach[g.appid] || {};
      e.mins = g.playtime_forever;
      e.weeks2 = g.playtime_2weeks || 0;
      e.seen = now;
    }
  }

  // Probe achievements: never-checked appids first, then the longest-unchecked.
  const todo = Object.keys(state.catalog)
    .sort((a, b) => ((state.ach[a] && state.ach[a].checked) || 0) - ((state.ach[b] && state.ach[b].checked) || 0))
    .slice(0, batch || 35);
  await Promise.all(todo.map(async (appid) => {
    const aj = await j(API + '/ISteamUserStats/GetPlayerAchievements/v1/?key=' + key + '&steamid=' + id + '&appid=' + appid + '&format=json');
    const e = state.ach[appid] = state.ach[appid] || {};
    e.checked = now;
    const list = aj && aj.playerstats && aj.playerstats.achievements;
    if (list && list.length) {
      e.b = list.length;
      e.a = list.filter((x) => x.achieved).length;
    }
  }));

  state.updated = now;
  await env.STEAM_CACHE.put(KV_KEY, JSON.stringify(state));
}

// Shared games worth showing: any the user has achievement stats or recorded
// playtime in. Sorted by achievements earned, then playtime.
async function loadShared(env) {
  if (!env.STEAM_CACHE || !famIds(env).length) return { list: [], stale: true };
  const state = await env.STEAM_CACHE.get(KV_KEY, 'json');
  if (!state) return { list: [], stale: true };
  const list = Object.entries(state.catalog).map(([appid, c]) => {
    const e = state.ach[appid] || {};
    if (e.b == null && e.mins == null) return null;
    return {
      name: c.name,
      appid: Number(appid),
      hours: e.mins != null ? Math.round(e.mins / 60) : null,
      mins: e.mins != null ? e.mins : null,
      weeks2: e.weeks2 || 0,
      last: e.seen || 0,
      img: headerImg(appid),
      a: e.a != null ? e.a : null,
      b: e.b != null ? e.b : null
    };
  }).filter(Boolean).sort((x, y) => ((y.a || 0) - (x.a || 0)) || ((y.hours || 0) - (x.hours || 0)));
  const stale = !state.updated || (Math.floor(Date.now() / 1000) - state.updated) > 7200;
  return { list, stale };
}

export async function handleSteam(env, ctx) {
  const key = env.STEAM_API_KEY;
  const id = env.STEAM_ID;
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=1800'
  };
  if (!key || !id) {
    return new Response(JSON.stringify({ error: 'STEAM_API_KEY / STEAM_ID not configured' }), { status: 503, headers });
  }

  const api = API;

  try {
    const [owned, sum, lvl, badges, friends, shared] = await Promise.all([
      j(ownedGamesUrl(key, id)),
      j(api + '/ISteamUser/GetPlayerSummaries/v2/?key=' + key + '&steamids=' + id + '&format=json'),
      j(api + '/IPlayerService/GetSteamLevel/v1/?key=' + key + '&steamid=' + id + '&format=json'),
      j(api + '/IPlayerService/GetBadges/v1/?key=' + key + '&steamid=' + id + '&format=json'),
      j(api + '/ISteamUser/GetFriendList/v1/?key=' + key + '&steamid=' + id + '&relationship=friend&format=json'),
      loadShared(env)
    ]);

    // Bootstrap / self-heal: if the cron hasn't populated the share cache
    // recently, kick a small refresh batch after the response is sent.
    if (shared.stale && ctx && famIds(env).length) ctx.waitUntil(refreshShared(env, 25));

    const player = (sum && sum.response && sum.response.players && sum.response.players[0]) || {};
    const all = ((owned && owned.response && owned.response.games) || [])
      .slice()
      .sort((a, b) => b.playtime_forever - a.playtime_forever);

    // Achievement progress for the top N games only (one request per game).
    const ach = await Promise.all(all.slice(0, ACH_TOP_N).map(async (g) => {
      const aj = await j(api + '/ISteamUserStats/GetPlayerAchievements/v1/?key=' + key + '&steamid=' + id + '&appid=' + g.appid + '&format=json');
      const list = aj && aj.playerstats && aj.playerstats.achievements;
      if (!list || !list.length) return { a: null, b: null };
      return { a: list.filter((x) => x.achieved).length, b: list.length };
    }));

    const games = all.map((g, i) => ({
      name: g.name,
      appid: g.appid,
      hours: Math.round(g.playtime_forever / 60),
      mins: g.playtime_forever,
      weeks2: g.playtime_2weeks || 0,
      last: g.rtime_last_played || 0,
      img: headerImg(g.appid),
      a: i < ACH_TOP_N ? ach[i].a : null,
      b: i < ACH_TOP_N ? ach[i].b : null
    }));

    const totalHours = Math.round(all.reduce((s, g) => s + g.playtime_forever, 0) / 60);
    const badgeInfo = (badges && badges.response) || {};
    const friendList = friends && friends.friendslist && friends.friendslist.friends;

    return new Response(JSON.stringify({
      name: player.personaname || 'Steam',
      avatar: player.avatarfull || '',
      url: player.profileurl || null,
      state: player.personastate != null ? player.personastate : null, // 0 offline · 1 online · 2 busy · 3 away · 4 snooze
      country: player.loccountrycode || null,
      created: player.timecreated || null, // unix ts of account creation
      level: (lvl && lvl.response && lvl.response.player_level) != null ? lvl.response.player_level : null,
      xp: badgeInfo.player_xp != null ? badgeInfo.player_xp : null,
      badgeCount: badgeInfo.badges ? badgeInfo.badges.length : null,
      friendCount: friendList ? friendList.length : null,
      totalCount: (owned && owned.response && owned.response.game_count) || all.length,
      totalHours,
      recent2wHours: Math.round(all.reduce((s, g) => s + (g.playtime_2weeks || 0), 0) / 60 * 10) / 10,
      games,
      shared: shared.list
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'steam fetch failed' }), { status: 502, headers });
  }
}
