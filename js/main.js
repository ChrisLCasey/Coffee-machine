import { CONFIG } from './config.js';
import { Procedure, STEPS } from './procedure.js';
import { Touchscreen } from './touchscreen.js';
import { SceneApp } from './scene.js';
import { SinkPanel } from './panel.js';

const $ = (id) => document.getElementById(id);

// ---- config (URL overrides) ---------------------------------------------------
const q = new URLSearchParams(location.search);
const cfg = { ...CONFIG };
if (q.get('unit')) cfg.coolingUnit = q.get('unit').toUpperCase() === 'SU12' ? 'SU12' : 'SU05';
if (q.get('feedback')) cfg.feedback = q.get('feedback') === 'none' ? 'none' : 'subtle';
if (q.get('strictpin') === '1') cfg.strictPin = true;
if (q.get('hints') === '0') cfg.allowHints = false;
const facilitator = q.get('facilitator') === '1';

// ---- core objects ---------------------------------------------------------------
const proc = new Procedure(cfg);
const screen = new Touchscreen(cfg, onScreenEvent);
const scene = new SceneApp($('stage'), { touchscreen: screen, coolingUnit: cfg.coolingUnit, onPart });
const panel = new SinkPanel($('panel'), proc, {
  onWrong: flashMisstep,
  onDone: () => { scene.markClean(); refreshFacilitator(); },
});

// ---- HUD ------------------------------------------------------------------------
function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function updateTimer() {
  $('timer').textContent = fmt(proc.elapsed());
}
setInterval(updateTimer, 250);

function flashMisstep() {
  if (cfg.feedback !== 'subtle') return;
  const el = $('misstep');
  el.textContent = `Missteps: ${proc.totalWrong}`;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function refreshFacilitator() {
  if (!facilitator) return;
  const list = $('facil-list');
  list.innerHTML = '';
  STEPS.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = `${s.n}. ${s.title}`;
    if (s.n < proc.step) li.className = 'done';
    else if (s.n === proc.step && !proc.done) li.className = 'now';
    list.appendChild(li);
  });
}

function setupHud() {
  $('misstep').hidden = cfg.feedback !== 'subtle';
  $('misstep').textContent = 'Missteps: 0';
  $('hintBtn').hidden = !cfg.allowHints;
  $('hintBox').hidden = true;
  $('facil').hidden = !facilitator;
  refreshFacilitator();
}

// ---- event routing ----------------------------------------------------------------
function applyResult(r, partId) {
  if (r.outcome === 'wrong') {
    flashMisstep();
    if (partId) scene.nudge(partId);
  } else if (r.effect === 'open_panel') {
    panel.open();
  } else if (r.effect) {
    scene.applyEffect(r.effect);
  }
  if (r.completed) refreshFacilitator();
  if (proc.done) finish();
}

function onScreenEvent(ev) {
  if (!proc.started || proc.done) return;
  applyResult(proc.handleScreen(ev.id), null);
}

function onPart(id) {
  if (!proc.started || proc.done || panel.isOpen) return;
  applyResult(proc.handlePart(id), id);
}

// ---- flow ---------------------------------------------------------------------------
function start() {
  proc.start();
  $('intro').hidden = true;
  $('hud').classList.add('live');
  setupHud();
}

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  screen.showComplete();
  setTimeout(showResults, 1400);
}

function showResults() {
  const s = proc.summary();
  const rows = s.steps
    .map((st) => `<tr><td>${st.n}</td><td>${st.title}</td><td>${st.wrong ? `<span class="bad">${st.wrong}</span>` : '<span class="ok">0</span>'}</td><td>${st.ms == null ? '–' : fmt(st.ms)}</td></tr>`)
    .join('');
  const wrongList = s.wrongEvents.length
    ? `<h3>Missteps</h3><ul class="wrong-list">${s.wrongEvents.map((w) => `<li><b>Step ${w.step}:</b> ${w.label}</li>`).join('')}</ul>`
    : '<p class="ok-line">No missteps. Clean run.</p>';
  $('results').innerHTML = `
    <div class="results-card">
      <h2>Procedure complete</h2>
      <div class="stats">
        <div><b>${fmt(s.totalMs)}</b><span>Time</span></div>
        <div><b>${s.totalWrong}</b><span>Missteps</span></div>
        <div><b>${s.hintsUsed}</b><span>Hints used</span></div>
      </div>
      <table><thead><tr><th>#</th><th>Step</th><th>Missteps</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>
      ${wrongList}
      <div class="panel-actions">
        <button class="btn" id="copyBtn">Copy results</button>
        <button class="btn primary" id="restartBtn">Run again</button>
      </div>
    </div>`;
  $('results').hidden = false;
  $('copyBtn').addEventListener('click', async () => {
    const lines = [
      `Franke A600 cleaning test - ${fmt(s.totalMs)}, ${s.totalWrong} missteps, ${s.hintsUsed} hints`,
      ...s.steps.map((st) => `${st.n}. ${st.title} | missteps: ${st.wrong} | ${st.ms == null ? '-' : fmt(st.ms)}`),
      ...s.wrongEvents.map((w) => `Misstep at step ${w.step}: ${w.label}`),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); $('copyBtn').textContent = 'Copied'; } catch (e) { $('copyBtn').textContent = 'Copy failed'; }
  });
  $('restartBtn').addEventListener('click', restart);
}

function restart() {
  finished = false;
  proc.reset();
  screen.reset();
  scene.resetState();
  panel.reset();
  $('results').hidden = true;
  $('hud').classList.remove('live');
  $('intro').hidden = false;
  $('hintBox').hidden = true;
  $('timer').textContent = '00:00';
  setupHud();
}

// ---- UI wiring -------------------------------------------------------------------------
$('startBtn').addEventListener('click', start);
document.querySelectorAll('[data-view]').forEach((b) => {
  b.addEventListener('click', () => scene.applyView(b.dataset.view, false));
});
let hintTimer = null;
$('hintBtn').addEventListener('click', () => {
  if (!proc.started || proc.done) return;
  const t = proc.hint();
  $('hintBox').textContent = t;
  $('hintBox').hidden = false;
  $('hintBtn').textContent = `Hint (${proc.hintsUsed} used)`;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { $('hintBox').hidden = true; }, 7000);
});
$('restartTop').addEventListener('click', restart);

setupHud();
window.__app = { proc, scene, screen, panel, cfg }; // handy for the facilitator console
window.__appReady = true;
