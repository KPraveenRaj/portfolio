// Cloudflare Pages Function: GET /api/steam
// Returns the profile + top-6-by-playtime games for the SteamID in env vars.
// Required environment variables (set in Cloudflare Pages → Settings → Variables and Secrets):
//   STEAM_API_KEY — from https://steamcommunity.com/dev/apikey (store as Secret)
//   STEAM_ID      — your 64-bit SteamID (starts with 7656…)
// Your Steam privacy setting "Game details" must be Public.

export async function onRequest(context) {
  const { env } = context;
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
  try {
    const api = 'https://api.steampowered.com';
    const [ownedR, sumR, lvlR] = await Promise.all([
      fetch(api + '/IPlayerService/GetOwnedGames/v1/?key=' + key + '&steamid=' + id + '&include_appinfo=1&include_played_free_games=1&format=json'),
      fetch(api + '/ISteamUser/GetPlayerSummaries/v2/?key=' + key + '&steamids=' + id + '&format=json'),
      fetch(api + '/IPlayerService/GetSteamLevel/v1/?key=' + key + '&steamid=' + id + '&format=json')
    ]);
    const owned = await ownedR.json();
    const sum = await sumR.json();
    const lvl = await lvlR.json();

    const player = (sum.response && sum.response.players && sum.response.players[0]) || {};
    const all = (owned.response && owned.response.games) || [];
    const top = all.slice().sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 6);

    const games = await Promise.all(top.map(async (g) => {
      let a = null, b = null;
      try {
        const ar = await fetch(api + '/ISteamUserStats/GetPlayerAchievements/v1/?key=' + key + '&steamid=' + id + '&appid=' + g.appid + '&format=json');
        if (ar.ok) {
          const aj = await ar.json();
          const list = aj.playerstats && aj.playerstats.achievements;
          if (list && list.length) { b = list.length; a = list.filter((x) => x.achieved).length; }
        }
      } catch (e) { /* some games have no achievements — fine */ }
      return {
        name: g.name,
        appid: g.appid,
        hours: Math.round(g.playtime_forever / 60),
        weeks2: g.playtime_2weeks || 0,
        img: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + g.appid + '/header.jpg',
        a, b
      };
    }));

    const totalHours = Math.round(all.reduce((s, g) => s + g.playtime_forever, 0) / 60);
    return new Response(JSON.stringify({
      name: player.personaname || 'Steam',
      avatar: player.avatarfull || '',
      level: (lvl.response && lvl.response.player_level) != null ? lvl.response.player_level : null,
      totalCount: (owned.response && owned.response.game_count) || all.length,
      totalHours,
      games
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'steam fetch failed' }), { status: 502, headers });
  }
}
