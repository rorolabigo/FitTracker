/* ══════════════════════════════════════════════════════════
   FitTracker — app.js
   Données stockées en localStorage :
     ft_exercises  : liste des exercices configurés
     ft_sessions   : historique des séances (tableau d'objets)
     ft_weights    : historique des pesées (tableau d'objets)
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
let todayValues = {};         // { exId: count }
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

// ── Date helpers ──────────────────────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

// Derniers N jours (YYYY-MM-DD)
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
  if (!keys.length) return 0;
  let streak = 0;
  const today = todayKey();
  let cursor = today;
  for (const k of keys) {
    if (k === cursor) {
      streak++;
      const d = new Date(cursor + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    } else if (k < cursor) break;
  }
  return streak;
}

// ── Pré-remplir today depuis la dernière séance ───────────
function prefillToday() {
  todayValues = {};
  exercises.forEach(ex => { todayValues[ex.id] = 0; });

  // Si on a déjà sauvegardé today, on reprend ces valeurs
  const todaySessions = sessions.filter(s => s.date === todayKey());
  if (todaySessions.length) {
    const last = todaySessions[todaySessions.length - 1];
    last.data.forEach(d => { todayValues[d.id] = d.count; });
  }
}

// ── Rendu : écran Séance ──────────────────────────────────
function renderToday() {
  const prs = computePRs();
  const streak = computeStreak();

  // Header
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Bonjour 👋' : h < 18 ? 'Bon après-midi 💪' : 'Bonsoir 🌙';
  document.getElementById('today-greeting').textContent = greeting;
  document.getElementById('today-date').textContent = fmtDate(todayKey());
  document.getElementById('streak-badge').textContent = `🔥 ${streak} jour${streak > 1 ? 's' : ''}`;

  // Exercices
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';

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
    `;

    list.appendChild(card);

    // Flash PR
    if (isPR) card.querySelector('.ex-pr-badge')?.classList.add('pr-flash');
  });

  // Hint
  const hasSomething = exercises.some(ex => (todayValues[ex.id] || 0) > 0);
  const todaySaved   = sessions.some(s => s.date === todayKey());
  document.getElementById('save-hint').textContent =
    todaySaved ? 'Séance déjà enregistrée aujourd\'hui — tu peux la remplacer' :
    hasSomething ? '' : 'Saisis tes reps puis appuie sur Enregistrer';
}

// ── Rendu : écran Historique ──────────────────────────────
function renderHistory() {
  const prs = computePRs();
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (!sessions.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>Aucune séance enregistrée.<br>Lance ta première séance !</div>`;
    return;
  }

  // Grouper par date (plus récent en premier)
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

  // Graphique 7 jours (premier exercice)
  const chartContainer = document.getElementById('chart-container');
  chartContainer.innerHTML = '';

  if (exercises.length) {
    const ex = exercises[0];
    const days = lastNDays(7);
    const vals = days.map(d => {
      const s = sessions.filter(s => s.date === d).pop();
      if (!s) return 0;
      return (s.data.find(e => e.id === ex.id) || {}).count || 0;
    });
    const max = Math.max(...vals, 1);
    const dayNames = ['D','L','M','M','J','V','S'];

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    wrap.innerHTML = `<div class="chart-title">${esc(ex.name)} — 7 derniers jours</div>`;

    const bars = document.createElement('div');
    bars.className = 'chart-bars';

    days.forEach((d, i) => {
      const isToday = d === todayKey();
      const pct = vals[i] / max;
      const h = Math.max(pct * 70, vals[i] > 0 ? 6 : 3);
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
  const week = lastNDays(7);
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
    const div = document.createElement('div');
    div.className = 'stat-card';
    div.innerHTML = `
      <div class="stat-card-label">${esc(ex.name)}</div>
      <div class="stat-card-value">${total}</div>
      <div class="stat-card-sub${diff < 0 ? ' neg' : ''}">${diff > 0 ? '↑ +' : diff < 0 ? '↓ ' : ''}${diff !== 0 ? diff + ' vs sem. passée' : 'Première semaine'}</div>
    `;
    weekGrid.appendChild(div);
  });
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
    const prev = sorted.find(p => p.date < w.date);
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
  const vals = sorted.map(w => w.weight);
  const min = Math.min(...vals) - 1;
  const max = Math.max(...vals) + 1;
  const range = max - min;
  const W = 300, H = 90, PAD = 16;

  const points = sorted.map((w, i) => {
    const x = PAD + (i / (sorted.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (w.weight - min) / range) * (H - PAD * 2);
    return { x, y, w };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

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

  if (name === 'history') renderHistory();
  if (name === 'stats')   renderStats();
  if (name === 'weight')  renderWeight();
  if (name === 'today')   renderToday();
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

// ── Événements : boutons +/− séance ──────────────────────
document.getElementById('exercise-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-delta]');
  if (!btn) return;
  const id    = btn.dataset.id;
  const delta = parseInt(btn.dataset.delta, 10);
  todayValues[id] = Math.max(0, (todayValues[id] || 0) + delta);
  document.getElementById('val-' + id).textContent = todayValues[id];

  const ex   = exercises.find(ex => ex.id === id);
  const goal = ex?.goal || 1;
  const pct  = Math.min(100, Math.round(todayValues[id] / goal * 100));
  const bar  = document.getElementById('bar-' + id);
  bar.style.width = pct + '%';
  bar.className = 'progress-fill' + (todayValues[id] >= goal ? ' done' : '');
  bar.closest('.ex-card').querySelector('.ex-goal-label').textContent =
    `Objectif : ${goal} ${ex.unit}${todayValues[id] >= goal ? ' ✓' : ` — ${pct}%`}`;

  // PR check live
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
  const data = exercises.map(ex => ({
    id: ex.id, name: ex.name, count: todayValues[ex.id] || 0
  }));

  const today = todayKey();
  // Remplace la séance du jour si elle existe déjà
  const existing = sessions.findIndex(s => s.date === today);
  const session  = { date: today, ts: Date.now(), data };

  if (existing >= 0) sessions[existing] = session;
  else sessions.push(session);

  save('ft_weights_v2', sessions);
  save('ft_sessions', sessions); // compat

  // Check nouveaux PRs
  const prs = computePRs();
  const newPRs = data.filter(d => d.count > 0 && d.count >= (prs[d.id] || 0));
  if (newPRs.length) {
    const names = newPRs.map(d => exercises.find(e => e.id === d.id)?.name || d.name).join(', ');
    showToast(`🏆 Nouveau record : ${names} !`);
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
  if (!confirm('Supprimer cet exercice ? (Les données historiques sont conservées)')) return;
  exercises = exercises.filter(e => e.id !== editingExId);
  save('ft_exercises', exercises);
  closeModal('modal-edit-ex');
  renderToday();
  showToast('Exercice supprimé');
});

// ── Historique : ouvrir le détail ─────────────────────────
document.getElementById('history-list').addEventListener('click', e => {
  const card = e.target.closest('.history-card');
  if (!card) return;
  const idx = parseInt(card.dataset.idx, 10);
  const session = sessions[idx];
  if (!session) return;
  detailSessionIdx = idx;

  document.getElementById('detail-title').textContent = fmtDate(session.date);
  const content = document.getElementById('detail-content');
  content.innerHTML = (session.data || []).map(d => {
    const ex = exercises.find(e => e.id === d.id);
    const name = ex ? ex.name : d.name || d.id;
    const unit = ex ? ex.unit : 'reps';
    return `<div class="detail-row"><span class="detail-row-name">${esc(name)}</span><span class="detail-row-val">${d.count} ${unit}</span></div>`;
  }).join('') || '<p style="color:var(--text-muted);font-size:14px;padding:12px 0">Séance vide</p>';

  openModal('modal-session-detail');
});

document.getElementById('close-detail').addEventListener('click', () => closeModal('modal-session-detail'));

document.getElementById('delete-session').addEventListener('click', () => {
  if (!confirm('Supprimer cette séance ?')) return;
  sessions.splice(detailSessionIdx, 1);
  save('ft_weights_v2', sessions);
  save('ft_sessions', sessions);
  closeModal('modal-session-detail');
  renderHistory();
  showToast('Séance supprimée');
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
  const raw = document.getElementById('weight-input').value.replace(',', '.');
  const val = parseFloat(raw);
  const date = document.getElementById('weight-date-input').value || todayKey();

  if (!val || val < 30 || val > 300) { showToast('Poids invalide (30–300 kg)'); return; }

  weights.push({ date, weight: val, ts: Date.now() });
  weights.sort((a,b) => a.date.localeCompare(b.date));
  save('ft_weights', weights);
  closeModal('modal-weight');
  renderWeight();
  showToast(`${val.toFixed(1)} kg enregistré ✓`);
});

// ── Navigation ─────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
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

// Mise à jour de la date à minuit
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    prefillToday();
    if (currentScreen === 'today') renderToday();
  }
}, 60000);
