// Dom proxy helper
function getProxyUrl(url) {
  if (!url) return '';
  if (typeof url !== 'string') return url;
  if (url.startsWith('/') || url.startsWith('data:')) return url;
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
}

// Placeholder de marca (silueta) para cuando NO hay foto real del jugador.
// Inline SVG => nunca falla, nunca muestra el "NO PHOTO" de SportMonks.
const STAR_PLACEHOLDER =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
    '<defs><radialGradient id="g" cx="50%" cy="35%" r="75%">' +
    '<stop offset="0%" stop-color="#5a2a6b"/><stop offset="100%" stop-color="#1c0d24"/>' +
    '</radialGradient></defs>' +
    '<rect width="200" height="200" fill="url(#g)"/>' +
    '<circle cx="100" cy="78" r="34" fill="#85439a"/>' +
    '<path d="M40 184c0-33 27-54 60-54s60 21 60 54z" fill="#85439a"/>' +
    '<circle cx="100" cy="100" r="96" fill="none" stroke="#f79131" stroke-width="6"/>' +
    '</svg>'
  );

// Asigna una foto de estrella con fallback garantizado.
// - Si no hay URL real => muestra el placeholder de marca.
// - Si la URL falla al cargar (404/placeholder) => onerror => placeholder.
function setStarImg(imgEl, url) {
  if (!imgEl) return;
  imgEl.onerror = () => {
    imgEl.onerror = null; // evita bucle si el placeholder fallara
    imgEl.src = STAR_PLACEHOLDER;
  };
  imgEl.src = url ? getProxyUrl(url) : STAR_PLACEHOLDER;
}

// DOM Elements - Slide 1 (Scoreboard / Flyer)
const widget = document.getElementById('widget');
const statusBadgeS1 = document.getElementById('status-badge-s1');
const statusTextS1 = document.getElementById('status-text-s1');

const homeFlag = document.getElementById('home-flag');
const homeName = document.getElementById('home-name');
const homeScore = document.getElementById('home-score');

const awayFlag = document.getElementById('away-flag');
const awayName = document.getElementById('away-name');
const awayScore = document.getElementById('away-score');

const homeFlipper = document.getElementById('home-flipper');
const awayFlipper = document.getElementById('away-flipper');
const homeStarImg = document.getElementById('home-star-img');
const awayStarImg = document.getElementById('away-star-img');
const homeStarName = document.getElementById('home-star-name');
const awayStarName = document.getElementById('away-star-name');

const matchClock = document.getElementById('match-clock');
const scoreDisplay = document.getElementById('score-display');
const upcomingInfo = document.getElementById('upcoming-info');

const kickoffGroup = document.getElementById('kickoff-group');
const sidebarRight = document.getElementById('sidebar-right');
const kickoffStadium = document.getElementById('kickoff-stadium');
const kickoffCity = document.getElementById('kickoff-city');

// DOM Elements - Slide 2 (Events)
const statusBadgeS2 = document.getElementById('status-badge-s2');
const statusTextS2 = document.getElementById('status-text-s2');

const miniHome = document.getElementById('mini-home');
const miniAway = document.getElementById('mini-away');
const miniScoreVal = document.getElementById('mini-score-val');
const miniClockVal = document.getElementById('mini-clock-val');

const listGoles = document.getElementById('list-goles');
const listTarjetas = document.getElementById('list-tarjetas');
const listCambios = document.getElementById('list-cambios');

// DOM Elements - Slide 3 (CTA / Interaction)
const statusBadgeS3 = document.getElementById('status-badge-s3');
const statusTextS3 = document.getElementById('status-text-s3');

const miniHomeS3 = document.getElementById('mini-home-s3');
const miniAwayS3 = document.getElementById('mini-away-s3');
const miniScoreValS3 = document.getElementById('mini-score-val-s3');
const miniClockValS3 = document.getElementById('mini-clock-val-s3');

const pollNameHome = document.getElementById('poll-name-home');
const pollNameAway = document.getElementById('poll-name-away');
const pollBarHomeVal = document.getElementById('poll-bar-home-val');
const pollBarAwayVal = document.getElementById('poll-bar-away-val');
const pollPctHome = document.getElementById('poll-pct-home');
const pollPctAway = document.getElementById('poll-pct-away');

// Navigation & Indicators
const slide1 = document.getElementById('slide-scoreboard');
const slide2 = document.getElementById('slide-events');
const slideCta = document.getElementById('slide-cta');
const slideIndicators = document.getElementById('slide-indicators');
const dotS1 = document.getElementById('dot-s1');
const dotS2 = document.getElementById('dot-s2');
const dotS3 = document.getElementById('dot-s3');

// Goal Overlay Elements
const goalOverlay = document.getElementById('goal-overlay');
const goalPlayerName = document.getElementById('goal-player-name');
const goalPlayerTeam = document.getElementById('goal-player-team');
const goalMinuteVal = document.getElementById('goal-minute-val');
const goalScoreNew = document.getElementById('goal-score-new');
const goalPlayerImg = document.getElementById('goal-player-img');
const goalPlayerImgWrapper = document.getElementById('goal-player-img-wrapper');

// State tracking
let lastScore = { home: 0, away: 0 };
let initialized = false;
let isGoalOverlayActive = false;
let currentMatchState = 'scheduled'; // 'scheduled', 'live', 'finished'
let activeSlideNum = 1;
let flagsFlipped = false;

let allMatches = []; // Today's parsed matches
let scheduledMatches = []; // Playlist of upcoming matches
let currentScheduledIndex = 0;
let liveMatches = []; // Playlist de partidos EN VIVO simultáneos
let currentLiveIndex = 0; // Índice del partido en vivo que se muestra ahora
let activeMatchId = null;

// Configuration
let pollInterval = 5000; // Poll every 5s
let apiMode = 'real'; // 'real' or 'mock'
let mockState = 'live'; // 'upcoming', 'live', 'goal', 'finished'

// === Cadencias PROGRAMABLES (se sobreescriben con config.json) ===
let CONFIG = {
  anuncio_cada_min: 5,      // 1.1 antesala: cada cuanto se anuncia el proximo partido
  ventana_anuncio_seg: 24,  // cuanto permanece visible el anuncio cada vez
  refresco_cada_min: 3,     // 1.2 en vivo: cada cuanto aparece el bloque de slides
  slides_visibles: 3,       // cuantos slides se muestran por bloque
  segundos_por_slide: 8,    // duracion de cada slide
  gol_segundos: 10,         // 1.3 emergencia: duracion del gol
  demo_speed: 1             // 1 = tiempo real; >1 acelera (pruebas)
};
async function loadConfig() {
  try {
    const r = await fetch('config.json?t=' + Date.now());
    if (r.ok) Object.assign(CONFIG, await r.json());
  } catch (e) { console.warn('config.json no encontrado, usando valores por defecto'); }
}
// En modo demo/mock acelera solo para poder ver el flujo; en real respeta los minutos
function effSpeed() { return (apiMode === 'mock' && CONFIG.demo_speed === 1) ? 12 : (CONFIG.demo_speed || 1); }
function minMs(m) { return Math.max(400, m * 60000 / effSpeed()); }
function secMs(s) { return Math.max(250, s * 1000 / effSpeed()); }

// Colores de bandera por seleccion para el TITILEO del gol (codigo FIFA o nombre en mayusculas)
const TEAM_FLASH_COLORS = {
  VEN:['#ffcc00','#cf142b'], ARG:['#74acdf','#ffffff'], BRA:['#009b3a','#ffdf00'],
  GER:['#dd0000','#000000'], ESP:['#aa151b','#f1bf00'], FRA:['#0055a4','#ef4135'],
  ENG:['#cf142b','#ffffff'], POR:['#006600','#cf142b'], NED:['#ff6a00','#21468b'],
  URU:['#0038a8','#ffd100'], MEX:['#006847','#ce1126'], USA:['#3c3b6e','#b22234'],
  COL:['#fcd116','#003893'], CRO:['#ff0000','#171796'], JOR:['#ce1126','#007a3d'],
  ALG:['#006633','#ffffff'], NOR:['#ba0c2f','#00205b'], SEN:['#00853f','#e8d600'],
  MAR:['#c1272d','#006233'], JPN:['#bc002d','#ffffff'], KOR:['#cd2e3a','#0047a0']
};
let standby = null;        // capa "espacio del anunciante" entre inserciones
let schedTimer = null;     // temporizador del orquestador
let lastCycleState = null; // para re-sincronizar el ciclo al cambiar de estado

// Check URL parameters for initial setup
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('mock') === 'true') {
  apiMode = 'mock';
  mockState = urlParams.get('state') || 'live';
}

// ---- Barra de control del operador: boton PUBLICAR EN PANTALLA (TB60) ----
// Visible solo con ?control=1, para no mostrarla nunca en la pantalla en vivo.
async function publishToScreen() {
  const btn = document.getElementById('btn-publish');
  const out = document.getElementById('publish-status');
  if (!btn || !out) return;
  btn.disabled = true;
  out.className = 'ctrl-status';
  out.textContent = 'Publicando…';
  try {
    const r = await fetch('/api/publish', { method: 'POST' });
    const d = await r.json();
    if (d.success) {
      out.textContent = '✓ Publicado en la pantalla';
      out.classList.add('ok');
    } else if (d.code === 'NOT_CONFIGURED') {
      out.textContent = 'Falta configurar VNNOX (vnnox.config.json)';
      out.classList.add('err');
    } else {
      out.textContent = 'Error: ' + (d.error || 'no se pudo publicar');
      out.classList.add('err');
    }
  } catch (e) {
    out.textContent = 'Error de red al publicar';
    out.classList.add('err');
  } finally {
    btn.disabled = false;
  }
}
if (urlParams.get('control') === '1') {
  const bar = document.getElementById('control-bar');
  const btn = document.getElementById('btn-publish');
  if (bar) bar.style.display = 'flex';
  if (btn) btn.addEventListener('click', publishToScreen);
}

// Function to fetch match data
async function fetchMatchData() {
  let url = '/api/matches';
  if (apiMode === 'mock') {
    url = `/api/mock?state=${mockState}`;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network error fetching match data');
    const result = await response.json();
    if (result.success && result.data && result.data.length > 0) {
      allMatches = result.data;
      
      // Determine if there is any live match in progress
      // Mantener el orden cronológico para que la rotación sea estable entre refrescos.
      liveMatches = allMatches.filter(m => m.is_live)
        .sort((a, b) => (a.starting_at_timestamp || 0) - (b.starting_at_timestamp || 0));
      let matchToShow;

      if (liveMatches.length > 0) {
        // Hay uno o varios partidos en vivo simultáneos: mostrar el del índice actual
        // (la rotación entre ellos la hace liveBlock al terminar cada bloque de slides).
        if (currentLiveIndex >= liveMatches.length) currentLiveIndex = 0;
        matchToShow = liveMatches[currentLiveIndex];
        currentMatchState = 'live';
        activeMatchId = matchToShow.id;
      } else {
        // If no match is live, check for scheduled matches
        // 1.1: solo anunciar partidos que AUN no han comenzado (no anunciar los que ya coinciden con la hora; 60s de gracia)
        const nowTs = Date.now();
        scheduledMatches = allMatches.filter(m => !m.is_finished && m.state_id === 1 &&
          ((m.starting_at_timestamp || 0) * 1000) > (nowTs - 60000));
        // Sort scheduled matches chronologically (closest to furthest)
        scheduledMatches.sort((a, b) => (a.starting_at_timestamp || 0) - (b.starting_at_timestamp || 0));
        
        if (scheduledMatches.length > 0) {
          currentMatchState = 'scheduled';
          // Bound index
          if (currentScheduledIndex >= scheduledMatches.length) {
            currentScheduledIndex = 0;
          }
          matchToShow = scheduledMatches[currentScheduledIndex];
        } else {
          // If all matches finished
          matchToShow = allMatches[0];
          currentMatchState = 'finished';
          activeMatchId = matchToShow.id;
        }
      }

      if (matchToShow) {
        updateUI(matchToShow);
      }
    } else {
      showErrorState('NO HAY PARTIDOS HOY');
    }
  } catch (error) {
    console.error('Error fetching match data:', error);
    if (!initialized) {
      showErrorState('ERROR DE CONEXIÓN');
    }
  }
}

// Update the UI elements with match data
function updateUI(match) {
  // Update status badges on all slides
  [statusBadgeS1, statusBadgeS2, statusBadgeS3].forEach(badge => {
    if (badge) {
      badge.className = 'status-badge'; // Reset classes
      const textNode = badge.querySelector('.status-text');
      
      if (match.is_live) {
        badge.classList.add('live');
        if (textNode) textNode.innerText = 'EN VIVO';
      } else if (match.is_finished) {
        badge.classList.add('finished');
        if (textNode) textNode.innerText = 'FINALIZADO';
      } else {
        badge.classList.add('upcoming');
        if (textNode) textNode.innerText = 'PROGRAMADO';
      }
    }
  });

  // Update container overall state class
  widget.className = `widget-container ${currentMatchState}`;

  // Update Teams S1
  homeName.innerText = match.teams.home.name;
  awayName.innerText = match.teams.away.name;
  homeFlag.src = getProxyUrl(match.teams.home.flag || 'https://cdn.sportmonks.com/images/countries/png/short/jo.png');
  awayFlag.src = getProxyUrl(match.teams.away.flag || 'https://cdn.sportmonks.com/images/countries/png/short/dz.png');

  // Update Star Players on the back of the flip card (con fallback de marca)
  const homeStar = match.teams.home.star || {};
  setStarImg(homeStarImg, homeStar.image);
  homeStarName.innerText = homeStar.name || 'Estrella';

  const awayStar = match.teams.away.star || {};
  setStarImg(awayStarImg, awayStar.image);
  awayStarName.innerText = awayStar.name || 'Estrella';

  // Reset flippers to front when new match loads
  if (homeFlipper) homeFlipper.classList.remove('flipped');
  if (awayFlipper) awayFlipper.classList.remove('flipped');
  flagsFlipped = false;

  // Update Mini Scoreboards S2 & S3
  [
    { home: miniHome, away: miniAway, score: miniScoreVal, clock: miniClockVal },
    { home: miniHomeS3, away: miniAwayS3, score: miniScoreValS3, clock: miniClockValS3 }
  ].forEach(mini => {
    if (mini.home) mini.home.innerText = match.teams.home.short_code;
    if (mini.away) mini.away.innerText = match.teams.away.short_code;
    if (mini.score) mini.score.innerText = `${match.score.home} - ${match.score.away}`;
    if (mini.clock) mini.clock.innerText = match.clock.label;
  });

  // Layout toggles based on status (Scheduled vs Live/Finished)
  if (currentMatchState === 'scheduled') {
    // Scheduled Mode (Anuncio / Flyers playlist)
    matchClock.style.display = 'none';
    scoreDisplay.style.display = 'none';
    upcomingInfo.style.display = 'flex';
    
    kickoffGroup.innerText = match.group || 'Fase de Grupos';
    if (sidebarRight) {
      sidebarRight.innerText = match.kickoff_vet.time;
    }
    kickoffStadium.innerText = match.venue.name;
    kickoffCity.innerText = match.venue.city;

    // Force Slide 1 active and hide slide indicator dots
    slide1.classList.add('active');
    slide2.classList.remove('active');
    slideCta.classList.remove('active');
    slideIndicators.style.display = 'none';
    activeSlideNum = 1;
  } else {
    // Live or Finished Mode
    matchClock.style.display = 'block';
    scoreDisplay.style.display = 'flex';
    upcomingInfo.style.display = 'none';
    slideIndicators.style.display = 'flex'; // Show dots

    matchClock.innerText = match.clock.label;
    homeScore.innerText = match.score.home;
    awayScore.innerText = match.score.away;

    // Detect Goal Event
    if (initialized && !isGoalOverlayActive && activeMatchId === match.id) {
      const homeGoalScored = match.score.home > lastScore.home;
      const awayGoalScored = match.score.away > lastScore.away;
      
      if (homeGoalScored || awayGoalScored) {
        const goalEvents = match.events.filter(e => ['GOAL', 'OWN_GOAL', 'PENALTY_GOAL'].includes(e.type));
        const latestGoal = goalEvents[goalEvents.length - 1];
        triggerGoalOverlay(latestGoal, match.score, homeGoalScored ? match.teams.home : match.teams.away);
      }
    }

    lastScore = { home: match.score.home, away: match.score.away };

    // Render Events in Slide 2
    processAndRenderCategorizedEvents(match.events, match.teams);

    // Update Interactive CTA Slide 3 Poll
    updateCTAPoll(match);
  }

  // Re-sincronizar el orquestador cuando cambia el estado (programado <-> en vivo <-> final)
  if (lastCycleState !== currentMatchState) {
    lastCycleState = currentMatchState;
    if (initialized && typeof cycle === 'function') {
      clearTimeout(schedTimer);
      cycle();
    }
  }

  initialized = true;
}

// Update the simulated live poll on Slide 3 based on match score
function updateCTAPoll(match) {
  pollNameHome.innerText = match.teams.home.name;
  pollNameAway.innerText = match.teams.away.name;

  let homePct = 50;
  let awayPct = 50;

  // Dynamic calculation based on score + random minor drift
  if (match.score.home > match.score.away) {
    homePct = 62 + Math.floor(Math.random() * 6); // 62% - 67%
    awayPct = 100 - homePct;
  } else if (match.score.away > match.score.home) {
    awayPct = 62 + Math.floor(Math.random() * 6);
    homePct = 100 - awayPct;
  } else {
    // Draw: very close
    homePct = 48 + Math.floor(Math.random() * 5); // 48% - 52%
    awayPct = 100 - homePct;
  }

  pollPctHome.innerText = `${homePct}%`;
  pollPctAway.innerText = `${awayPct}%`;
  pollBarHomeVal.style.width = `${homePct}%`;
  pollBarAwayVal.style.width = `${awayPct}%`;
}

// Process events and split into: Goals, Cards, Subs. Sort chronologically inside each.
function processAndRenderCategorizedEvents(events, teams) {
  listGoles.innerHTML = '';
  listTarjetas.innerHTML = '';
  listCambios.innerHTML = '';

  if (!events || events.length === 0) {
    listGoles.innerHTML = '<div class="no-section-events">Sin goles registrados</div>';
    listTarjetas.innerHTML = '<div class="no-section-events">Sin tarjetas registradas</div>';
    listCambios.innerHTML = '<div class="no-section-events">Sin cambios registrados</div>';
    return;
  }

  const goals = events.filter(e => ['GOAL', 'OWN_GOAL', 'PENALTY_GOAL'].includes(e.type));
  const cards = events.filter(e => ['YELLOW_CARD', 'RED_CARD', 'YELLOW_RED_CARD'].includes(e.type));
  const subs = events.filter(e => ['SUBSTITUTION'].includes(e.type));

  const sortChronologically = (a, b) => {
    if (a.minute !== b.minute) {
      return a.minute - b.minute;
    }
    return (a.extra_minute || 0) - (b.extra_minute || 0);
  };

  goals.sort(sortChronologically);
  cards.sort(sortChronologically);
  subs.sort(sortChronologically);

  const renderList = (listArray, container, emptyMsg) => {
    if (listArray.length === 0) {
      container.innerHTML = `<div class="no-section-events">${emptyMsg}</div>`;
      return;
    }

    listArray.forEach(e => {
      const card = document.createElement('div');
      card.className = `event-card ${e.type.toLowerCase()}`;

      let icon = '⚽';
      let mainText = e.player;
      let subText = '';

      if (e.type === 'GOAL') {
        icon = '⚽';
        if (e.related_player) subText = `Asist: ${e.related_player}`;
      } else if (e.type === 'OWN_GOAL') {
        icon = '⚽';
        subText = `En contra`;
      } else if (e.type === 'PENALTY_GOAL') {
        icon = '⚽';
        subText = `Gol de penal`;
      } else if (e.type === 'YELLOW_CARD') {
        icon = '🟨';
        subText = 'Tarjeta Amarilla';
      } else if (e.type === 'RED_CARD') {
        icon = '🟥';
        subText = 'Tarjeta Roja Directa';
      } else if (e.type === 'YELLOW_RED_CARD') {
        icon = '🟨🟥';
        subText = 'Doble Amarilla';
      } else if (e.type === 'SUBSTITUTION') {
        icon = '🔄';
        mainText = e.player; // Entering
        subText = `Sale: ${e.related_player}`; // Exiting
      }

      const isHomeTeam = e.team_id === teams.home.id;
      const teamFlag = isHomeTeam ? (teams.home.flag || 'https://cdn.sportmonks.com/images/countries/png/short/jo.png') : (teams.away.flag || 'https://cdn.sportmonks.com/images/countries/png/short/dz.png');
      const teamName = isHomeTeam ? teams.home.name : teams.away.name;
      const timeLabel = e.extra_minute ? `${e.minute}+${e.extra_minute}'` : `${e.minute}'`;

      card.innerHTML = `
        <div class="event-left-column">
          <img src="${teamFlag}" class="event-team-flag" alt="${teamName}">
          <div class="event-meta">
            <span class="event-minute">${timeLabel}</span>
            <span class="event-icon">${icon}</span>
          </div>
        </div>
        <div class="event-right-column">
          <span class="event-player-name">${mainText}</span>
          ${subText ? `<span class="event-sub-details">${subText}</span>` : ''}
        </div>
      `;

      container.appendChild(card);
    });
  };

  renderList(goals, listGoles, 'Sin goles registrados');
  renderList(cards, listTarjetas, 'Sin tarjetas registradas');
  renderList(subs, listCambios, 'Sin cambios registrados');
}

// Alternating carousel logic for DOOH playlists
function rotateSlides() {
  if (currentMatchState === 'scheduled') {
    // Upcoming Mode: Rota el carrusel de flyers si hay múltiples partidos hoy
    if (scheduledMatches.length > 1) {
      currentScheduledIndex = (currentScheduledIndex + 1) % scheduledMatches.length;
      console.log(`[Carousel] Rotating to scheduled match index: ${currentScheduledIndex}`);
      updateUI(scheduledMatches[currentScheduledIndex]);
    }
    return;
  }

  // Live / Finished Mode: Rota en un bucle continuo de 3 Slides
  slide1.classList.remove('active');
  slide2.classList.remove('active');
  slideCta.classList.remove('active');
  
  dotS1.classList.remove('active');
  dotS2.classList.remove('active');
  dotS3.classList.remove('active');

  if (activeSlideNum === 1) {
    slide2.classList.add('active');
    dotS2.classList.add('active');
    activeSlideNum = 2;
  } else if (activeSlideNum === 2) {
    slideCta.classList.add('active');
    dotS3.classList.add('active');
    activeSlideNum = 3;
  } else {
    slide1.classList.add('active');
    dotS1.classList.add('active');
    activeSlideNum = 1;
  }
}

// Trigger high-impact fullscreen goal announcement (optmized for 5000 nits)
function triggerGoalOverlay(goalEvent, score, scoringTeam) {
  isGoalOverlayActive = true;

  const scorer = goalEvent ? goalEvent.player : '¡GOL!';
  const minute = goalEvent ? (goalEvent.extra_minute ? `${goalEvent.minute}+${goalEvent.extra_minute}'` : `${goalEvent.minute}'`) : '';
  const goalType = goalEvent && goalEvent.type === 'OWN_GOAL' ? 'Gol en contra' : '';
  const playerImgUrl = goalEvent && goalEvent.player_image ? goalEvent.player_image : null;

  goalPlayerName.innerText = scorer;
  goalPlayerTeam.innerText = `${scoringTeam.name} ${goalType}`;
  goalMinuteVal.innerText = minute;
  goalScoreNew.innerText = `${score.home} - ${score.away}`;

  if (playerImgUrl) {
    goalPlayerImg.src = getProxyUrl(playerImgUrl);
    goalPlayerImgWrapper.style.display = 'flex';
  } else {
    goalPlayerImgWrapper.style.display = 'none';
  }

  // Titileo con los colores de la BANDERA del equipo que anota (codigo FIFA o nombre)
  goalOverlay.className = 'goal-overlay';
  const cols = TEAM_FLASH_COLORS[scoringTeam.short_code] ||
               TEAM_FLASH_COLORS[(scoringTeam.name || '').toUpperCase()] ||
               ['#85439a', '#f79131']; // fallback: colores Centauro
  goalOverlay.style.setProperty('--fc1', cols[0]);
  goalOverlay.style.setProperty('--fc2', cols[1]);
  goalOverlay.classList.add('dynamic-flash');

  // Inserción de EMERGENCIA en VNNOX: garantiza que el gol se vea aunque la pantalla
  // este reproduciendo pauta comercial (fuera de este widget). Fire-and-forget.
  if (apiMode === 'real') {
    fetch('/api/emergency/goal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: scoringTeam.name || '',
        player: scorer,
        assist: (goalEvent && goalEvent.related_player) || '',
        score: `${score.home} - ${score.away}`,
        minute: minute,
        c1: cols[0],
        c2: cols[1]
      })
    }).catch(() => {});
  }

  // 1.3: desaparece tras 'gol_segundos' y reanuda el ciclo de slides
  setTimeout(() => {
    goalOverlay.className = 'goal-overlay';
    isGoalOverlayActive = false;
    clearTimeout(schedTimer);
    cycle();
  }, secMs(CONFIG.gol_segundos));
}

// Show error messages on the DOOH screen if backend/API fails
function showErrorState(message) {
  [statusBadgeS1, statusBadgeS2, statusBadgeS3].forEach(b => {
    if (b) {
      b.className = 'status-badge finished';
      const textNode = b.querySelector('.status-text');
      if (textNode) textNode.innerText = 'ERROR';
    }
  });

  matchClock.style.display = 'block';
  matchClock.innerText = '---';
  upcomingInfo.style.display = 'none';
  scoreDisplay.style.display = 'flex';
  homeScore.innerText = '-';
  awayScore.innerText = '-';
  
  listGoles.innerHTML = `<div class="no-section-events">${message}</div>`;
  listTarjetas.innerHTML = `<div class="no-section-events">${message}</div>`;
  listCambios.innerHTML = `<div class="no-section-events">${message}</div>`;
}

// Key controls to simulate different states (for Centauro ADS presentations/demos)
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  
  if (key === 'u') {
    apiMode = 'mock';
    mockState = 'upcoming';
    initialized = false;
    currentScheduledIndex = 0;
    console.log('[Demo Mode] Simulating UPCOMING match flyer carousel.');
    fetchMatchData();
  } else if (key === 'l') {
    apiMode = 'mock';
    mockState = 'live';
    console.log('[Demo Mode] Simulating LIVE match 3-slide carousel.');
    fetchMatchData();
  } else if (key === 'g') {
    apiMode = 'mock';
    mockState = 'goal';
    console.log('[Demo Mode] Simulating GOAL scored and flash.');
    fetchMatchData();
  } else if (key === 'f') {
    apiMode = 'mock';
    mockState = 'finished';
    console.log('[Demo Mode] Simulating FINISHED match.');
    fetchMatchData();
  } else if (key === 'r') {
    apiMode = 'real';
    initialized = false;
    console.log('[Demo Mode] Connecting to REAL Sportmonks API.');
    fetchMatchData();
  }
});

// ============================================================
//  ORQUESTADOR DE CADENCIAS (programable)
//  - Antesala: aparece cada 'anuncio_cada_min', dura 'ventana_anuncio_seg'
//  - En vivo: bloque de 'slides_visibles' slides (cada 'segundos_por_slide'),
//    que reaparece cada 'refresco_cada_min'
//  - Gol: emergencia, dura 'gol_segundos' (manejado en triggerGoalOverlay)
//  Entre inserciones: STANDBY (corre el espacio del anunciante en VNNOX)
// ============================================================
function getActiveSlidesList() {
  const activeList = [];
  if (CONFIG.slide_1_enabled !== false) activeList.push(1);
  if (CONFIG.slide_2_enabled !== false) activeList.push(2);
  if (CONFIG.slide_3_enabled !== false) activeList.push(3);
  if (activeList.length === 0) activeList.push(1, 2, 3);
  return activeList;
}

function goToSlide(n) {
  [slide1, slide2, slideCta].forEach(s => s && s.classList.remove('active'));
  [dotS1, dotS2, dotS3].forEach(d => d && d.classList.remove('active'));
  
  // Ocultar/mostrar indicadores de slide según configuración
  if (CONFIG.slide_1_enabled === false) { if (dotS1) dotS1.style.display = 'none'; } else { if (dotS1) dotS1.style.display = 'block'; }
  if (CONFIG.slide_2_enabled === false) { if (dotS2) dotS2.style.display = 'none'; } else { if (dotS2) dotS2.style.display = 'block'; }
  if (CONFIG.slide_3_enabled === false) { if (dotS3) dotS3.style.display = 'none'; } else { if (dotS3) dotS3.style.display = 'block'; }

  if (n === 1) { slide1.classList.add('active'); if (dotS1) dotS1.classList.add('active'); }
  else if (n === 2) { slide2.classList.add('active'); if (dotS2) dotS2.classList.add('active'); }
  else { slideCta.classList.add('active'); if (dotS3) dotS3.classList.add('active'); }
  activeSlideNum = n;
}
// Standby "ESPACIO DEL ANUNCIANTE" DESACTIVADO a pedido del usuario: no aporta valor
// y deja la pantalla con un placeholder vacío. enterStandby ya no muestra nada;
// la pantalla mantiene el último contenido del partido hasta el siguiente bloque.
function enterStandby() { if (standby) standby.classList.remove('show'); }
function exitStandby() { if (standby) standby.classList.remove('show'); }

// Lightbox: ver un mockup en grande (solo en el panel de operador).
function openMockupLightbox(url, name) {
  const prev = document.getElementById('mockup-lightbox');
  if (prev) prev.remove();
  const ov = document.createElement('div');
  ov.id = 'mockup-lightbox';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:zoom-out;padding:24px;box-sizing:border-box;';
  ov.innerHTML =
    '<img src="' + url + '" alt="' + (name || '') + '" style="max-width:95%;max-height:88%;object-fit:contain;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.6);">' +
    '<div style="color:#fff;margin-top:14px;font-size:14px;opacity:.85;">' + (name || '') + ' — clic para cerrar</div>';
  ov.addEventListener('click', () => ov.remove());
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ ov.remove(); document.removeEventListener('keydown', esc); } });
  document.body.appendChild(ov);
}

function cycle() {
  clearTimeout(schedTimer);
  if (isGoalOverlayActive) { schedTimer = setTimeout(cycle, 600); return; }
  if (currentMatchState === 'live' || currentMatchState === 'finished') {
    liveBlock(0);
  } else if (currentMatchState === 'scheduled') {
    announceBlock();
  } else {
    enterStandby();
    schedTimer = setTimeout(cycle, secMs(15));
  }
}
function liveBlock(i) {
  if (isGoalOverlayActive) { schedTimer = setTimeout(() => liveBlock(i), 600); return; }
  const activeList = getActiveSlidesList();
  if (i < CONFIG.slides_visibles) {
    exitStandby();
    const slideToShow = activeList[i % activeList.length];
    goToSlide(slideToShow);
    schedTimer = setTimeout(() => liveBlock(i + 1), secMs(CONFIG.segundos_por_slide));
  } else {
    enterStandby(); // termina el bloque -> espacio del anunciante hasta el proximo refresco
    // Si hay varios partidos EN VIVO simultáneos, rotar al siguiente para el próximo bloque,
    // de modo que TODOS los juegos en curso se muestren por turnos (no solo el primero).
    if (liveMatches.length > 1) {
      currentLiveIndex = (currentLiveIndex + 1) % liveMatches.length;
      console.log(`[Carousel] Rotando a partido EN VIVO índice: ${currentLiveIndex} (${liveMatches.length} en vivo)`);
      updateUI(liveMatches[currentLiveIndex]);
    }
    schedTimer = setTimeout(cycle, minMs(CONFIG.refresco_cada_min));
  }
}
function announceBlock() {
  if (isGoalOverlayActive) { schedTimer = setTimeout(announceBlock, 600); return; }
  exitStandby();
  goToSlide(1); // flyer de antesala
  schedTimer = setTimeout(() => {
    currentScheduledIndex++; // en la proxima aparicion rota al siguiente partido (si hay varios)
    enterStandby();
    schedTimer = setTimeout(cycle, minMs(CONFIG.anuncio_cada_min));
  }, secMs(CONFIG.ventana_anuncio_seg));
}

// Flip de bandera/estrella mientras se ve el slide 1 (pausado en standby)
setInterval(() => {
  if (standby && standby.classList.contains('show')) return;
  if (currentMatchState === 'scheduled' || activeSlideNum === 1) {
    if (homeFlipper && awayFlipper) {
      if (flagsFlipped) {
        homeFlipper.classList.remove('flipped');
        awayFlipper.classList.remove('flipped');
        flagsFlipped = false;
      } else {
        homeFlipper.classList.add('flipped');
        awayFlipper.classList.add('flipped');
        flagsFlipped = true;
      }
    }
  }
}, 4000);

// Arranque
(async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  
  function adjustWidgetScale() {
    const widget = document.getElementById('widget');
    if (!widget) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scaleX = w / 360;
    const scaleY = h / 720;
    widget.style.transform = `scale(${scaleX}, ${scaleY})`;
    widget.style.width = '360px';
    widget.style.height = '720px';
    widget.style.position = 'absolute';
    widget.style.top = '0';
    widget.style.left = '0';
    widget.style.transformOrigin = 'top left';
  }
  
  if (urlParams.get('control') !== '1' && urlParams.get('control') !== 'true') {
    // === MODO PANTALLA PURA (DOOH) ===
    document.body.classList.add('screen-mode');
    document.body.classList.remove('dashboard-mode');
    document.documentElement.classList.add('screen-mode');
    document.documentElement.classList.remove('dashboard-mode');
    standby = document.getElementById('standby');
    await loadConfig();
    fetchMatchData();
    setInterval(fetchMatchData, pollInterval);
    cycle();
    
    // Auto-escalado GPU por hardware
    adjustWidgetScale();
    window.addEventListener('resize', adjustWidgetScale);
    
    console.log('Centauro DOOH Screen cargado. Cadencias:', CONFIG);
  } else {
    // === MODO DASHBOARD (OPERADOR) ===
    document.body.classList.add('dashboard-mode');
    document.body.classList.remove('screen-mode');
    document.documentElement.classList.add('dashboard-mode');
    document.documentElement.classList.remove('screen-mode');
    
    // Cargar config y rellenar formulario
    await loadConfig();
    document.getElementById('segundos_por_slide').value = CONFIG.segundos_por_slide || 8;
    document.getElementById('refresco_cada_min').value = CONFIG.refresco_cada_min || 3;
    document.getElementById('anuncio_cada_min').value = CONFIG.anuncio_cada_min || 5;
    document.getElementById('ventana_anuncio_seg').value = CONFIG.ventana_anuncio_seg || 24;
    document.getElementById('gol_segundos').value = CONFIG.gol_segundos || 10;
    document.getElementById('demo_speed').value = CONFIG.demo_speed || 1;
    
    document.getElementById('slide_1_enabled').checked = CONFIG.slide_1_enabled !== false;
    document.getElementById('slide_2_enabled').checked = CONFIG.slide_2_enabled !== false;
    document.getElementById('slide_3_enabled').checked = CONFIG.slide_3_enabled !== false;
    
    // Configurar iframe de vista previa
    const previewIframe = document.getElementById('preview-iframe');
    const simStateSelect = document.getElementById('sim-state-select');
    
    function updatePreviewUrl() {
      const state = simStateSelect.value;
      let url = '/?screen=true';
      if (state !== 'real') {
        url += `&mock=true&state=${state}`;
      }
      previewIframe.src = url;
    }
    
    simStateSelect.addEventListener('change', updatePreviewUrl);
    updatePreviewUrl();
    
    // Manejar formulario de configuracion
    const form = document.getElementById('config-form');
    const saveStatus = document.getElementById('save-status');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveStatus.textContent = 'Guardando...';
      saveStatus.className = 'status-msg';
      
      const updatedConfig = {
        segundos_por_slide: Number(document.getElementById('segundos_por_slide').value),
        refresco_cada_min: Number(document.getElementById('refresco_cada_min').value),
        anuncio_cada_min: Number(document.getElementById('anuncio_cada_min').value),
        ventana_anuncio_seg: Number(document.getElementById('ventana_anuncio_seg').value),
        gol_segundos: Number(document.getElementById('gol_segundos').value),
        demo_speed: Number(document.getElementById('demo_speed').value),
        slide_1_enabled: document.getElementById('slide_1_enabled').checked,
        slide_2_enabled: document.getElementById('slide_2_enabled').checked,
        slide_3_enabled: document.getElementById('slide_3_enabled').checked
      };
      
      try {
        const response = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedConfig)
        });
        const data = await response.json();
        if (data.success) {
          saveStatus.textContent = '✓ Configuración guardada con éxito';
          saveStatus.className = 'status-msg ok';
          Object.assign(CONFIG, data.config);
          // Recargar la vista previa para aplicar los nuevos tiempos
          updatePreviewUrl();
        } else {
          saveStatus.textContent = 'Error al guardar la configuración';
          saveStatus.className = 'status-msg err';
        }
      } catch (err) {
        saveStatus.textContent = 'Error de red al guardar';
        saveStatus.className = 'status-msg err';
      }
    });

    // Guardar switches al cambiar
    ['slide_1_enabled', 'slide_2_enabled', 'slide_3_enabled'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        document.getElementById('btn-save-config').click();
      });
    });
    
    // Boton Simular Gol de Emergencia
    const btnSimGoal = document.getElementById('btn-sim-goal-alert');
    btnSimGoal.addEventListener('click', async () => {
      const state = simStateSelect.value;
      if (state === 'real') {
        btnSimGoal.disabled = true;
        try {
          const res = await fetch('/api/emergency/goal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              team: 'Jordania',
              player: 'Musa Al-Taamari',
              assist: 'Yazan Al-Naimat',
              score: '1 - 0',
              minute: '58\'',
              c1: '#ce1126',
              c2: '#007a3d'
            })
          });
          const d = await res.json();
          if (d.success) {
            alert('Inserción de Gol enviada a VNNOX (TB60) con éxito.');
          } else {
            alert('Error en inserción: ' + (d.error || 'desconocido'));
          }
        } catch (e) {
          alert('Error de red al insertar gol');
        } finally {
          btnSimGoal.disabled = false;
        }
      } else {
        // En modo simulación local, cargamos el estado 'goal' en el preview
        simStateSelect.value = 'goal';
        updatePreviewUrl();
        // Después de gol_segundos, devolvemos a 'live'
        setTimeout(() => {
          if (simStateSelect.value === 'goal') {
            simStateSelect.value = 'live';
            updatePreviewUrl();
          }
        }, (CONFIG.gol_segundos || 10) * 1000);
      }
    });
    
    // Estatus de VNNOX e Insercion
    const vnnoxMeta = document.getElementById('vnnox-meta-info');
    const btnPublishVnnox = document.getElementById('btn-publish-vnnox');
    const publishStatusDb = document.getElementById('publish-status-db');
    
    async function loadVnnoxStatus() {
      try {
        const res = await fetch('/api/publish/status');
        const data = await res.json();
        if (data.success) {
          vnnoxMeta.innerHTML = `
            <div class="vnnox-meta-row">
              <span class="vnnox-label">Estatus Abierto:</span>
              <span class="vnnox-val" style="color: ${data.configured ? '#00ff87' : '#f79131'}">${data.configured ? 'Listo' : 'Falta Configuración'}</span>
            </div>
            <div class="vnnox-meta-row">
              <span class="vnnox-label">NovaCloud:</span>
              <span class="vnnox-val">${data.configured ? '✓ Configurado' : '⚠️ Sin configurar'}</span>
            </div>
            <div class="vnnox-meta-row">
              <span class="vnnox-label">Base URL:</span>
              <span class="vnnox-val">${data.base || 'No definida'}</span>
            </div>
            <div class="vnnox-meta-row">
              <span class="vnnox-label">App URL:</span>
              <span class="vnnox-val">${data.appUrl || 'No definida'}</span>
            </div>
            <div class="vnnox-meta-row">
              <span class="vnnox-label">Pantallas (TB60):</span>
              <span class="vnnox-val">${data.players || 0} vinculadas</span>
            </div>
          `;
        }
      } catch (err) {
        vnnoxMeta.innerHTML = `<span>Error al obtener estatus de VNNOX</span>`;
      }
    }
    
    loadVnnoxStatus();
    
    btnPublishVnnox.addEventListener('click', async () => {
      btnPublishVnnox.disabled = true;
      publishStatusDb.className = 'publish-status-db';
      publishStatusDb.textContent = 'Publicando programa...';
      
      try {
        const res = await fetch('/api/publish', { method: 'POST' });
        const d = await res.json();
        if (d.success) {
          publishStatusDb.textContent = '✓ ¡Publicado con éxito!';
          publishStatusDb.classList.add('ok');
        } else {
          publishStatusDb.textContent = 'Error: ' + (d.error || 'no se pudo publicar');
          publishStatusDb.classList.add('err');
        }
      } catch (err) {
        publishStatusDb.textContent = 'Error de red al publicar';
        publishStatusDb.classList.add('err');
      } finally {
        btnPublishVnnox.disabled = false;
      }
    });

    // ============================================================
    //  GESTION DE MOCKUPS Y SIMULADOR POR RESOLUCION (VNNOX)
    // ============================================================

    // 1. TABS DE VISTA PREVIA
    const tabTotemApp = document.getElementById('tab-totem-app');
    const tabTotemSim = document.getElementById('tab-totem-sim');
    const tabTotemCal = document.getElementById('tab-totem-cal');
    const bezelAppView = document.getElementById('bezel-app-view');
    const bezelSimView = document.getElementById('bezel-sim-view');
    const bezelCalView = document.getElementById('bezel-cal-view');
    const btnOpenExternalCal = document.getElementById('btn-open-external-cal');

    tabTotemApp.addEventListener('click', () => {
      tabTotemApp.classList.add('active');
      tabTotemSim.classList.remove('active');
      tabTotemCal.classList.remove('active');
      bezelAppView.style.display = 'block';
      bezelSimView.style.display = 'none';
      bezelCalView.style.display = 'none';
    });

    tabTotemSim.addEventListener('click', () => {
      tabTotemSim.classList.add('active');
      tabTotemApp.classList.remove('active');
      tabTotemCal.classList.remove('active');
      bezelSimView.style.display = 'flex';
      bezelAppView.style.display = 'none';
      bezelCalView.style.display = 'none';
      updateSimPreview();
    });

    if (tabTotemCal) {
      tabTotemCal.addEventListener('click', () => {
        tabTotemCal.classList.add('active');
        tabTotemApp.classList.remove('active');
        tabTotemSim.classList.remove('active');
        bezelCalView.style.display = 'flex';
        bezelAppView.style.display = 'none';
        bezelSimView.style.display = 'none';
        
        // Force refresh iframe to update standings / matches
        const calIframe = document.getElementById('calendar-iframe');
        if (calIframe) {
          calIframe.src = calIframe.src;
        }
      });
    }

    if (btnOpenExternalCal) {
      btnOpenExternalCal.addEventListener('click', () => {
        window.open('/calendar.html', '_blank');
      });
    }

    // 2. SUBIDA DE MOCKUPS
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('mockup-file-input');
    const uploadTrigger = document.getElementById('btn-upload-trigger');
    const uploadStatus = document.getElementById('upload-status');

    if (uploadTrigger) uploadTrigger.addEventListener('click', () => fileInput.click());

    if (fileInput) fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleUploadFile(e.target.files[0]);
      }
    });

    if (uploadZone) {
      uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
      });

      uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
      });

      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          handleUploadFile(e.dataTransfer.files[0]);
        }
      });
    }

    async function handleUploadFile(file) {
      if (!file.type.match('image.*')) {
        uploadStatus.textContent = 'Error: Solo se permiten imágenes (PNG/JPG).';
        uploadStatus.className = 'status-msg err';
        return;
      }
      uploadStatus.textContent = 'Leyendo archivo...';
      uploadStatus.className = 'status-msg';

      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target.result;
        uploadStatus.textContent = 'Subiendo...';
        try {
          const res = await fetch('/api/mockups/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, data: base64Data })
          });
          const d = await res.json();
          if (d.success) {
            uploadStatus.textContent = '✓ Subido con éxito';
            uploadStatus.className = 'status-msg ok';
            loadMockups(); // Recargar grilla
          } else {
            uploadStatus.textContent = 'Error: ' + d.error;
            uploadStatus.className = 'status-msg err';
          }
        } catch (err) {
          uploadStatus.textContent = 'Error de red al subir imagen.';
          uploadStatus.className = 'status-msg err';
        }
      };
      reader.readAsDataURL(file);
    }

    // 3. GRILLA Y ELIMINACIÓN DE MOCKUPS
    const mockupsGrid = document.getElementById('mockups-grid');
    const selectMockupBg = document.getElementById('select-mockup-bg');
    let allMockups = [];
    let selectedMockup = null;

    async function loadMockups() {
      try {
        const res = await fetch('/api/mockups');
        const data = await res.json();
        if (data.success) {
          allMockups = data.mockups;
          renderMockupsGrid();
          populateMockupsDropdown();
        }
      } catch (err) {
        if (mockupsGrid) mockupsGrid.innerHTML = '<div class="loading-mockups err">Error al cargar plantillas</div>';
      }
    }

    function renderMockupsGrid() {
      if (!mockupsGrid) return;
      if (allMockups.length === 0) {
        mockupsGrid.innerHTML = '<div class="loading-mockups">No hay plantillas subidas</div>';
        return;
      }
      mockupsGrid.innerHTML = '';
      allMockups.forEach(m => {
        const item = document.createElement('div');
        item.className = 'mockup-item';
        if (selectedMockup && selectedMockup.name === m.name) {
          item.classList.add('selected');
        }
        item.innerHTML = `
          <img src="${m.url}" class="mockup-img" alt="${m.name}">
          <div class="mockup-actions">
            <button class="btn-mockup-zoom" title="Ver en grande" data-filename="${m.name}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
            <button class="btn-mockup-delete" data-filename="${m.name}"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.closest('.btn-mockup-delete')) return;
          if (e.target.closest('.btn-mockup-zoom')) return;
          selectedMockup = m;
          document.querySelectorAll('.mockup-item').forEach(x => x.classList.remove('selected'));
          item.classList.add('selected');
          if (selectMockupBg) selectMockupBg.value = m.name;
          loadCalibration();
          updateSimPreview();
        });

        // Ver el mockup en grande (lightbox) sin seleccionarlo como fondo.
        item.querySelector('.btn-mockup-zoom').addEventListener('click', (e) => {
          e.stopPropagation();
          openMockupLightbox(m.url, m.name);
        });

        item.querySelector('.btn-mockup-delete').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`¿Estás seguro de eliminar el mockup "${m.name}"?`)) return;
          try {
            const res = await fetch(`/api/mockups/${m.name}`, { method: 'DELETE' });
            const d = await res.json();
            if (d.success) {
              if (selectedMockup && selectedMockup.name === m.name) {
                selectedMockup = null;
                if (selectMockupBg) selectMockupBg.value = '';
              }
              loadMockups();
              updateSimPreview();
            } else {
              alert('Error: ' + d.error);
            }
          } catch (err) {
            alert('Error de red al borrar plantilla');
          }
        });

        mockupsGrid.appendChild(item);
      });
    }

    function populateMockupsDropdown() {
      if (!selectMockupBg) return;
      const currentVal = selectMockupBg.value;
      selectMockupBg.innerHTML = '<option value="">-- Sin fondo (Solo datos) --</option>';
      allMockups.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name;
        selectMockupBg.appendChild(opt);
      });
      selectMockupBg.value = currentVal;
    }

    if (selectMockupBg) {
      selectMockupBg.addEventListener('change', (e) => {
        const val = e.target.value;
        selectedMockup = allMockups.find(m => m.name === val) || null;
        renderMockupsGrid();
        loadCalibration();
        updateSimPreview();
      });
    }

    // 4. PANTALLAS VNNOX Y RESOLUCION
    const selectVnnoxPlayer = document.getElementById('select-vnnox-player');
    const simScreen = document.getElementById('sim-screen');
    const valResolutionIndicator = document.getElementById('val-resolution-indicator');
    const selectResPreset = document.getElementById('select-resolution-preset');
    const customResGrid = document.getElementById('custom-res-grid');
    const inputCustomW = document.getElementById('input-custom-w');
    const inputCustomH = document.getElementById('input-custom-h');
    let allPlayers = [];
    let activePlayerResolution = { width: 256, height: 512 };

    // Lógica y estado de Calibración de Mockup
    let calibration = {
      offsetX: 0,
      offsetY: 0,
      width: 100,
      height: 100,
      fit: 'cover'
    };

    function getCalibrationKey() {
      const name = selectedMockup ? selectedMockup.name : 'default';
      return `dooh_calibration_${name}`;
    }

    function resetCalibrationToDefault() {
      calibration = {
        offsetX: 0,
        offsetY: 0,
        width: 100,
        height: 100,
        fit: 'cover'
      };
    }

    function loadCalibration() {
      const key = getCalibrationKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          calibration = JSON.parse(saved);
        } catch (e) {
          console.error('Error al cargar calibración', e);
          resetCalibrationToDefault();
        }
      } else {
        resetCalibrationToDefault();
      }
      
      const sliderX = document.getElementById('slider-offset-x');
      const sliderY = document.getElementById('slider-offset-y');
      const sliderW = document.getElementById('slider-width');
      const sliderH = document.getElementById('slider-height');
      const selectFit = document.getElementById('select-mockup-fit');
      
      if (sliderX) sliderX.value = calibration.offsetX;
      if (sliderY) sliderY.value = calibration.offsetY;
      if (sliderW) sliderW.value = calibration.width;
      if (sliderH) sliderH.value = calibration.height;
      if (selectFit) selectFit.value = calibration.fit;
      
      updateCalibrationValuesUI();
      applyCalibration();
    }

    function updateCalibrationValuesUI() {
      const valX = document.getElementById('val-offset-x');
      const valY = document.getElementById('val-offset-y');
      const valW = document.getElementById('val-width');
      const valH = document.getElementById('val-height');
      
      if (valX) valX.textContent = calibration.offsetX;
      if (valY) valY.textContent = calibration.offsetY;
      if (valW) valW.textContent = calibration.width;
      if (valH) valH.textContent = calibration.height;
    }

    function applyCalibration() {
      const wrapper = document.getElementById('sim-overlay-wrapper');
      if (wrapper) {
        wrapper.style.left = `${calibration.offsetX}%`;
        wrapper.style.top = `${calibration.offsetY}%`;
        wrapper.style.width = `${calibration.width}%`;
        wrapper.style.height = `${calibration.height}%`;
      }
      
      if (simScreen) {
        simScreen.style.backgroundSize = calibration.fit;
      }
    }

    function saveCalibration() {
      const key = getCalibrationKey();
      localStorage.setItem(key, JSON.stringify(calibration));
    }

    async function loadVnnoxPlayers() {
      try {
        const res = await fetch('/api/vnnox/players');
        const data = await res.json();
        if (data.success && data.players && data.players.rows) {
          allPlayers = data.players.rows;
          populatePlayersDropdown();
        } else {
          if (selectVnnoxPlayer) selectVnnoxPlayer.innerHTML = '<option value="">Falta configurar VNNOX</option>';
        }
      } catch (err) {
        if (selectVnnoxPlayer) selectVnnoxPlayer.innerHTML = '<option value="">Error al cargar pantallas</option>';
      }
    }

    function populatePlayersDropdown() {
      if (!selectVnnoxPlayer) return;
      selectVnnoxPlayer.innerHTML = '';
      
      allPlayers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.playerId;
        opt.textContent = `${p.name || 'Pantalla'} (${p.width}x${p.height}) ${p.onlineStatus === 1 ? '· En línea' : '· Desconectado'}`;
        opt.dataset.width = p.width;
        opt.dataset.height = p.height;
        selectVnnoxPlayer.appendChild(opt);
      });
      
      // Intentar auto-seleccionar la configurada o la que esté en línea
      fetch('/api/publish/status')
        .then(r => r.json())
        .then(statusData => {
          const onlinePlayer = allPlayers.find(p => p.onlineStatus === 1);
          if (onlinePlayer) {
            selectVnnoxPlayer.value = onlinePlayer.playerId;
          } else if (allPlayers.length > 0) {
            selectVnnoxPlayer.value = allPlayers[0].playerId;
          }
          updateResolutionFromSelection();
        })
        .catch(() => {
          if (allPlayers.length > 0) selectVnnoxPlayer.value = allPlayers[0].playerId;
          updateResolutionFromSelection();
        });
    }

    function updateResolutionFromSelection() {
      if (!selectVnnoxPlayer) return;
      const selectedOpt = selectVnnoxPlayer.options[selectVnnoxPlayer.selectedIndex];
      if (selectedOpt && selectedOpt.dataset.width && selectedOpt.dataset.height) {
        const w = parseInt(selectedOpt.dataset.width);
        const h = parseInt(selectedOpt.dataset.height);
        
        // Sincronizar con el preset dropdown
        const presetVal = `${w}x${h}`;
        let matched = false;
        if (selectResPreset) {
          for (let i = 0; i < selectResPreset.options.length; i++) {
            if (selectResPreset.options[i].value === presetVal) {
              selectResPreset.value = presetVal;
              matched = true;
              break;
            }
          }
          if (!matched) {
            selectResPreset.value = 'custom';
            if (inputCustomW) inputCustomW.value = w;
            if (inputCustomH) inputCustomH.value = h;
            if (customResGrid) customResGrid.style.display = 'grid';
          } else {
            if (customResGrid) customResGrid.style.display = 'none';
          }
        }
        
        activePlayerResolution.width = w;
        activePlayerResolution.height = h;
      }
      
      if (valResolutionIndicator) {
        valResolutionIndicator.textContent = `Resolución: ${activePlayerResolution.width} x ${activePlayerResolution.height} px`;
      }
      adjustSimContainerSize();
    }

    if (selectVnnoxPlayer) selectVnnoxPlayer.addEventListener('change', updateResolutionFromSelection);

    function updateResolutionFromPreset() {
      if (!selectResPreset) return;
      const preset = selectResPreset.value;
      
      let w = 256;
      let h = 512;
      
      if (preset === 'custom') {
        if (customResGrid) customResGrid.style.display = 'grid';
        w = parseInt(inputCustomW.value) || 256;
        h = parseInt(inputCustomH.value) || 512;
      } else {
        if (customResGrid) customResGrid.style.display = 'none';
        const parts = preset.split('x');
        w = parseInt(parts[0]);
        h = parseInt(parts[1]);
      }
      
      activePlayerResolution.width = w;
      activePlayerResolution.height = h;
      
      if (valResolutionIndicator) {
        valResolutionIndicator.textContent = `Resolución: ${w} x ${h} px`;
      }
      
      adjustSimContainerSize();
    }

    if (selectResPreset) {
      selectResPreset.addEventListener('change', updateResolutionFromPreset);
    }
    if (inputCustomW) {
      inputCustomW.addEventListener('input', updateResolutionFromPreset);
    }
    if (inputCustomH) {
      inputCustomH.addEventListener('input', updateResolutionFromPreset);
    }

    function adjustSimContainerSize() {
      if (!simScreen) return;
      const maxW = 320;
      const maxH = 569;
      
      const w = activePlayerResolution.width;
      const h = activePlayerResolution.height;
      const ratio = w / h;
      
      let targetW = maxW;
      let targetH = maxW / ratio;
      
      if (targetH > maxH) {
        targetH = maxH;
        targetW = maxH * ratio;
      }
      
      // Asignar variables CSS de marco (bezel) dinámicamente
      document.documentElement.style.setProperty('--bezel-w', `${targetW}px`);
      document.documentElement.style.setProperty('--bezel-h', `${targetH}px`);
      
      // Escalar tamaño de fuente proporcionalmente para que se adapte a resoluciones
      const baseFontSize = (targetW / 256) * 16;
      simScreen.style.fontSize = `${baseFontSize}px`;
      
      // Volver a aplicar la calibración del mockup ya que cambió el tamaño
      applyCalibration();
      
      updateSimPreview();
    }

    // 5. EDICIÓN EN TIEMPO REAL Y VISIBILIDAD DE OVERLAYS
    const editSimHomeName = document.getElementById('edit-sim-home-name');
    const editSimAwayName = document.getElementById('edit-sim-away-name');
    const editSimHomeScore = document.getElementById('edit-sim-home-score');
    const editSimAwayScore = document.getElementById('edit-sim-away-score');
    const editSimClock = document.getElementById('edit-sim-clock');
    const editSimStatus = document.getElementById('edit-sim-status');
    const editSimEventText = document.getElementById('edit-sim-event-text');

    const editSimHomeStarName = document.getElementById('edit-sim-home-star-name');
    const editSimHomeStarImg = document.getElementById('edit-sim-home-star-img');
    const editSimAwayStarName = document.getElementById('edit-sim-away-star-name');
    const editSimAwayStarImg = document.getElementById('edit-sim-away-star-img');

    const chkShowHeader = document.getElementById('chk-show-header');
    const chkShowScoreboard = document.getElementById('chk-show-scoreboard');
    const chkShowEvents = document.getElementById('chk-show-events');
    const chkShowCta = document.getElementById('chk-show-cta');

    const valSimStatus = document.getElementById('val-sim-status');
    const valSimHomeName = document.getElementById('val-sim-home-name');
    const valSimAwayName = document.getElementById('val-sim-away-name');
    const valSimHomeScore = document.getElementById('val-sim-home-score');
    const valSimAwayScore = document.getElementById('val-sim-away-score');
    const valSimClock = document.getElementById('val-sim-clock');
    const valSimEventText = document.getElementById('val-sim-event-text');

    const overlayHeader = document.getElementById('sim-overlay-header');
    const overlayScoreboard = document.getElementById('sim-overlay-scoreboard');
    const overlayEvent = document.getElementById('sim-overlay-event');
    const overlayCta = document.getElementById('sim-overlay-cta');
    const overlayGoal = document.getElementById('sim-overlay-goal');

    function updateSimPreview() {
      if (!simScreen) return;
      
      // Fondo
      if (selectedMockup) {
        simScreen.style.backgroundImage = `url('${selectedMockup.url}')`;
      } else {
        simScreen.style.backgroundImage = 'none';
      }

      // Textos
      if (valSimStatus && editSimStatus) valSimStatus.textContent = editSimStatus.value;
      if (valSimHomeName && editSimHomeName) valSimHomeName.textContent = editSimHomeName.value;
      if (valSimAwayName && editSimAwayName) valSimAwayName.textContent = editSimAwayName.value;
      if (valSimHomeScore && editSimHomeScore) valSimHomeScore.textContent = editSimHomeScore.value;
      if (valSimAwayScore && editSimAwayScore) valSimAwayScore.textContent = editSimAwayScore.value;
      if (valSimClock && editSimClock) valSimClock.textContent = editSimClock.value;
      if (valSimEventText && editSimEventText) valSimEventText.textContent = editSimEventText.value;

      // Visibilidad
      const simStateSelect = document.getElementById('sim-state-select');
      const isGoalSim = simStateSelect && simStateSelect.value === 'goal';

      if (overlayGoal) {
        if (isGoalSim) {
          overlayGoal.style.display = 'flex';
          
          const valSimGoalPlayerName = document.getElementById('val-sim-goal-player-name');
          const valSimGoalPlayerTeam = document.getElementById('val-sim-goal-player-team');
          const valSimGoalMinuteVal = document.getElementById('val-sim-goal-minute-val');
          const valSimGoalScoreNew = document.getElementById('val-sim-goal-score-new');
          const valSimGoalPlayerImg = document.getElementById('val-sim-goal-player-img');

          // Parse scorer name from event text (e.g. "Gol de Xhaka" -> "Xhaka")
          let parsedScorer = '¡GOL!';
          if (editSimEventText) {
            const evtVal = editSimEventText.value;
            if (evtVal.toLowerCase().includes('gol de')) {
              const parts = evtVal.split('(');
              parsedScorer = parts[0].replace(/gol de/i, '').trim();
            }
          }

          if (valSimGoalPlayerName) valSimGoalPlayerName.textContent = parsedScorer;
          if (valSimGoalPlayerTeam) valSimGoalPlayerTeam.textContent = editSimAwayName ? editSimAwayName.value : 'Equipo';
          if (valSimGoalMinuteVal) valSimGoalMinuteVal.textContent = editSimClock ? editSimClock.value : '90\'';
          if (valSimGoalScoreNew) valSimGoalScoreNew.textContent = `${editSimHomeScore ? editSimHomeScore.value : 0} - ${editSimAwayScore ? editSimAwayScore.value : 0}`;
          
          if (valSimGoalPlayerImg && editSimAwayStarImg) {
            setStarImg(valSimGoalPlayerImg, editSimAwayStarImg.value);
          }
        } else {
          overlayGoal.style.display = 'none';
        }
      }

      if (overlayHeader && chkShowHeader) overlayHeader.style.display = (!isGoalSim && chkShowHeader.checked) ? 'flex' : 'none';
      if (overlayScoreboard && chkShowScoreboard) overlayScoreboard.style.display = (!isGoalSim && chkShowScoreboard.checked) ? 'flex' : 'none';
      if (overlayEvent && chkShowEvents) overlayEvent.style.display = (!isGoalSim && chkShowEvents.checked) ? 'block' : 'none';
      if (overlayCta && chkShowCta) overlayCta.style.display = (!isGoalSim && chkShowCta.checked) ? 'flex' : 'none';
      
      updateSimFlags();
    }

    function updateSimFlags() {
      if (!editSimHomeName || !editSimAwayName) return;
      const homeName = editSimHomeName.value.toLowerCase();
      const awayName = editSimAwayName.value.toLowerCase();
      
      const flagHome = document.getElementById('val-sim-home-flag');
      const flagAway = document.getElementById('val-sim-away-flag');
      const starImgHome = document.getElementById('val-sim-home-star-img');
      const starImgAway = document.getElementById('val-sim-away-star-img');
      const starNameHome = document.getElementById('val-sim-home-star-name');
      const starNameAway = document.getElementById('val-sim-away-star-name');
      
      if (flagHome) {
        if (homeName.includes('jordania') || homeName.includes('jordan')) {
          flagHome.src = getProxyUrl('https://cdn.sportmonks.com/images/countries/png/short/jo.png');
        } else if (homeName.includes('argelia') || homeName.includes('algeria')) {
          flagHome.src = getProxyUrl('https://cdn.sportmonks.com/images/countries/png/short/dz.png');
        } else {
          flagHome.src = getProxyUrl('https://cdn.sportmonks.com/images/countries/png/short/jo.png');
        }
      }
      
      if (flagAway) {
        if (awayName.includes('argelia') || awayName.includes('algeria')) {
          flagAway.src = getProxyUrl('https://cdn.sportmonks.com/images/countries/png/short/dz.png');
        } else if (awayName.includes('jordania') || awayName.includes('jordan')) {
          flagAway.src = getProxyUrl('https://cdn.sportmonks.com/images/countries/png/short/jo.png');
        } else {
          flagAway.src = getProxyUrl('https://cdn.sportmonks.com/images/countries/png/short/dz.png');
        }
      }

      if (starNameHome && editSimHomeStarName) starNameHome.textContent = editSimHomeStarName.value;
      if (starNameAway && editSimAwayStarName) starNameAway.textContent = editSimAwayStarName.value;
      if (starImgHome && editSimHomeStarImg) setStarImg(starImgHome, editSimHomeStarImg.value);
      if (starImgAway && editSimAwayStarImg) setStarImg(starImgAway, editSimAwayStarImg.value);
    }

    // 3D Flipper simulator logic
    let simFlagsFlipped = false;
    const simHomeFlipper = document.getElementById('sim-home-flipper');
    const simAwayFlipper = document.getElementById('sim-away-flipper');

    function toggleSimFlip() {
      simFlagsFlipped = !simFlagsFlipped;
      if (simHomeFlipper) simHomeFlipper.classList.toggle('flipped', simFlagsFlipped);
      if (simAwayFlipper) simAwayFlipper.classList.toggle('flipped', simFlagsFlipped);
    }

    // Auto-flip simulator flags every 4 seconds
    setInterval(toggleSimFlip, 4000);

    if (simHomeFlipper) {
      simHomeFlipper.addEventListener('click', () => {
        simHomeFlipper.classList.toggle('flipped');
      });
    }
    if (simAwayFlipper) {
      simAwayFlipper.addEventListener('click', () => {
        simAwayFlipper.classList.toggle('flipped');
      });
    }

    const inputsToListen = [
      editSimHomeName, editSimAwayName, editSimHomeScore, editSimAwayScore, 
      editSimClock, editSimStatus, editSimEventText,
      editSimHomeStarName, editSimHomeStarImg, editSimAwayStarName, editSimAwayStarImg,
      chkShowHeader, chkShowScoreboard, chkShowEvents, chkShowCta
    ].filter(Boolean);

    inputsToListen.forEach(input => {
      input.addEventListener('input', updateSimPreview);
      input.addEventListener('change', updateSimPreview);
    });

    if (simStateSelect) {
      simStateSelect.addEventListener('change', updateSimPreview);
    }

    // Sliders de calibración listeners
    const sliderX = document.getElementById('slider-offset-x');
    const sliderY = document.getElementById('slider-offset-y');
    const sliderW = document.getElementById('slider-width');
    const sliderH = document.getElementById('slider-height');
    const selectFit = document.getElementById('select-mockup-fit');
    
    if (sliderX) {
      sliderX.addEventListener('input', (e) => {
        calibration.offsetX = parseInt(e.target.value);
        updateCalibrationValuesUI();
        applyCalibration();
        saveCalibration();
      });
    }
    if (sliderY) {
      sliderY.addEventListener('input', (e) => {
        calibration.offsetY = parseInt(e.target.value);
        updateCalibrationValuesUI();
        applyCalibration();
        saveCalibration();
      });
    }
    if (sliderW) {
      sliderW.addEventListener('input', (e) => {
        calibration.width = parseInt(e.target.value);
        updateCalibrationValuesUI();
        applyCalibration();
        saveCalibration();
      });
    }
    if (sliderH) {
      sliderH.addEventListener('input', (e) => {
        calibration.height = parseInt(e.target.value);
        updateCalibrationValuesUI();
        applyCalibration();
        saveCalibration();
      });
    }
    if (selectFit) {
      selectFit.addEventListener('change', (e) => {
        calibration.fit = e.target.value;
        applyCalibration();
        saveCalibration();
      });
    }

    // Inicializar cargas de datos de la simulación
    loadMockups();
    loadVnnoxPlayers();
    loadCalibration();
  }
})();
