// Steam data endpoint: GET /api/steam
// Returns the profile + the FULL owned library (sorted by playtime) plus
// level, XP, badges, friend count and achievements for the top games.
// Required Worker settings (Cloudflare dashboard → Workers → portfolio →
// Settings → Variables and Secrets):
//   STEAM_API_KEY — from https://steamcommunity.com/dev/apikey (type: Secret)
//   STEAM_ID      — your 64-bit SteamID (starts with 7656…)
// Your Steam privacy setting "Game details" must be Public. Friends list and
// badges degrade gracefully (null) if their privacy setting is stricter.

const ACH_TOP_N = 10; // fetch per-game achievements only for the top N by playtime

export async function handleSteam(env) {
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

  const api = 'https://api.steampowered.com';
  // Swallow every failure mode into null so a private or flaky sub-API
  // never takes the whole payload down.
  const j = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  try {
    const [owned, sum, lvl, badges, friends] = await Promise.all([
      j(api + '/IPlayerService/GetOwnedGames/v1/?key=' + key + '&steamid=' + id + '&include_appinfo=1&include_played_free_games=1&format=json'),
      j(api + '/ISteamUser/GetPlayerSummaries/v2/?key=' + key + '&steamids=' + id + '&format=json'),
      j(api + '/IPlayerService/GetSteamLevel/v1/?key=' + key + '&steamid=' + id + '&format=json'),
      j(api + '/IPlayerService/GetBadges/v1/?key=' + key + '&steamid=' + id + '&format=json'),
      j(api + '/ISteamUser/GetFriendList/v1/?key=' + key + '&steamid=' + id + '&relationship=friend&format=json')
    ]);

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
      img: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + g.appid + '/header.jpg',
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
      games
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'steam fetch failed' }), { status: 502, headers });
  }
}
