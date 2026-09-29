// @ts-check
/** WebAudio で効果音を合成する（音声ファイル不要） */

/** @type {AudioContext | null} */
let ctx = null;
let muted = false;

try { muted = localStorage.getItem('tabigacha:muted') === '1'; } catch { /* storage unavailable */ }

function audio() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/**
 * @param {number} freq
 * @param {number} start   seconds from now
 * @param {number} dur
 * @param {OscillatorType} [type]
 * @param {number} [gain]
 * @param {number} [freqEnd]
 */
function tone(freq, start, dur, type = 'square', gain = 0.08, freqEnd) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sound = {
  get muted() { return muted; },
  setMuted(/** @type {boolean} */ v) {
    muted = v;
    try { localStorage.setItem('tabigacha:muted', v ? '1' : '0'); } catch { /* ignore */ }
  },
  /** ルーレットのカチカチ音 */
  tick(/** @type {number} */ n = 0) { tone(700 + (n % 5) * 90, 0, 0.05, 'square', 0.04); },
  /** ボタン押下 */
  press() { tone(520, 0, 0.08, 'triangle', 0.1, 900); },
  /** 地域・都道府県の確定音 */
  stop() { tone(988, 0, 0.12, 'square', 0.07); tone(1319, 0.1, 0.3, 'square', 0.07); },
  /** レア演出の溜め */
  charge() { tone(120, 0, 0.9, 'sawtooth', 0.05, 900); },
  /** レア演出の発光 */
  rare() {
    [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) => tone(f, i * 0.06, 0.5, 'triangle', 0.06));
  },
  /** 結果ファンファーレ */
  fanfare(/** @type {boolean} */ big = false) {
    const notes = big ? [523, 659, 784, 1047, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, i * 0.11, i === notes.length - 1 ? 0.7 : 0.14, 'square', 0.06));
    if (big) notes.forEach((f, i) => tone(f / 2, i * 0.11, 0.14, 'triangle', 0.05));
  },
};
