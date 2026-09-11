/* =====================================================
   KATA BERKAIT — JavaScript Game Engine
   Features: soal bank, timer, scoring, LR hint, reveal
   ===================================================== */

'use strict';

/* =====================================================
   AUDIO ENGINE (Web Audio API — 100% Native, Tanpa File Eksternal)
   ===================================================== */
class SoundFx {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
  // Detik timer normal atau genting (3 detik terakhir)
  tick(urgent = false) {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(urgent ? 920 : 540, this.ctx.currentTime);
      gain.gain.setValueAtTime(urgent ? 0.2 : 0.09, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (urgent ? 0.12 : 0.07));
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + (urgent ? 0.12 : 0.07));
    } catch(e) {}
  }
  // Alarm / Buzzer saat waktu timer habis
  buzzer() {
    try {
      this.init();
      if (!this.ctx) return;
      [0, 0.16, 0.32].forEach(delay => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, this.ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.28, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + 0.13);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + 0.13);
      });
    } catch(e) {}
  }
  // Suara poin tim / jawaban terbuka
  score() {
    try {
      this.init();
      if (!this.ctx) return;
      [587.33, 880, 1174.66].forEach((freq, idx) => {
        const delay = idx * 0.09;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.18, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + 0.25);
      });
    } catch(e) {}
  }
  // Suara reveal satu huruf
  reveal() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.09);
    } catch(e) {}
  }
}
const soundFx = new SoundFx();

/* =====================================================
   SOAL BANK  (40 kolom × 8 kata persis sama dengan PDF)
   Sumber tunggal: SOAL_DATA dari soal-data.js
   ===================================================== */
const SOAL_BANK = (typeof SOAL_DATA !== 'undefined' ? SOAL_DATA : []).map(col =>
  col.soal.map(item => ({
    kata: item.k.toUpperCase(),
    bintang: item.b,
    hint: item.h,
    tema: col.tema
  }))
);

/* =====================================================
   STATE
   ===================================================== */
const state = {
  scoreA: 0,
  scoreB: 0,
  timerInterval: null,
  timerDuration: 5,
  timerSeconds: 5,
  timerRunning: false,
  currentSoal: null,
  currentTema: '',
  currentCol: 1,
  roomCode: '6D',
  rowStates: [],   // per row: { revealed, answeredBy, leftRevealed, rightRevealed }
};

/* =====================================================
   DOM REFS
   ===================================================== */
const $ = id => document.getElementById(id);
const scoreAEl   = $('scoreA');
const scoreBEl   = $('scoreB');
const timerEl    = $('timerDisplay');
const ringEl     = $('ringProgress');
const gameBoardEl= $('gameBoard');
const toastEl    = $('toast');
const barA       = $('barA');
const barB       = $('barB');

/* =====================================================
   PARTICLES
   ===================================================== */
(function initParticles() {
  const container = $('particles');
  const colors = ['#00eeff','#b400ff','#ffd700','#ff3b5c','#00ff88','#3b9eff'];
  for (let i = 0; i < 50; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    const size = Math.random() * 5 + 2;
    el.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${Math.random()*15+8}s;
      animation-delay:${Math.random()*10}s;
    `;
    container.appendChild(el);
  }
})();

/* =====================================================
   ROOM CODE
   ===================================================== */
function changeRoomCode() {
  const input = $('roomCode');
  const val = input.value.trim().toUpperCase();
  if (!val) { showToast('⚠️ Kode tidak boleh kosong!'); return; }
  state.roomCode = val;
  showToast(`✅ Kode ruangan diubah ke: ${val}`);
}

/* =====================================================
   LOAD SOAL
   ===================================================== */
function loadSoal() {
  const col = parseInt($('colSelect').value);
  if (isNaN(col) || col < 1 || col > SOAL_BANK.length) {
    showToast(`⚠️ Kolom harus antara 1–${SOAL_BANK.length}`);
    return;
  }
  const soal = SOAL_BANK[col - 1];
  state.currentCol = col;
  state.currentTema = (typeof SOAL_DATA !== 'undefined' && SOAL_DATA[col - 1]) ? SOAL_DATA[col - 1].tema : `Kolom ${col}`;
  state.currentSoal = soal;
  state.rowStates = soal.map(() => ({
    revealed: false,
    answeredBy: null,   // 'A' | 'B' | null
    leftRevealed: 0,    // jumlah huruf yang sudah dibuka dari kiri
    rightRevealed: 0,   // jumlah huruf yang sudah dibuka dari kanan
  }));

  renderBoard(soal, state.currentTema, col);
  showToast(`📋 Kolom ${col} [${state.currentTema}] berhasil dimuat!`);
  stopTimer();
}

/* =====================================================
   HELPER RENDER LETTER TILES (Kotak Huruf Menarik & Bervariasi)
   ===================================================== */
function renderTilesHTML(kata, leftRevealed, rightRevealed, revealed) {
  const len = kata.length;
  const L = Math.min(leftRevealed, len);
  const R = Math.min(rightRevealed, len);

  return kata.split('').map((char, i) => {
    if (char === ' ') {
      return `<span class="letter-tile space" aria-hidden="true">&nbsp;</span>`;
    }
    const isShown = revealed || (i < L) || (i >= len - R);
    if (isShown) {
      return `<span class="letter-tile revealed bounce-in">${char}</span>`;
    } else {
      return `<span class="letter-tile hidden">❓</span>`;
    }
  }).join('');
}

/* =====================================================
   RENDER BOARD (Non-Piramida, Seragam & 100% Responsif)
   ===================================================== */
function renderBoard(soal, tema, col) {
  gameBoardEl.innerHTML = '';

  if (tema) {
    const titleEl = document.createElement('div');
    titleEl.className = 'board-col-badge';
    titleEl.innerHTML = `
      <span class="col-pill">KOLOM ${col}</span>
      <span class="col-tema-title">🏷️ ${tema}</span>
    `;
    gameBoardEl.appendChild(titleEl);
  }

  soal.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'word-row';
    row.id = `row-${idx}`;
    row.style.animationDelay = `${idx * 0.04}s`;

    row.innerHTML = `
      <div class="word-row-top">
        <div class="row-num-badge">
          <span class="row-num">${idx + 1}</span>
        </div>
        <div class="tiles-wrapper" id="word-${idx}">
          ${renderTilesHTML(item.kata, 0, 0, false)}
        </div>
        <div class="star-badge" id="star-${idx}">
          ⭐ ${item.bintang} Poin
        </div>
      </div>

      <div class="row-actions">
        <button class="btn btn-buka-kiri btn-sm" onclick="revealFromLeft(${idx})" id="btnKiri-${idx}" title="Buka 1 huruf dari kiri">
          ◀ KIRI
        </button>
        <button class="btn btn-buka-kanan btn-sm" onclick="revealFromRight(${idx})" id="btnKanan-${idx}" title="Buka 1 huruf dari kanan">
          KANAN ▶
        </button>
        <button class="btn btn-green btn-sm" onclick="addScore('A',${idx})" id="btnA-${idx}" title="+Poin Kelompok A">
          🟢 +TIM A
        </button>
        <button class="btn btn-orange btn-sm" onclick="addScore('B',${idx})" id="btnB-${idx}" title="+Poin Kelompok B">
          🟠 +TIM B
        </button>
      </div>
    `;
    gameBoardEl.appendChild(row);
  });
}

/* =====================================================
   RENDER WORD MASK (Update Kotak Huruf)
   ===================================================== */
function renderWordMask(idx) {
  const item   = state.currentSoal[idx];
  const rs     = state.rowStates[idx];
  const wordEl = $(`word-${idx}`);
  if (!wordEl) return;

  wordEl.innerHTML = renderTilesHTML(item.kata, rs.leftRevealed, rs.rightRevealed, rs.revealed);

  const nonSpaceLen = item.kata.replace(/\s+/g, '').length;
  // Hitung jumlah huruf unik yang sudah dibuka
  let openedCount = 0;
  for (let i = 0; i < item.kata.length; i++) {
    if (item.kata[i] !== ' ') {
      if (i < rs.leftRevealed || i >= item.kata.length - rs.rightRevealed) {
        openedCount++;
      }
    }
  }

  if (openedCount >= nonSpaceLen && !rs.revealed) {
    finalizeReveal(idx);
  }
}

/* =====================================================
   BUKA DARI KIRI  (satu huruf per klik)
   ===================================================== */
function revealFromLeft(idx) {
  if (!state.currentSoal) return;
  const rs   = state.rowStates[idx];
  if (rs.revealed) { showToast('Kata sudah terbuka sepenuhnya!'); return; }

  const kata = state.currentSoal[idx].kata;
  const len  = kata.length;
  const maxNew = len - rs.rightRevealed;

  if (rs.leftRevealed >= maxNew) {
    showToast('⬅️ Semua huruf dari kiri sudah dibuka!');
    return;
  }
  rs.leftRevealed++;
  // Lewati spasi jika karakter pas di spasi
  if (rs.leftRevealed < len && kata[rs.leftRevealed - 1] === ' ') {
    rs.leftRevealed++;
  }
  renderWordMask(idx);
  soundFx.reveal();
  showToast(`⬅️ Huruf terbuka dari kiri!`);
}

/* =====================================================
   BUKA DARI KANAN  (satu huruf per klik)
   ===================================================== */
function revealFromRight(idx) {
  if (!state.currentSoal) return;
  const rs   = state.rowStates[idx];
  if (rs.revealed) { showToast('Kata sudah terbuka sepenuhnya!'); return; }

  const kata = state.currentSoal[idx].kata;
  const len  = kata.length;
  const maxNew = len - rs.leftRevealed;

  if (rs.rightRevealed >= maxNew) {
    showToast('➡️ Semua huruf dari kanan sudah dibuka!');
    return;
  }
  rs.rightRevealed++;
  // Lewati spasi jika karakter dari kanan adalah spasi
  if (rs.rightRevealed < len && kata[len - rs.rightRevealed] === ' ') {
    rs.rightRevealed++;
  }
  renderWordMask(idx);
  soundFx.reveal();
  showToast(`➡️ Huruf terbuka dari kanan!`);
}

/* =====================================================
   FINALIZE REVEAL  (dipanggil saat semua huruf terbuka / skor bertambah)
   ===================================================== */
function finalizeReveal(idx) {
  const rs     = state.rowStates[idx];
  if (rs.revealed) return;
  rs.revealed  = true;

  const item   = state.currentSoal[idx];
  const wordEl = $(`word-${idx}`);
  if (wordEl) {
    wordEl.innerHTML = renderTilesHTML(item.kata, 0, 0, true);
  }

  const row = $(`row-${idx}`);
  if (row) row.classList.add('revealed');

  const btnKiri  = $(`btnKiri-${idx}`);
  const btnKanan = $(`btnKanan-${idx}`);
  if (btnKiri)  btnKiri.disabled  = true;
  if (btnKanan) btnKanan.disabled = true;

  showToast(`🎉 Kata "${item.kata}" Terbuka!`);
}

/* =====================================================
   ADD SCORE
   ===================================================== */
function addScore(team, idx) {
  if (!state.currentSoal) return;
  const rs = state.rowStates[idx];
  const pts = state.currentSoal[idx].bintang;
  const row = $(`row-${idx}`);

  if (team === 'A') {
    if (rs.answeredBy === 'A') { showToast('⚠️ Sudah dijawab Tim A!'); return; }
    if (rs.answeredBy === 'B') {
      state.scoreB = Math.max(0, state.scoreB - pts);
      row.classList.remove('answered-b');
    }
    rs.answeredBy = 'A';
    state.scoreA += pts;
    row.classList.add('answered-a');
    animateScore('A');
    soundFx.score();
    showToast(`🟢 +${pts} poin untuk Kelompok A!`);

  } else {
    if (rs.answeredBy === 'B') { showToast('⚠️ Sudah dijawab Tim B!'); return; }
    if (rs.answeredBy === 'A') {
      state.scoreA = Math.max(0, state.scoreA - pts);
      row.classList.remove('answered-a');
    }
    rs.answeredBy = 'B';
    state.scoreB += pts;
    row.classList.add('answered-b');
    animateScore('B');
    soundFx.score();
    showToast(`🔵 +${pts} poin untuk Kelompok B!`);
  }

  updateScoreDisplay();
  finalizeReveal(idx);

  // Check if all rows answered
  if (state.rowStates.every(r => r.answeredBy !== null)) {
    setTimeout(showWinner, 800);
  }
}

/* =====================================================
   UPDATE SCORE DISPLAY
   ===================================================== */
function updateScoreDisplay() {
  scoreAEl.textContent = state.scoreA;
  scoreBEl.textContent = state.scoreB;

  const total = Math.max(state.scoreA + state.scoreB, 1);
  barA.style.width = `${Math.min((state.scoreA / total) * 100, 100)}%`;
  barB.style.width = `${Math.min((state.scoreB / total) * 100, 100)}%`;
}

function animateScore(team) {
  const el = team === 'A' ? scoreAEl : scoreBEl;
  el.classList.remove('score-bump');
  void el.offsetWidth;
  el.classList.add('score-bump');
}

/* =====================================================
   TIMER (Konfigurasi 5s, 10s, s/d 30s + Sound FX)
   ===================================================== */
const RING_FULL = 326.7; // 2π × 52

function changeTimerDuration() {
  const sel = $('timerDuration');
  if (sel) {
    state.timerDuration = parseInt(sel.value, 10) || 5;
    if (!state.timerRunning) {
      state.timerSeconds = state.timerDuration;
      $('btnTimer').textContent = `⏱ Timer (${state.timerDuration} dtk)`;
      ringEl.style.strokeDashoffset = RING_FULL;
    }
  }
}

function startTimer() {
  soundFx.init(); // Aktivasi AudioContext dari gesture klik
  if (state.timerRunning) { stopTimer(); return; }

  const dur = state.timerDuration || 5;
  state.timerSeconds = dur;
  state.timerRunning = true;
  $('btnTimer').textContent = '⏹ Stop Timer';

  timerEl.textContent = dur;
  ringEl.style.strokeDashoffset = 0;
  timerEl.parentElement.classList.remove('timer-danger');
  soundFx.tick(false);

  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    timerEl.textContent = state.timerSeconds;

    const progress = Math.max(0, state.timerSeconds / dur);
    ringEl.style.strokeDashoffset = RING_FULL * (1 - progress);

    if (state.timerSeconds <= 3 && state.timerSeconds > 0) {
      timerEl.parentElement.classList.add('timer-danger');
      soundFx.tick(true); // Suara detik mendesak
    } else if (state.timerSeconds > 0) {
      soundFx.tick(false); // Suara detik normal
    }

    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      timerEl.textContent = '0';
      ringEl.style.strokeDashoffset = RING_FULL;
      $('btnTimer').textContent = `⏱ Timer (${dur} dtk)`;
      soundFx.buzzer(); // Alarm bunyi saat waktu habis!
      showToast('⏰ Waktu Habis!');
      setTimeout(() => {
        if (!state.timerRunning) {
          timerEl.textContent = '⏸';
          timerEl.parentElement.classList.remove('timer-danger');
        }
      }, 1500);
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  state.timerSeconds = state.timerDuration || 5;
  timerEl.textContent = '⏸';
  ringEl.style.strokeDashoffset = RING_FULL;
  timerEl.parentElement.classList.remove('timer-danger');
  $('btnTimer').textContent = `⏱ Timer (${state.timerDuration || 5} dtk)`;
}

/* =====================================================
   RESET SKOR
   ===================================================== */
function resetSkor() {
  openModal('🔄', 'Reset Skor?', 'Semua skor akan direset ke 0. Lanjutkan?', () => {
    state.scoreA = 0;
    state.scoreB = 0;
    updateScoreDisplay();
    stopTimer();

    if (state.currentSoal) {
      state.rowStates.forEach(rs => { rs.answeredBy = null; });
      // Re-color rows
      document.querySelectorAll('.word-row').forEach(r => {
        r.classList.remove('answered-a','answered-b');
      });
    }
    showToast('🔄 Skor direset!');
  });
}

/* =====================================================
   MODAL
   ===================================================== */
let pendingModalAction = null;

function openModal(icon, title, msg, onConfirm) {
  $('modalIcon').textContent = icon;
  $('modalTitle').textContent = title;
  $('modalMsg').textContent = msg;
  pendingModalAction = onConfirm;
  $('modalOverlay').classList.add('open');
}
function closeModal() {
  $('modalOverlay').classList.remove('open');
  pendingModalAction = null;
}
function confirmModal() {
  if (pendingModalAction) pendingModalAction();
  closeModal();
}
// Close on overlay click
$('modalOverlay').addEventListener('click', e => {
  if (e.target === $('modalOverlay')) closeModal();
});

/* =====================================================
   WINNER
   ===================================================== */
function showWinner() {
  const winner = state.scoreA >= state.scoreB ? 'A' : 'B';
  const score  = winner === 'A' ? state.scoreA : state.scoreB;
  const title  = state.scoreA === state.scoreB ? 'SERI! 🤝' : `KELOMPOK ${winner} MENANG! 🎉`;

  $('winnerTitle').textContent = title;
  $('winnerScore').textContent = `Skor: A=${state.scoreA} vs B=${state.scoreB}`;
  $('winnerOverlay').classList.add('open');
  spawnFireworks();
}
function closeWinner() {
  $('winnerOverlay').classList.remove('open');
}

function spawnFireworks() {
  const container = $('fireworks');
  container.innerHTML = '';
  const colors = ['#ffd700','#00eeff','#ff3b5c','#00ff88','#b400ff','#3b9eff'];
  for (let i = 0; i < 60; i++) {
    const dot = document.createElement('div');
    dot.className = 'firework-dot';
    const angle = Math.random() * 360;
    const dist  = 60 + Math.random() * 120;
    const rad   = angle * Math.PI / 180;
    dot.style.cssText = `
      left: 50%; top: 50%;
      background: ${colors[i % colors.length]};
      --tx: ${Math.cos(rad)*dist}px;
      --ty: ${Math.sin(rad)*dist}px;
      animation-delay: ${Math.random()*0.4}s;
      animation-duration: ${0.8 + Math.random()*0.8}s;
    `;
    container.appendChild(dot);
  }
}

/* =====================================================
   TOAST
   ===================================================== */
let toastTimer = null;
function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

/* =====================================================
   KEYBOARD SHORTCUTS
   ===================================================== */
document.addEventListener('keydown', e => {
  if (e.key === ' ' && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    startTimer();
  }
  if (e.key === 'Escape') { closeModal(); closeWinner(); }
  if (e.key === 'Enter' && e.target.id === 'colSelect') loadSoal();
  if (e.key === 'Enter' && e.target.id === 'roomCode')  changeRoomCode();
});

/* =====================================================
   INIT
   ===================================================== */
updateScoreDisplay();
loadSoal();
showToast('🎮 Selamat datang di Kata Berkait! Kolom 1 siap dimainkan.', 3500);
