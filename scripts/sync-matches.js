// sync-matches.js — GitHub Action that syncs Sportmonks v3 → Firebase
// Runs server-side: no CORS issues, full API access

const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const SPORTMONKS_TOKEN = process.env.SPORTMONKS_TOKEN || process.env.FOOTBALL_API_KEY || 'Gh7ARv5qQgeqC9HaSdeGiV7mWWqNqAvdcackmfPivzEQSRvUEorH0pkWzT9o';
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT_ID || 'centauro-mundial-2026';

if (!getApps().length) {
  let serviceAccount = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decoded);
    } catch (e) {
      console.error('[Firebase Admin] Error decoding service account:', e.message);
    }
  }
  
  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount)
    });
    console.log('[Firebase Admin] Inicializado con Service Account decodificada.');
  } else {
    initializeApp({
      projectId: FIREBASE_PROJECT
    });
    console.log('[Firebase Admin] Inicializado por defecto (Project ID).');
  }
}

const db = getFirestore();

const TEAM_MAP = {
  'Mexico': 'México', 'South Africa': 'Sudáfrica', 'Korea Republic': 'Corea del Sur',
  'Czechia': 'Rep. Checa', 'Czech Republic': 'Rep. Checa', 'Canada': 'Canadá',
  'Bosnia-Herzegovina': 'Bosnia', 'Bosnia and Herzegovina': 'Bosnia',
  'United States': 'EE. UU.', 'USA': 'EE. UU.', 'Qatar': 'Catar',
  'Brazil': 'Brasil', 'Morocco': 'Marruecos', 'Haiti': 'Haití', 'Scotland': 'Escocia',
  'Australia': 'Australia', 'Turkey': 'Turquía', 'Türkiye': 'Turquía', 'Germany': 'Alemania', 'Curaçao': 'Curazao', 'Curaçao': 'Curazao',
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

async function smFetch(path) {
  const url = `https://api.sportmonks.com/v3/football${path}${path.includes('?') ? '&' : '?'}api_token=${SPORTMONKS_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sportmonks API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function firebasePatch(collection, docId, fields) {
  const cleanFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) {
      cleanFields[k] = v;
    }
  }
  await db.collection(collection).doc(docId).set(cleanFields, { merge: true });
}

async function firebasePost(collection, fields) {
  const cleanFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) {
      cleanFields[k] = v;
    }
  }
  cleanFields.createdAt = new Date().toISOString();
  await db.collection(collection).add(cleanFields);
}

async function getExistingEvents(matchId) {
  try {
    const snap = await db.collection('events').where('matchId', '==', matchId).get();
    const docs = [];
    snap.forEach(doc => {
      docs.push(doc.ref);
    });
    return docs;
  } catch (e) {
    console.error(`  ⚠️ Error getting existing events for ${matchId}:`, e.message);
    return [];
  }
}

async function deleteEvent(docRef) {
  await docRef.delete();
}


function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-záéíóúñü]/g, '');
}

async function syncMatches() {
  console.log('🔄 Fetching fixtures range from Sportmonks v3...');
  
  // Calculate yesterday and tomorrow range in VET (UTC-4)
  const today = new Date();
  const yesterday = new Date(today.getTime() - 2 * 24 * 3600 * 1000);
  const tomorrow = new Date(today.getTime() + 2 * 24 * 3600 * 1000);
  
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  
  const startDate = fmtDate(yesterday);
  const endDate = fmtDate(tomorrow);
  
  console.log(`Range: ${startDate} to ${endDate}`);
  const url = `/fixtures/between/${startDate}/${endDate}?include=participants;scores;events.player;statistics.type`;
  const res = await smFetch(url);
  
  if (!res.data || res.data.length === 0) {
    console.log('No matches found in range.');
    return;
  }
  
  console.log(`📋 Found ${res.data.length} matches in API range.`);
  
  // Fetch all matches from Firestore once to match in-memory and save thousands of read operations
  console.log('🔄 Fetching all matches from Firestore...');
  let firestoreMatches = [];
  try {
    const snap = await db.collection('matches').get();
    snap.forEach(doc => {
      firestoreMatches.push({ id: doc.id, ...doc.data() });
    });
    console.log(`✅ Loaded ${firestoreMatches.length} matches from Firestore.`);
  } catch (e) {
    console.error('❌ Error fetching matches from Firestore:', e.message);
    return;
  }
  
  let updated = 0;
  
  for (const fixture of res.data) {
    const participants = fixture.participants || [];
    const homeTeamObj = participants.find(p => p.meta?.location === 'home');
    const awayTeamObj = participants.find(p => p.meta?.location === 'away');
    
    if (!homeTeamObj || !awayTeamObj) continue;
    
    const homeEs = spanishName(homeTeamObj.name || homeTeamObj.short_code);
    const awayEs = spanishName(awayTeamObj.name || awayTeamObj.short_code);
    
    // Find matching Firestore Match ID
    let matchId = null;
    let swap = false;
    let groupLetter = null;
    
    // Match against Firestore matches loaded in-memory
    for (const fm of firestoreMatches) {
      const t1 = fm.t1 || '';
      const t2 = fm.t2 || '';
      
      // Match candidate list for safety: only match if fm.id is in our expected GROUP_MATCH_IDS structure
      const isExpectedGroupMatch = Object.values(GROUP_MATCH_IDS).some(cids => cids.includes(fm.id));
      if (!isExpectedGroupMatch) continue;
      
      if (norm(t1) === norm(homeEs) && norm(t2) === norm(awayEs)) {
        matchId = fm.id;
        swap = false;
        groupLetter = (fm.g || '').replace('Grupo ', '').trim();
        break;
      }
      if (norm(t1) === norm(awayEs) && norm(t2) === norm(homeEs)) {
        matchId = fm.id;
        swap = true;
        groupLetter = (fm.g || '').replace('Grupo ', '').trim();
        break;
      }
    }
    
    if (!matchId) {
      console.log(`  ⚠️ Could not match teams: ${homeEs} vs ${awayEs}`);
      continue;
    }
    
    // Extract scores
    let s1 = null, s2 = null;
    const scores = fixture.scores || [];
    const currentScores = scores.filter(s => s.description === 'CURRENT');
    if (currentScores.length > 0) {
      const homeScoreObj = currentScores.find(s => s.participant_id === homeTeamObj.id);
      const awayScoreObj = currentScores.find(s => s.participant_id !== homeTeamObj.id);
      const apiHomeScore = homeScoreObj ? homeScoreObj.score.goals : 0;
      const apiAwayScore = awayScoreObj ? awayScoreObj.score.goals : 0;
      s1 = swap ? apiAwayScore : apiHomeScore;
      s2 = swap ? apiHomeScore : apiAwayScore;
    } else {
      const ftScores = scores.filter(s => s.description === 'FT');
      if (ftScores.length > 0) {
        const homeScoreObj = ftScores.find(s => s.participant_id === homeTeamObj.id);
        const awayScoreObj = ftScores.find(s => s.participant_id !== homeTeamObj.id);
        const apiHomeScore = homeScoreObj ? homeScoreObj.score.goals : 0;
        const apiAwayScore = awayScoreObj ? awayScoreObj.score.goals : 0;
        s1 = swap ? apiAwayScore : apiHomeScore;
        s2 = swap ? apiHomeScore : apiAwayScore;
      }
    }
    
    if (s1 === null || s2 === null) continue;
    
    const stateId = fixture.state_id;
    const isFinished = [5, 7, 8, 14, 15, 17].includes(stateId);
    const isLive = [2, 3, 6, 9, 21, 22, 25].includes(stateId);
    const status = isFinished ? 'finished' : (isLive ? 'live' : 'scheduled');
    
    const winner = s1 > s2 ? homeEs : s2 > s1 ? awayEs : null;
    
    const matchData = {
      s1, s2, status, t1: swap ? awayEs : homeEs, t2: swap ? homeEs : awayEs, winner,
      phase: 'grupos', g: `Grupo ${groupLetter}`,
    };
    
    // Add statistics
    const statistics = fixture.statistics || [];
    const updateMaskFields = [];
    
    for (const s of statistics) {
      const typeId = s.type_id;
      const loc = s.location;
      const val = s.data?.value;
      if (val === undefined || val === null) continue;
      const isHome = loc === 'home';
      const side = ((isHome && !swap) || (!isHome && swap)) ? 't1' : 't2';
      
      let key = null;
      if (typeId === 45) key = `poss${side.slice(1)}`;
      else if (typeId === 86) key = `shots${side.slice(1)}`;
      else if (typeId === 80) key = `passes${side.slice(1)}`;
      else if (typeId === 34) key = `corners${side.slice(1)}`;
      else if (typeId === 56) key = `fouls${side.slice(1)}`;
      else if (typeId === 51) key = `offsides${side.slice(1)}`;
      
      if (key) {
        matchData[key] = parseInt(val);
        updateMaskFields.push(`updateMask.fieldPaths=${key}`);
      }
    }
    
    // Base mask fields
    const baseMask = ['s1', 's2', 'status', 't1', 't2', 'winner', 'phase', 'g'];
    const maskParams = '&' + baseMask.map(f => `updateMask.fieldPaths=${f}`).concat(updateMaskFields).join('&');
    
    await firebasePatch('matches', matchId, matchData);
    console.log(`  ✅ ${matchId}: ${homeEs} ${s1}-${s2} ${awayEs} (${status})`);
    
    // Sync Events
    try {
      const existing = await getExistingEvents(matchId);
      // Delete existing events
      for (const docRef of existing) {
        await deleteEvent(docRef);
      }
      
      const events = fixture.events || [];
      events.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
      
      for (const e of events) {
        const typeId = e.type_id;
        const minute = e.minute || 0;
        const player = e.player_name || 'Jugador';
        const relPlayer = e.related_player_name || '';
        const participantId = e.participant_id;
        
        const isHome = participantId === homeTeamObj.id;
        const side = ((isHome && !swap) || (!isHome && swap)) ? 't1' : 't2';
        
        let evtType = null;
        let goalType = null;
        let playerOut = null;
        
        if ([14, 15, 16].includes(typeId)) {
          evtType = 'goal';
          if (typeId === 15) goalType = 'own';
          else if (typeId === 16) goalType = 'penalty';
          else goalType = 'play';
        } else if (typeId === 19) {
          evtType = 'yellow';
        } else if ([20, 21].includes(typeId)) {
          evtType = 'red';
        } else if (typeId === 18) {
          evtType = 'sub';
          playerOut = relPlayer;
        }
        
        if (evtType) {
          const evt = {
            matchId,
            type: evtType,
            minute,
            player,
            team: side,
          };
          if (goalType) evt.goalType = goalType;
          if (playerOut) evt.playerOut = playerOut;
          
          await firebasePost('events', evt);
          console.log(`    ⚽ ${evt.type} - ${evt.minute}' ${evt.player}`);
        }
      }
    } catch (e) {
      console.log(`    ⚠️ Error syncing events: ${e.message}`);
    }
    
    updated++;
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n✅ Done. Updated ${updated} matches.`);
}

syncMatches().catch(e => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
