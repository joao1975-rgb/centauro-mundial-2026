// sync-matches.js — GitHub Action that syncs football-data.org → Firebase
// Runs server-side: no CORS issues, full API access

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const FIREBASE_PROJECT = 'centauro-mundial-2026';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

const TEAM_MAP = {
  'Mexico': 'México', 'South Africa': 'Sudáfrica', 'Korea Republic': 'Corea del Sur',
  'Czechia': 'Rep. Checa', 'Canada': 'Canadá', 'Bosnia-Herzegovina': 'Bosnia', 'Bosnia and Herzegovina': 'Bosnia',
  'United States': 'EE. UU.', 'USA': 'EE. UU.', 'Qatar': 'Catar',
  'Brazil': 'Brasil', 'Morocco': 'Marruecos', 'Haiti': 'Haití', 'Scotland': 'Escocia',
  'Australia': 'Australia', 'Turkey': 'Turquía', 'Germany': 'Alemania', 'Curaçao': 'Curazao',
  'Netherlands': 'Países Bajos', 'Japan': 'Japón', 'Ivory Coast': 'Costa de Marfil', "Côte d'Ivoire": 'Costa de Marfil',
  'Ecuador': 'Ecuador', 'Sweden': 'Suecia', 'Tunisia': 'Túnez',
  'Spain': 'España', 'Cape Verde': 'Cabo Verde', 'Belgium': 'Bélgica', 'Egypt': 'Egipto',
  'Saudi Arabia': 'Arabia Saudita', 'Uruguay': 'Uruguay', 'Iran': 'Irán', 'New Zealand': 'Nva. Zelanda',
  'France': 'Francia', 'Senegal': 'Senegal', 'Iraq': 'Iraq', 'Norway': 'Noruega',
  'Argentina': 'Argentina', 'Algeria': 'Argelia', 'Austria': 'Austria', 'Jordan': 'Jordania',
  'Portugal': 'Portugal', 'Congo DR': 'RD Congo', 'DR Congo': 'RD Congo',
  'England': 'Inglaterra', 'Croatia': 'Croacia', 'Ghana': 'Ghana', 'Panama': 'Panamá',
  'Uzbekistan': 'Uzbekistán', 'Colombia': 'Colombia',
};

const GROUP_MATCH_IDS = {
  'A': ['G01','G02','G25','G28','G53','G54'],
  'B': ['G03','G05','G26','G27','G49','G50'],
  'C': ['G06','G07','G30','G31','G51','G52'],
  'D': ['G04','G08','G29','G32','G59','G60'],
  'E': ['G09','G11','G34','G35','G55','G56'],
  'F': ['G10','G12','G33','G36','G57','G58'],
  'G': ['G14','G16','G38','G40','G65','G66'],
  'H': ['G13','G15','G37','G39','G63','G64'],
  'I': ['G17','G18','G42','G43','G61','G62'],
  'J': ['G19','G20','G41','G44','G71','G72'],
  'K': ['G21','G24','G45','G48','G69','G70'],
  'L': ['G22','G23','G46','G47','G67','G68'],
};

function spanishName(name) {
  return TEAM_MAP[name] || name;
}

async function fdFetch(path) {
  const url = `https://api.football-data.org/v4${path}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': FOOTBALL_API_KEY } });
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${await res.text()}`);
  return res.json();
}

async function firebasePatch(collection, docId, fields) {
  const url = `${FIRESTORE_BASE}/${collection}/${docId}?key=${FIREBASE_API_KEY}`;
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') body.fields[k] = { integerValue: String(v) };
    else if (typeof v === 'string') body.fields[k] = { stringValue: v };
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firebase PATCH ${docId}: ${res.status}`);
  return res.json();
}

async function firebasePost(collection, fields) {
  const url = `${FIRESTORE_BASE}/${collection}?key=${FIREBASE_API_KEY}`;
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') body.fields[k] = { integerValue: String(v) };
    else if (typeof v === 'string') body.fields[k] = { stringValue: v };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firebase POST ${collection}: ${res.status}`);
  return res.json();
}

async function getExistingEvents(matchId) {
  const url = `${FIRESTORE_BASE}/events?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.filter(d =>
    d.fields?.matchId?.stringValue === matchId
  );
}

function matchIdFromTeams(homeEs, awayEs, group) {
  const groupLetter = group?.replace('GROUP_', '');
  const ids = GROUP_MATCH_IDS[groupLetter] || [];
  // We'll match by returning candidate IDs — caller resolves
  return ids;
}

async function syncMatches() {
  console.log('🔄 Fetching World Cup 2026 matches from football-data.org...');
  const data = await fdFetch('/competitions/WC/matches?season=2026');
  console.log(`📋 Found ${data.resultSet.count} matches (${data.resultSet.played} played)`);

  let updated = 0;

  for (const match of data.matches) {
    if (match.status !== 'FINISHED' && match.status !== 'IN_PLAY') continue;

    const homeEs = spanishName(match.homeTeam.shortName || match.homeTeam.name);
    const awayEs = spanishName(match.awayTeam.shortName || match.awayTeam.name);
    const score = match.score;

    if (!score?.fullTime?.home && score?.fullTime?.home !== 0) continue;

    // Find match ID by date + teams
    const utcDate = match.utcDate;
    const vetDate = new Date(new Date(utcDate).getTime() - 4 * 3600000);
    const dateStr = vetDate.toISOString().slice(0, 10);

    // Determine our internal match ID
    let matchId = null;
    if (match.stage === 'GROUP_STAGE') {
      const groupLetter = match.group?.replace('GROUP_', '');
      const candidates = GROUP_MATCH_IDS[groupLetter] || [];
      // Match by team names — we check both orders
      const norm = s => s.toLowerCase().replace(/[^a-záéíóúñü]/g, '');
      // Read existing match docs to find the right one
      for (const cid of candidates) {
        try {
          const url = `${FIRESTORE_BASE}/matches/${cid}?key=${FIREBASE_API_KEY}`;
          const res = await fetch(url);
          if (res.ok) {
            const doc = await res.json();
            const t1 = doc.fields?.t1?.stringValue || '';
            const t2 = doc.fields?.t2?.stringValue || '';
            if ((norm(t1) === norm(homeEs) && norm(t2) === norm(awayEs)) ||
                (norm(t1) === norm(awayEs) && norm(t2) === norm(homeEs))) {
              matchId = cid;
              break;
            }
          }
        } catch (e) { /* skip */ }
      }
    }

    if (!matchId) {
      console.log(`  ⚠️ Could not match: ${homeEs} vs ${awayEs} (${dateStr})`);
      continue;
    }

    const s1 = score.fullTime.home;
    const s2 = score.fullTime.away;
    const winner = s1 > s2 ? homeEs : s2 > s1 ? awayEs : null;
    const status = match.status === 'FINISHED' ? 'finished' : 'live';

    const matchData = {
      s1, s2, status, t1: homeEs, t2: awayEs, winner,
      phase: 'grupos', g: `Grupo ${match.group?.replace('GROUP_', '')}`,
    };

    await firebasePatch('matches', matchId, matchData);
    console.log(`  ✅ ${matchId}: ${homeEs} ${s1}-${s2} ${awayEs} (${status})`);

    // Fetch detailed match data (goals)
    try {
      const detail = await fdFetch(`/matches/${match.id}`);
      if (detail.goals?.length) {
        const existing = await getExistingEvents(matchId);
        // Only add goals if none exist yet
        if (existing.length === 0) {
          for (const goal of detail.goals) {
            const scorerTeam = spanishName(goal.team?.name || '');
            const team = norm(scorerTeam) === norm(homeEs) ? 't1' : 't2';
            const evt = {
              matchId,
              type: 'goal',
              minute: goal.minute || 0,
              player: goal.scorer?.name || '(desconocido)',
              team,
              goalType: goal.type === 'PENALTY' ? 'penalty' : goal.type === 'OWN' ? 'own' : 'play',
            };
            await firebasePost('events', evt);
            console.log(`    ⚽ ${evt.minute}' ${evt.player}`);
          }
        }
      }
    } catch (e) {
      console.log(`    ⚠️ Could not fetch goals: ${e.message}`);
    }

    updated++;

    // Rate limit: free tier = 10 req/min
    await new Promise(r => setTimeout(r, 6500));
  }

  console.log(`\n✅ Done. Updated ${updated} matches.`);

  function norm(s) { return (s || '').toLowerCase().replace(/[^a-záéíóúñü]/g, ''); }
}

syncMatches().catch(e => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
