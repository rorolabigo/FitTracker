/* ══════════════════════════════════════════════════════════
   FitTracker — app.js v1.2
   Données stockées en localStorage :
     ft_exercises  : liste des exercices configurés
     ft_sessions   : historique des séances (tableau d'objets)
     ft_weights    : historique des pesées (tableau d'objets)
     ft_prefs      : préférences utilisateur
   ══════════════════════════════════════════════════════════ */

'use strict';

// ── Exercices par défaut ──────────────────────────────────
const DEFAULT_EXERCISES = [
  { id: 'e1', name: 'Pompes',    unit: 'reps', goal: 50 },
  { id: 'e2', name: 'Dips',      unit: 'reps', goal: 30 },
  { id: 'e3', name: 'Abdos',     unit: 'reps', goal: 60 },
];

// ── État global ───────────────────────────────────────────
let exercises   = load('ft_exercises') || DEFAULT_EXERCISES;
let sessions    = load('ft_weights_v2') || load('ft_sessions') || [];
let weights     = load('ft_weights')   || [];
let todayValues = {};
let editingExId = null;
let detailSessionIdx = null;
let selectedUnit = 'reps';

// Compatibilité : renommer l'ancienne clé si besoin
if (load('ft_sessions') && !load('ft_weights_v2')) {
  sessions = load('ft_sessions');
  save('ft_weights_v2', sessions);
}

// ── Helpers localStorage ──────────────────────────────────
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}
function genId() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
}

// ── Retour haptique ───────────────────────────────────────
function haptic(duration = 8) {
  if (navigator.vibrate) navigator.vibrate(duration);
}

// ── Modale de confirmation générique ─────────────────────
function showConfirm(title, msg, okLabel, onOk, danger = true) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  const okBtn = document.getElementById('confirm-ok');
  okBtn.textContent = okLabel;
  okBtn.className   = 'modal-btn ' + (danger ? 'danger' : 'confirm');
  openModal('modal-confirm');
  // Remplacer le listener précédent
  const fresh = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(fresh, okBtn);
  fresh.textContent = okLabel;
  fresh.className   = 'modal-btn ' + (danger ? 'danger' : 'confirm');
  fresh.addEventListener('click', () => {
    closeModal('modal-confirm');
    onOk();
  });
}
document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('modal-confirm'));

// ── Date helpers ──────────────────────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function fmtDateShort(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
}
function fmtMonth(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
}
function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// ── Records personnels ────────────────────────────────────
function computePRs() {
  const pr = {};
  sessions.forEach(s => {
    (s.data || []).forEach(d => {
      if (!pr[d.id] || d.count > pr[d.id]) pr[d.id] = d.count;
    });
  });
  return pr;
}

// ── Streak ────────────────────────────────────────────────
function computeStreak() {
  const keys = [...new Set(sessions.map(s => s.date))].sort().reverse();
  if (!keys.length) return { current: 0, best: 0 };

  // Streak actuelle
  let current = 0;
  const today = todayKey();
  let cursor = today;
  for (const k of keys) {
    if (k === cursor) {
      current++;
      const d = new Date(cursor + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    } else if (k < cursor) break;
  }

  // Meilleur streak
  let best = 0;
  let streak = 1;
  const sorted = [...keys].sort();
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i-1] + 'T12:00:00');
    const curr = new Date(sorted[i]   + 'T12:00:00');
    const diff = (curr - prev) / 86400000;
    if (diff === 1) { streak++; best = Math.max(best, streak); }
    else streak = 1;
  }
  best = Math.max(best, current, sorted.length ? 1 : 0);

  return { current, best };
}

// ── Pré-remplir today depuis la dernière séance ───────────
function prefillToday() {
  todayValues = {};
  exercises.forEach(ex => { todayValues[ex.id] = 0; });
  const todaySessions = sessions.filter(s => s.date === todayKey());
  if (todaySessions.length) {
    const last = todaySessions[todaySessions.length - 1];
    last.data.forEach(d => { todayValues[d.id] = d.count; });
  }
}

// ── Rendu : écran Séance ──────────────────────────────────
function renderToday() {
  const prs    = computePRs();
  const streak = computeStreak();

  updateGreeting();
  document.getElementById('today-date').textContent = fmtDate(todayKey());
  const badge = document.getElementById('streak-badge');
  badge.textContent = `🔥 ${streak.current} jour${streak.current > 1 ? 's' : ''}`;
  badge.title = `Meilleur streak : ${streak.best} jour${streak.best > 1 ? 's' : ''}`;

  const list = document.getElementById('exercise-list');
  list.innerHTML = '';

  if (!exercises.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏋️</div>Aucun exercice configuré.<br>Ajoute ton premier exercice !</div>`;
    return;
  }

  exercises.forEach(ex => {
    const val   = todayValues[ex.id] || 0;
    const pr    = prs[ex.id] || 0;
    const goal  = ex.goal || 1;
    const pct   = Math.min(100, Math.round(val / goal * 100));
    const isDone = val >= goal;
    const isPR  = pr > 0 && val >= pr && val > 0;

    const card = document.createElement('div');
    card.className = 'ex-card';
    card.id = 'card-' + ex.id;

    card.innerHTML = `
      <div class="ex-card-header">
        <span class="ex-name">${esc(ex.name)}</span>
        <div class="ex-meta">
          ${pr > 0 ? `<span class="ex-pr-badge">🏆 Record : ${pr} ${ex.unit}</span>` : ''}
          <button class="ex-edit-btn" data-id="${ex.id}" title="Modifier">⋯</button>
        </div>
      </div>
      <div class="ex-controls">
        <div class="ex-btn-group">
          <button class="ex-btn minus" data-id="${ex.id}" data-delta="-10">−10</button>
          <button class="ex-btn minus" data-id="${ex.id}" data-delta="-1">−</button>
        </div>
        <div class="ex-count-wrap">
          <span class="ex-count" id="val-${ex.id}">${val}</span>
          <span class="ex-unit">${ex.unit}</span>
        </div>
        <div class="ex-btn-group">
          <button class="ex-btn plus" data-id="${ex.id}" data-delta="1">+</button>
          <button class="ex-btn plus" data-id="${ex.id}" data-delta="10">+10</button>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill${isDone ? ' done' : ''}" id="bar-${ex.id}" style="width:${pct}%"></div>
      </div>
      <div class="ex-goal-label">Objectif : ${goal} ${ex.unit}${isDone ? ' ✓' : ` — ${pct}%`}</div>
      <button class="rest-btn" data-id="${ex.id}" title="Timer de repos">⏱ Repos</button>
    `;

    list.appendChild(card);

    if (isPR) card.querySelector('.ex-pr-badge')?.classList.add('pr-flash');
  });

  const hasSomething = exercises.some(ex => (todayValues[ex.id] || 0) > 0);
  const todaySaved   = sessions.some(s => s.date === todayKey());
  document.getElementById('save-hint').textContent =
    todaySaved ? 'Séance déjà enregistrée aujourd\'hui — tu peux la remplacer' :
    hasSomething ? '' : 'Saisis tes reps puis appuie sur Enregistrer';
}

// ── Rendu : écran Historique ──────────────────────────────
function renderHistory() {
  const prs  = computePRs();
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (!sessions.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>Aucune séance enregistrée.<br>Lance ta première séance !</div>`;
    return;
  }

  const byDate = {};
  sessions.forEach((s, idx) => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push({ ...s, _idx: idx });
  });

  const dates = Object.keys(byDate).sort().reverse();

  dates.forEach(date => {
    const allSessions = byDate[date];
    const last = allSessions[allSessions.length - 1];

    const card = document.createElement('div');
    card.className = 'history-card';
    card.dataset.idx = last._idx;

    const pills = (last.data || []).map(d => {
      const ex = exercises.find(e => e.id === d.id);
      const name = ex ? ex.name : d.name || d.id;
      const isPR = d.count > 0 && d.count >= (prs[d.id] || 0) && allSessions.length === 1;
      return `<span class="history-pill${isPR ? ' pr' : ''}">${esc(name)} : ${d.count}</span>`;
    }).join('');

    card.innerHTML = `
      <div class="history-date">${fmtDate(date)}</div>
      <div class="history-pills">${pills || '<span style="color:var(--text-muted);font-size:13px">Séance vide</span>'}</div>
    `;

    list.appendChild(card);
  });
}

// ── Rendu : écran Stats ───────────────────────────────────
function renderStats() {
  const prs = computePRs();

  // Records personnels
  const prGrid = document.getElementById('pr-grid');
  prGrid.innerHTML = '';

  if (!exercises.length) {
    prGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🏆</div>Commence ta première séance<br>pour voir tes records ici !</div>`;
  } else {
    exercises.forEach(ex => {
      const pr = prs[ex.id] || 0;
      const div = document.createElement('div');
      div.className = 'stat-card';
      div.innerHTML = `
        <div class="stat-card-label">${esc(ex.name)}</div>
        <div class="stat-card-value">${pr || '—'}</div>
        <div class="stat-card-sub">${pr ? ex.unit + ' · record' : 'Pas encore de séance'}</div>
      `;
      prGrid.appendChild(div);
    });
  }

  // Graphique 7 jours
  const chartContainer = document.getElementById('chart-container');
  chartContainer.innerHTML = '';

  if (exercises.length) {
    const ex   = exercises[0];
    const days = lastNDays(7);
    const vals = days.map(d => {
      const s = sessions.filter(s => s.date === d).pop();
      if (!s) return 0;
      return (s.data.find(e => e.id === ex.id) || {}).count || 0;
    });
    const max      = Math.max(...vals, 1);
    const dayNames = ['D','L','M','M','J','V','S'];

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    wrap.innerHTML = `<div class="chart-title">${esc(ex.name)} — 7 derniers jours</div>`;

    const bars = document.createElement('div');
    bars.className = 'chart-bars';

    days.forEach((d, i) => {
      const isToday = d === todayKey();
      const pct  = vals[i] / max;
      const h    = Math.max(pct * 70, vals[i] > 0 ? 6 : 3);
      const dayName = dayNames[new Date(d + 'T12:00:00').getDay()];

      const col = document.createElement('div');
      col.className = 'chart-col';
      col.innerHTML = `
        <div class="chart-bar${isToday ? ' today' : ''}" style="height:${h}px">
          ${vals[i] > 0 ? `<div class="chart-bar-val">${vals[i]}</div>` : ''}
        </div>
        <div class="chart-day${isToday ? ' today' : ''}">${dayName}</div>
      `;
      bars.appendChild(col);
    });

    wrap.appendChild(bars);
    chartContainer.appendChild(wrap);
  }

  // Totaux semaine
  const weekGrid = document.getElementById('weekly-totals');
  weekGrid.innerHTML = '';
  const week     = lastNDays(7);
  const prevWeek = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - 14 + i);
    return d.toISOString().slice(0,10);
  });

  exercises.forEach(ex => {
    const total = week.reduce((acc, d) => {
      const s = sessions.filter(s => s.date === d).pop();
      return acc + ((s?.data.find(e => e.id === ex.id) || {}).count || 0);
    }, 0);
    const prevTotal = prevWeek.reduce((acc, d) => {
      const s = sessions.filter(s => s.date === d).pop();
      return acc + ((s?.data.find(e => e.id === ex.id) || {}).count || 0);
    }, 0);
    const diff = total - prevTotal;
    const div  = document.createElement('div');
    div.className = 'stat-card';
    div.innerHTML = `
      <div class="stat-card-label">${esc(ex.name)}</div>
      <div class="stat-card-value">${total}</div>
      <div class="stat-card-sub${diff < 0 ? ' neg' : ''}">${diff > 0 ? '↑ +' : diff < 0 ? '↓ ' : ''}${diff !== 0 ? diff + ' vs sem. passée' : 'Première semaine'}</div>
    `;
    weekGrid.appendChild(div);
  });

  // Streaks
  const streakStats = document.getElementById('streak-stats');
  streakStats.innerHTML = '';
  const { current, best } = computeStreak();

  const s1 = document.createElement('div');
  s1.className = 'stat-card';
  s1.innerHTML = `<div class="stat-card-label">Streak actuelle</div><div class="stat-card-value">🔥 ${current}</div><div class="stat-card-sub">jour${current > 1 ? 's' : ''} consécutif${current > 1 ? 's' : ''}</div>`;
  streakStats.appendChild(s1);

  const s2 = document.createElement('div');
  s2.className = 'stat-card';
  s2.innerHTML = `<div class="stat-card-label">Meilleur streak</div><div class="stat-card-value">🏅 ${best}</div><div class="stat-card-sub">jour${best > 1 ? 's' : ''} record</div>`;
  streakStats.appendChild(s2);
}

// ── Rendu : écran Poids ───────────────────────────────────
function renderWeight() {
  const list = document.getElementById('weight-list');
  list.innerHTML = '';

  if (!weights.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div>Aucune pesée enregistrée.<br>Ajoute ta première pesée !</div>`;
    renderWeightChart();
    return;
  }

  const sorted = [...weights].sort((a,b) => a.date.localeCompare(b.date));
  sorted.reverse().forEach((w, i) => {
    const prev  = sorted.find(p => p.date < w.date);
    const delta = prev ? w.weight - prev.weight : null;
    const isLatest = i === 0;

    const row = document.createElement('div');
    row.className = 'weight-row' + (isLatest ? ' latest' : '');
    row.innerHTML = `
      <div>
        <div class="weight-row-date${isLatest ? ' latest' : ''}">${fmtMonth(w.date)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${fmtDateShort(w.date)}</div>
      </div>
      <div style="text-align:right">
        <div class="weight-row-val">${w.weight.toFixed(1)} kg</div>
        ${delta !== null ? `<div class="weight-row-delta${delta > 0 ? ' pos' : ''}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} kg</div>` : '<div class="weight-row-delta" style="color:var(--text-muted)">départ</div>'}
      </div>
    `;
    list.appendChild(row);
  });

  renderWeightChart();
}

function renderWeightChart() {
  const el = document.getElementById('weight-chart');
  el.innerHTML = '';
  if (weights.length < 2) return;

  const sorted = [...weights].sort((a,b) => a.date.localeCompare(b.date));
  const vals   = sorted.map(w => w.weight);
  const min    = Math.min(...vals) - 1;
  const max    = Math.max(...vals) + 1;
  const range  = max - min;
  const W = 300, H = 90, PAD = 16;

  const points = sorted.map((w, i) => {
    const x = PAD + (i / (sorted.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (w.weight - min) / range) * (H - PAD * 2);
    return { x, y, w };
  });

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
      <polyline points="${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"
        fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--accent)"/>`).join('')}
      <text x="${points[0].x}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${fmtDateShort(sorted[0].date).slice(0,7)}</text>
      <text x="${points[points.length-1].x}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${fmtDateShort(sorted[sorted.length-1].date).slice(0,7)}</text>
    </svg>
  `;
  el.innerHTML = `<div class="weight-chart-svg-wrap">${svg}</div>`;
}

// ── Navigation ────────────────────────────────────────────
let currentScreen = 'today';

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');
  currentScreen = name;

  if (name === 'history')  renderHistory();
  if (name === 'stats')    renderStats();
  if (name === 'weight')   renderWeight();
  if (name === 'today')    renderToday();
  if (name === 'settings') renderSettings();
}

// ── Toast ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── Escape HTML ───────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Modal helpers ─────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── Timer de repos ────────────────────────────────────────
let restInterval  = null;
let restRemaining = 0;
let restTotal     = 0;

function startRestTimer(seconds) {
  clearInterval(restInterval);
  restRemaining = seconds;
  restTotal     = seconds;

  const timerEl = document.getElementById('rest-timer');
  const countEl = document.getElementById('rest-timer-count');
  const barEl   = document.getElementById('rest-timer-bar');

  timerEl.classList.remove('hidden');
  haptic(15);

  function tick() {
    countEl.textContent = restRemaining;
    barEl.style.width   = (restRemaining / restTotal * 100) + '%';

    if (restRemaining <= 0) {
      clearInterval(restInterval);
      timerEl.classList.add('hidden');
      showToast('⏱ Repos terminé — c\'est reparti !');
      haptic(200);
      return;
    }
    restRemaining--;
  }

  tick();
  restInterval = setInterval(tick, 1000);
}

document.getElementById('rest-timer-skip').addEventListener('click', () => {
  clearInterval(restInterval);
  document.getElementById('rest-timer').classList.add('hidden');
  haptic(10);
});

// Délégation : bouton repos dans les cards
document.getElementById('exercise-list').addEventListener('click', e => {
  const btn = e.target.closest('.rest-btn');
  if (!btn) return;
  haptic(10);
  startRestTimer(prefs.restDuration || 60);
});

// ── Événements : boutons +/− séance ──────────────────────
document.getElementById('exercise-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-delta]');
  if (!btn) return;
  haptic(8);
  const id    = btn.dataset.id;
  const delta = parseInt(btn.dataset.delta, 10);
  todayValues[id] = Math.max(0, (todayValues[id] || 0) + delta);
  document.getElementById('val-' + id).textContent = todayValues[id];

  const ex   = exercises.find(ex => ex.id === id);
  const goal = ex?.goal || 1;
  const pct  = Math.min(100, Math.round(todayValues[id] / goal * 100));
  const bar  = document.getElementById('bar-' + id);
  bar.style.width = pct + '%';
  bar.className   = 'progress-fill' + (todayValues[id] >= goal ? ' done' : '');
  bar.closest('.ex-card').querySelector('.ex-goal-label').textContent =
    `Objectif : ${goal} ${ex.unit}${todayValues[id] >= goal ? ' ✓' : ` — ${pct}%`}`;

  const prs  = computePRs();
  const pr   = prs[id] || 0;
  const badge = document.getElementById('card-' + id).querySelector('.ex-pr-badge');
  if (badge) {
    badge.textContent = `🏆 Record : ${pr} ${ex.unit}`;
    if (todayValues[id] > 0 && todayValues[id] >= pr) badge.classList.add('pr-flash');
    else badge.classList.remove('pr-flash');
  }
});

// Éditer un exercice
document.getElementById('exercise-list').addEventListener('click', e => {
  const btn = e.target.closest('.ex-edit-btn');
  if (!btn) return;
  editingExId = btn.dataset.id;
  const ex = exercises.find(e => e.id === editingExId);
  if (!ex) return;
  document.getElementById('edit-ex-name').value = ex.name;
  document.getElementById('edit-ex-goal').value = ex.goal;
  openModal('modal-edit-ex');
});

// ── Enregistrer la séance ─────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  haptic(15);
  const data  = exercises.map(ex => ({ id: ex.id, name: ex.name, count: todayValues[ex.id] || 0 }));
  const today = todayKey();
  const existing = sessions.findIndex(s => s.date === today);
  const session  = { date: today, ts: Date.now(), data };

  if (existing >= 0) sessions[existing] = session;
  else sessions.push(session);

  save('ft_weights_v2', sessions);
  save('ft_sessions', sessions);

  const prs    = computePRs();
  const newPRs = data.filter(d => d.count > 0 && d.count >= (prs[d.id] || 0));
  if (newPRs.length) {
    const names = newPRs.map(d => exercises.find(e => e.id === d.id)?.name || d.name).join(', ');
    showToast(`🏆 Nouveau record : ${names} !`);
    haptic([100, 50, 100]);
  } else {
    showToast('Séance enregistrée ✓');
  }

  renderToday();
});

// ── Ajouter un exercice ───────────────────────────────────
document.getElementById('add-ex-btn').addEventListener('click', () => {
  document.getElementById('new-ex-name').value = '';
  document.getElementById('new-ex-goal').value = '';
  selectedUnit = 'reps';
  document.querySelectorAll('.unit-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.unit === 'reps');
  });
  openModal('modal-add-ex');
  setTimeout(() => document.getElementById('new-ex-name').focus(), 300);
});

document.getElementById('cancel-add-ex').addEventListener('click', () => closeModal('modal-add-ex'));

document.getElementById('unit-picker').addEventListener('click', e => {
  const btn = e.target.closest('.unit-btn');
  if (!btn) return;
  selectedUnit = btn.dataset.unit;
  document.querySelectorAll('.unit-btn').forEach(b => b.classList.toggle('active', b === btn));
});

document.getElementById('confirm-add-ex').addEventListener('click', () => {
  const name = document.getElementById('new-ex-name').value.trim();
  const goal = parseInt(document.getElementById('new-ex-goal').value, 10);
  if (!name) { showToast('Donne un nom à l\'exercice'); return; }
  if (!goal || goal < 1) { showToast('Indique un objectif'); return; }

  const ex = { id: genId(), name, unit: selectedUnit, goal };
  exercises.push(ex);
  todayValues[ex.id] = 0;
  save('ft_exercises', exercises);
  closeModal('modal-add-ex');
  renderToday();
  showToast(`"${name}" ajouté !`);
  haptic(10);
});

// ── Modifier / supprimer un exercice ─────────────────────
document.getElementById('cancel-edit-ex').addEventListener('click', () => closeModal('modal-edit-ex'));

document.getElementById('confirm-edit-ex').addEventListener('click', () => {
  const name = document.getElementById('edit-ex-name').value.trim();
  const goal = parseInt(document.getElementById('edit-ex-goal').value, 10);
  if (!name) { showToast('Nom invalide'); return; }
  if (!goal || goal < 1) { showToast('Objectif invalide'); return; }

  const ex = exercises.find(e => e.id === editingExId);
  if (ex) { ex.name = name; ex.goal = goal; }
  save('ft_exercises', exercises);
  closeModal('modal-edit-ex');
  renderToday();
  showToast('Exercice mis à jour ✓');
});

document.getElementById('delete-ex').addEventListener('click', () => {
  closeModal('modal-edit-ex');
  showConfirm(
    'Supprimer l\'exercice',
    'Les données historiques sont conservées. Veux-tu vraiment supprimer cet exercice ?',
    'Supprimer',
    () => {
      exercises = exercises.filter(e => e.id !== editingExId);
      save('ft_exercises', exercises);
      renderToday();
      showToast('Exercice supprimé');
      haptic(20);
    }
  );
});

// ── Historique : ouvrir le détail ─────────────────────────
document.getElementById('history-list').addEventListener('click', e => {
  const card = e.target.closest('.history-card');
  if (!card) return;
  const idx     = parseInt(card.dataset.idx, 10);
  const session = sessions[idx];
  if (!session) return;
  detailSessionIdx = idx;

  document.getElementById('detail-title').textContent = fmtDate(session.date);
  const content = document.getElementById('detail-content');
  content.innerHTML = (session.data || []).map(d => {
    const ex   = exercises.find(e => e.id === d.id);
    const name = ex ? ex.name : d.name || d.id;
    const unit = ex ? ex.unit : 'reps';
    return `<div class="detail-row"><span class="detail-row-name">${esc(name)}</span><span class="detail-row-val">${d.count} ${unit}</span></div>`;
  }).join('') || '<p style="color:var(--text-muted);font-size:14px;padding:12px 0">Séance vide</p>';

  openModal('modal-session-detail');
});

document.getElementById('close-detail').addEventListener('click', () => closeModal('modal-session-detail'));

document.getElementById('delete-session').addEventListener('click', () => {
  closeModal('modal-session-detail');
  showConfirm(
    'Supprimer la séance',
    'Cette séance sera définitivement supprimée de l\'historique.',
    'Supprimer',
    () => {
      sessions.splice(detailSessionIdx, 1);
      save('ft_weights_v2', sessions);
      save('ft_sessions', sessions);
      renderHistory();
      showToast('Séance supprimée');
      haptic(20);
    }
  );
});

// ── Poids ─────────────────────────────────────────────────
document.getElementById('weight-add-btn').addEventListener('click', () => {
  document.getElementById('weight-input').value = '';
  document.getElementById('weight-date-input').value = todayKey();
  openModal('modal-weight');
  setTimeout(() => document.getElementById('weight-input').focus(), 300);
});

document.getElementById('cancel-weight').addEventListener('click', () => closeModal('modal-weight'));

document.getElementById('confirm-weight').addEventListener('click', () => {
  const raw  = document.getElementById('weight-input').value.replace(',', '.');
  const val  = parseFloat(raw);
  const date = document.getElementById('weight-date-input').value || todayKey();

  if (!val || val < 30 || val > 300) { showToast('Poids invalide (30–300 kg)'); return; }

  weights.push({ date, weight: val, ts: Date.now() });
  weights.sort((a,b) => a.date.localeCompare(b.date));
  save('ft_weights', weights);
  closeModal('modal-weight');
  renderWeight();
  showToast(`${val.toFixed(1)} kg enregistré ✓`);
  haptic(10);
});

// ── Navigation ─────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => { haptic(6); showScreen(btn.dataset.screen); });
});

// Fermer modales en cliquant dehors
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Init ─────────────────────────────────────────────────
prefillToday();
renderToday();

setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    prefillToday();
    if (currentScreen === 'today') renderToday();
  }
}, 60000);

/* ══════════════════════════════════════════════════════════
   PARAMÈTRES — v1.2
   ══════════════════════════════════════════════════════════ */

const prefs = load('ft_prefs') || {
  theme: 'auto',
  bgGray: false,
  accent: '#534AB7',
  userName: '',
  weeklyGoal: 5,
  restDuration: 60,
};

// Assurer la rétrocompat si restDuration absent
if (!prefs.restDuration) prefs.restDuration = 60;

function savePrefs() { save('ft_prefs', prefs); }

// ── Appliquer le thème ────────────────────────────────────
function applyTheme() {
  const body = document.body;
  body.classList.remove('theme-light', 'theme-dark', 'bg-gray');
  if (prefs.theme === 'light') body.classList.add('theme-light');
  else if (prefs.theme === 'dark') body.classList.add('theme-dark');
  if (prefs.bgGray) body.classList.add('bg-gray');
  document.documentElement.style.setProperty('--accent', prefs.accent);
  document.documentElement.style.setProperty('--accent-light', hexToRgba(prefs.accent, 0.12));
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Salutation dynamique ──────────────────────────────────
function updateGreeting() {
  const h    = new Date().getHours();
  const base  = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const emoji = h < 12 ? '👋' : h < 18 ? '💪' : '🌙';
  const name  = prefs.userName ? ` ${prefs.userName}` : '';
  const el    = document.getElementById('today-greeting');
  if (el) el.textContent = `${base}${name} ${emoji}`;
}

// ── Rendu de l'écran Paramètres ───────────────────────────
function renderSettings() {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === prefs.theme);
  });
  const toggleBg = document.getElementById('toggle-bg');
  toggleBg.checked = prefs.bgGray;
  document.getElementById('bg-label').textContent = prefs.bgGray ? 'Gris' : 'Blanc';
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.color === prefs.accent);
  });
  document.getElementById('setting-name').value    = prefs.userName || '';
  document.getElementById('goal-value').textContent = prefs.weeklyGoal;
  document.getElementById('rest-value').textContent = prefs.restDuration;
}

// ── Événements paramètres ─────────────────────────────────

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    prefs.theme = btn.dataset.theme;
    savePrefs(); applyTheme(); renderSettings();
    showToast('Thème mis à jour');
  });
});

document.getElementById('toggle-bg').addEventListener('change', function() {
  prefs.bgGray = this.checked;
  document.getElementById('bg-label').textContent = this.checked ? 'Gris' : 'Blanc';
  savePrefs(); applyTheme();
});

document.getElementById('color-picker').addEventListener('click', e => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  prefs.accent = dot.dataset.color;
  savePrefs(); applyTheme(); renderSettings();
  showToast('Couleur mise à jour');
});

document.getElementById('setting-name').addEventListener('input', function() {
  prefs.userName = this.value.trim();
  savePrefs();
  updateGreeting();
});

document.getElementById('goal-minus').addEventListener('click', () => {
  if (prefs.weeklyGoal <= 1) return;
  prefs.weeklyGoal--;
  document.getElementById('goal-value').textContent = prefs.weeklyGoal;
  savePrefs();
});
document.getElementById('goal-plus').addEventListener('click', () => {
  if (prefs.weeklyGoal >= 7) return;
  prefs.weeklyGoal++;
  document.getElementById('goal-value').textContent = prefs.weeklyGoal;
  savePrefs();
});

document.getElementById('rest-minus').addEventListener('click', () => {
  if (prefs.restDuration <= 15) return;
  prefs.restDuration -= 15;
  document.getElementById('rest-value').textContent = prefs.restDuration;
  savePrefs();
});
document.getElementById('rest-plus').addEventListener('click', () => {
  if (prefs.restDuration >= 300) return;
  prefs.restDuration += 15;
  document.getElementById('rest-value').textContent = prefs.restDuration;
  savePrefs();
});

// Export JSON
document.getElementById('btn-export').addEventListener('click', () => {
  const data = { version: '1.2', exportDate: new Date().toISOString(), exercises, sessions, weights, prefs };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `fittracker-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Données exportées ✓');
});

// Import JSON
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    let data;
    try { data = JSON.parse(e.target.result); } catch {
      showToast('❌ Fichier invalide — JSON incorrect'); return;
    }
    if (!data.exercises || !Array.isArray(data.exercises) ||
        !data.sessions  || !Array.isArray(data.sessions)  ||
        !data.weights   || !Array.isArray(data.weights)) {
      showToast('❌ Structure non reconnue'); return;
    }
    const nbS = data.sessions.length;
    const nbP = data.weights.length;
    const dateExport = data.exportDate
      ? new Date(data.exportDate).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
      : 'date inconnue';

    showConfirm(
      'Restaurer la sauvegarde ?',
      `Exportée le ${dateExport}\n${nbS} séance${nbS > 1 ? 's' : ''} · ${nbP} pesée${nbP > 1 ? 's' : ''}\n\nTes données actuelles seront remplacées.`,
      'Restaurer',
      () => {
        exercises = data.exercises;
        sessions  = data.sessions;
        weights   = data.weights;
        save('ft_exercises',  exercises);
        save('ft_weights_v2', sessions);
        save('ft_sessions',   sessions);
        save('ft_weights',    weights);
        if (data.prefs && typeof data.prefs === 'object') {
          Object.assign(prefs, data.prefs);
          savePrefs(); applyTheme(); renderSettings();
        }
        prefillToday();
        showToast(`✅ ${nbS} séance${nbS > 1 ? 's' : ''} restaurée${nbS > 1 ? 's' : ''} !`);
        haptic(20);
      },
      false
    );
  };
  reader.readAsText(file);
});

// Réinitialisation
document.getElementById('btn-reset').addEventListener('click', () => {
  showConfirm(
    'Effacer toutes les données',
    'Séances, pesées, exercices et préférences seront définitivement supprimés. Cette action est irréversible.',
    'Tout effacer',
    () => {
      localStorage.clear();
      showToast('Données effacées — rechargement…');
      haptic([100, 60, 200]);
      setTimeout(() => location.reload(), 1500);
    }
  );
});

// ── Init paramètres ───────────────────────────────────────
applyTheme();
updateGreeting();
