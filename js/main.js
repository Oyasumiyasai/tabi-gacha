// @ts-check
import { DISTANCES, PREFECTURES, REGIONS, RESIDENCES, SPECIAL_PREF_IDS } from './data.js';
import { draw, pick, secureRandom } from './lottery.js';
import { createJapanMap, shortName } from './map.js';
import { sound } from './sound.js';
import { createConfetti } from './fx.js';

/** @typedef {import('./lottery.js').DrawResult} DrawResult */
/** @typedef {import('./data.js').Prefecture} Prefecture */
/** @typedef {'idle'|'regionSpin'|'regionStopping'|'regionDone'|'prefSpin'|'prefStopping'|'done'} Phase */

/** @template {HTMLElement} T @param {string} id @returns {T} */
const $ = (id) => /** @type {T} */ (document.getElementById(id));

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPIN_MS = reducedMotion ? 200 : 85;
const STOP_DELAYS = [95, 105, 120, 135, 155, 180, 210, 250, 300, 360, 440, 540];

const els = {
  settings: $('settings'),
  residence: /** @type {HTMLSelectElement} */ ($('residence')),
  distances: $('distances'),
  action: /** @type {HTMLButtonElement} */ ($('action')),
  actionLabel: $('actionLabel'),
  hint: $('hint'),
  frame: $('mapFrame'),
  banner: $('banner'),
  bannerKicker: $('bannerKicker'),
  bannerText: $('bannerText'),
  result: $('result'),
  resultBadge: $('resultBadge'),
  resultName: $('resultName'),
  resultRegion: $('resultRegion'),
  ticketFrom: $('ticketFrom'),
  ticketNo: $('ticketNo'),
  ticketDate: $('ticketDate'),
  resultCatch: $('resultCatch'),
  resultSpots: $('resultSpots'),
  resultOnsen: $('resultOnsen'),
  resultFoods: $('resultFoods'),
  detailBtn: $('detailBtn'),
  againBtn: $('againBtn'),
  detail: /** @type {HTMLDialogElement} */ ($('detail')),
  detailRegion: $('detailRegion'),
  detailTitle: $('detailTitle'),
  detailCatch: $('detailCatch'),
  detailBody: $('detailBody'),
  detailClose: $('detailClose'),
  mute: $('mute'),
  flash: $('flash'),
};

const map = createJapanMap($('map'));
const confetti = createConfetti(/** @type {HTMLCanvasElement} */ ($('confetti')));
const prefById = new Map(PREFECTURES.map((p) => [p.id, p]));
const regionById = new Map(REGIONS.map((r) => [r.id, r]));

/** @type {{phase: Phase, result: DrawResult | null, timer: number, token: number, pool: number[]}} */
const state = { phase: 'idle', result: null, timer: 0, token: 0, pool: [] };

/* ------------------------------------------------------------------ settings */

const STORE_KEY = 'tabigacha:settings';
/** @returns {{residence: string, distance: string}} */
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    const residence = RESIDENCES.some((r) => r.id === raw.residence) ? raw.residence : 'kanto';
    const distance = DISTANCES.some((d) => d.id === raw.distance) ? raw.distance : 'random';
    return { residence, distance };
  } catch {
    return { residence: 'kanto', distance: 'random' };
  }
}

/**
 * @param {HTMLElement} host
 * @param {string} name
 * @param {{id: string, name: string, hint?: string}[]} items
 * @param {string} checked
 */
function renderRadios(host, name, items, checked) {
  for (const item of items) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = item.id;
    input.checked = item.id === checked;
    const span = document.createElement('span');
    span.textContent = item.name;
    label.append(input, span);
    if (item.hint) {
      const small = document.createElement('small');
      small.textContent = item.hint;
      label.append(small);
    }
    host.append(label);
  }
}

const initial = loadSettings();
for (const r of RESIDENCES) els.residence.add(new Option(r.name, r.id, false, r.id === initial.residence));
renderRadios(els.distances, 'distance', DISTANCES, initial.distance);

function currentSettings() {
  const form = /** @type {HTMLFormElement} */ (els.settings);
  const data = new FormData(form);
  return {
    residence: String(data.get('residence') ?? 'kanto'),
    distance: /** @type {import('./lottery.js').Distance} */ (String(data.get('distance') ?? 'random')),
  };
}

els.settings.addEventListener('change', () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(currentSettings())); } catch { /* ignore */ }
});

/* ------------------------------------------------------------------ helpers */

const wait = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** 途中でリセットされたら以降の演出を止めるためのトークン */
function alive(/** @type {number} */ token) { return token === state.token; }

/**
 * @param {string} kicker
 * @param {string} text
 * @param {''|'spin'|'pop'|'rare'|'win'} mode
 */
function setBanner(kicker, text, mode = '') {
  els.bannerKicker.textContent = kicker;
  els.bannerText.textContent = text;
  els.banner.className = 'banner';
  if (mode) {
    void els.banner.offsetWidth; // アニメーションを再生し直す
    els.banner.classList.add(`is-${mode}`);
  }
}

/**
 * @param {Phase} phase
 * @param {string} label
 * @param {string} hint
 * @param {'go'|'stop'|'wait'} look
 */
function setPhase(phase, label, hint, look) {
  state.phase = phase;
  els.actionLabel.textContent = label;
  els.hint.textContent = hint;
  els.action.disabled = look === 'wait';
  els.action.dataset.look = look;
}

/** ひとつ前と違う要素を選ぶ */
function pickOther(/** @type {any[]} */ list, /** @type {any} */ prev) {
  if (list.length < 2) return list[0];
  let next = prev;
  while (next === prev) next = pick(list);
  return next;
}

function flash(/** @type {string} */ cls = '') {
  if (reducedMotion) return;
  els.flash.className = 'flash';
  void els.flash.offsetWidth;
  els.flash.classList.add('is-on');
  if (cls) els.flash.classList.add(cls);
}

function burstFromBanner(/** @type {number} */ count) {
  const r = els.banner.getBoundingClientRect();
  confetti.burst(r.left + r.width / 2, r.top + r.height / 2, count);
}

const isRareMode = () => state.result !== null && state.result.effect !== 'normal';

/* ------------------------------------------------------------------ STEP 1: 地域ルーレット */

function startRegionSpin() {
  const { residence, distance } = currentSettings();
  const result = draw(residence, distance);
  state.result = result;
  state.token++;

  els.result.hidden = true;
  els.settings.toggleAttribute('inert', true);
  els.settings.classList.add('is-locked');
  els.frame.classList.remove('is-rare', 'is-charging', 'is-win');
  map.reset();
  const pool = PREFECTURES.filter((p) => result.candidateRegions.includes(p.region)).map((p) => p.id);
  map.setCandidates(new Set(pool));

  if (distance === 'near') {
    void startNearDraw(state.token);
    return;
  }

  sound.press();
  setPhase('regionSpin', '行き先を決める', 'ボタンを押して地域をストップ！', 'stop');

  const regions = result.candidateRegions;
  /** @type {string | null} */
  let lit = null;
  let n = 0;
  const tick = () => {
    // 候補が1地域（近く）の場合は点滅させる
    lit = regions.length === 1 ? (lit ? null : regions[0]) : pickOther(regions, lit);
    map.lightRegion(lit);
    setBanner('ROULETTE', lit ? regionById.get(/** @type {any} */ (lit))?.name ?? '' : '', 'spin');
    sound.tick(n++);
  };
  tick();
  state.timer = window.setInterval(tick, SPIN_MS);
}

/**
 * 溜め → 日本全体が虹色に光る（本物・ダミー共通の演出）
 * @param {number} token
 * @returns {Promise<boolean>} 途中でリセットされたら false
 */
async function playRareReveal(token) {
  map.lightRegion(null);
  setBanner('', '……', 'pop');
  els.frame.classList.add('is-charging');
  sound.charge();
  await wait(1000);
  if (!alive(token)) return false;
  els.frame.classList.remove('is-charging');
  els.frame.classList.add('is-rare');
  map.setRare(true);
  flash('is-rainbow');
  sound.rare();
  setBanner('RARE CHANCE!!', '？？？', 'rare');
  burstFromBanner(60);
  return true;
}

/**
 * 「近く」は地域が1つしかないため、地域抽選を飛ばして都道府県抽選から始める
 * @param {number} token
 */
async function startNearDraw(token) {
  if (isRareMode()) {
    setPhase('regionStopping', '抽選中…', 'ドキドキ…', 'wait');
    if (!(await playRareReveal(token))) return;
    await wait(900);
    if (!alive(token)) return;
  }
  startPrefSpin();
}

/* ------------------------------------------------------------------ STEP 2: 地域決定 */

async function stopRegion() {
  const result = /** @type {DrawResult} */ (state.result);
  const token = state.token;
  clearInterval(state.timer);
  sound.press();
  setPhase('regionStopping', '抽選中…', 'ドキドキ…', 'wait');

  const regions = result.candidateRegions;
  const rare = result.effect !== 'normal';
  /** @type {string | null} */
  let lit = null;
  for (let i = 0; i < STOP_DELAYS.length; i++) {
    const last = i === STOP_DELAYS.length - 1;
    if (last && !rare) lit = result.regionId;
    else if (i === STOP_DELAYS.length - 2 && regions.length > 1) {
      lit = pickOther(regions.filter((r) => r !== result.regionId), lit);
    } else lit = regions.length === 1 ? (lit ? null : regions[0]) : pickOther(regions, lit);
    map.lightRegion(lit);
    setBanner('ROULETTE', lit ? regionById.get(/** @type {any} */ (lit))?.name ?? '' : '', 'spin');
    sound.tick(i);
    await wait(STOP_DELAYS[i]);
    if (!alive(token)) return;
  }

  if (rare) {
    if (!(await playRareReveal(token))) return;
  } else {
    sound.stop();
    setBanner('行き先の地域は…', regionById.get(result.regionId)?.name ?? '', 'pop');
  }

  setPhase('regionDone', '都道府県を決める', rare ? 'まさかの激レア演出!? 都道府県を決めよう！' : '次は都道府県ルーレット！', 'go');
}

/* ------------------------------------------------------------------ STEP 3: 都道府県ルーレット */

function startPrefSpin() {
  const result = /** @type {DrawResult} */ (state.result);
  sound.press();

  if (isRareMode()) {
    // レア演出中は日本全体を光らせたまま、地域を悟られないようにする
    state.pool = PREFECTURES.filter((p) => result.candidateRegions.includes(p.region)).map((p) => p.id);
  } else {
    state.pool = map.prefsIn(result.regionId);
    map.setCandidates(new Set(state.pool));
    map.lightRegion(null);
    map.zoomToRegion(result.regionId);
    map.showLabels(state.pool);
  }

  setPhase('prefSpin', '行き先を決める', 'ボタンを押して都道府県をストップ！', 'stop');
  /** @type {number | null} */
  let lit = null;
  let n = 0;
  const tick = () => {
    lit = pickOther(state.pool, lit);
    map.lightPref(lit);
    const name = prefById.get(/** @type {number} */ (lit))?.name ?? '';
    setBanner(isRareMode() ? '？？？' : 'ROULETTE', name, 'spin');
    sound.tick(n++);
  };
  tick();
  state.timer = window.setInterval(tick, SPIN_MS);
}

/* ------------------------------------------------------------------ STEP 4: 行き先決定 */

async function stopPref() {
  const result = /** @type {DrawResult} */ (state.result);
  const token = state.token;
  clearInterval(state.timer);
  sound.press();
  setPhase('prefStopping', '抽選中…', 'ドキドキ…', 'wait');

  /** @type {number | null} */
  let lit = null;
  for (let i = 0; i < STOP_DELAYS.length; i++) {
    if (i === STOP_DELAYS.length - 1) lit = result.prefId;
    else if (i === STOP_DELAYS.length - 2) lit = pickOther(state.pool.filter((id) => id !== result.prefId), lit);
    else lit = pickOther(state.pool, lit);
    map.lightPref(lit);
    setBanner(isRareMode() ? '？？？' : 'ROULETTE', prefById.get(/** @type {number} */ (lit))?.name ?? '', 'spin');
    sound.tick(i);
    await wait(STOP_DELAYS[i] + (i > 8 ? 60 : 0));
    if (!alive(token)) return;
  }

  const pref = /** @type {Prefecture} */ (prefById.get(result.prefId));
  const jackpot = result.effect === 'rare' && SPECIAL_PREF_IDS.includes(pref.id);

  if (isRareMode()) {
    // 虹色を解除して、決定した地域の都道府県だけを残す
    map.setRare(false);
    els.frame.classList.remove('is-rare');
    map.setCandidates(new Set(map.prefsIn(result.regionId)));
  }
  map.zoomToResult(pref.id);
  map.lightPref(null);
  map.pickPref(pref.id);
  els.frame.classList.add('is-win');
  flash(jackpot ? 'is-rainbow' : '');
  sound.fanfare(jackpot);
  setBanner(jackpot ? '★ 超激レア 大当たり ★' : '行き先決定！', pref.name, jackpot ? 'rare' : 'win');
  burstFromBanner(jackpot ? 260 : 130);
  if (jackpot) setTimeout(() => alive(token) && burstFromBanner(160), 600);

  setPhase('done', 'もう一度引く', 'いってらっしゃい！', 'go');

  await wait(900);
  if (!alive(token)) return;
  showResult(pref, jackpot);
}

/* ------------------------------------------------------------------ STEP 5: 結果 */

/** @param {HTMLElement} host @param {string[]} items */
function fillTags(host, items) {
  host.replaceChildren(...items.map((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    return li;
  }));
}

/** @param {Prefecture} pref @param {boolean} jackpot */
function showResult(pref, jackpot) {
  els.resultName.textContent = pref.name;
  els.resultRegion.textContent = `${regionById.get(pref.region)?.name ?? ''}地方`;
  els.resultCatch.textContent = pref.catch;
  fillTags(els.resultSpots, pref.spots.slice(0, 3).map((e) => e[0]));
  fillTags(els.resultOnsen, pref.onsen.slice(0, 2).map((e) => e[0]));
  fillTags(els.resultFoods, pref.foods.slice(0, 3).map((e) => e[0]));
  els.resultBadge.hidden = !SPECIAL_PREF_IDS.includes(pref.id);
  els.resultBadge.textContent = jackpot ? '激レア' : 'SSR';
  els.ticketFrom.textContent = RESIDENCES.find((r) => r.id === currentSettings().residence)?.name ?? '';
  els.ticketNo.textContent = `No.${String(Math.floor(secureRandom() * 1e6)).padStart(6, '0')}`;
  const d = new Date();
  els.ticketDate.textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} 発行`;
  els.result.classList.toggle('is-jackpot', jackpot);
  els.result.hidden = false;
  if (innerWidth < 960) els.result.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

/** @param {string} title @param {import('./data.js').Entry[]} rows @param {string} prefName */
function detailTable(title, rows, prefName) {
  const section = document.createElement('section');
  section.className = 'detail-section';
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = title;
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const h of ['名称', 'ひとこと', '']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  for (const [name, desc] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = name;
    const td = document.createElement('td');
    td.textContent = desc;
    const tdLink = document.createElement('td');
    const a = document.createElement('a');
    a.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${prefName} ${name}`)}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'map-link';
    a.textContent = '地図';
    a.setAttribute('aria-label', `${name}をGoogleマップで見る`);
    tdLink.append(a);
    tr.append(th, td, tdLink);
    tbody.append(tr);
  }
  table.append(caption, thead, tbody);
  section.append(table);
  return section;
}

function openDetail() {
  const result = state.result;
  if (!result) return;
  const pref = /** @type {Prefecture} */ (prefById.get(result.prefId));
  els.detailRegion.textContent = `${regionById.get(pref.region)?.name ?? ''}地方`;
  els.detailTitle.textContent = pref.name;
  els.detailCatch.textContent = pref.catch;

  const info = document.createElement('dl');
  info.className = 'detail-info';
  /** @type {[string, string][]} */
  const facts = [['おすすめシーズン', pref.season], ['定番のお土産', pref.souvenirs.join('・')]];
  for (const [k, v] of facts) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    info.append(dt, dd);
  }
  els.detailBody.replaceChildren(
    info,
    detailTable('観光地', pref.spots, pref.name),
    detailTable('温泉', pref.onsen, pref.name),
    detailTable('郷土料理・名物', pref.foods, pref.name),
  );
  els.detail.showModal();
}

/* ------------------------------------------------------------------ reset */

function reset() {
  state.token++;
  clearInterval(state.timer);
  state.result = null;
  map.reset();
  els.frame.classList.remove('is-rare', 'is-charging', 'is-win');
  els.result.hidden = true;
  els.settings.toggleAttribute('inert', false);
  els.settings.classList.remove('is-locked');
  setBanner('', '');
  setPhase('idle', '旅先を決める', '条件を選んで、ガチャを回そう！', 'go');
}

/* ------------------------------------------------------------------ events */

els.action.addEventListener('click', () => {
  switch (state.phase) {
    case 'idle': return startRegionSpin();
    case 'regionSpin': return void stopRegion();
    case 'regionDone': return startPrefSpin();
    case 'prefSpin': return void stopPref();
    case 'done': return playAgain();
    default: return undefined;
  }
});

/** 条件を選び直せるよう、いったん待機状態に戻す */
function playAgain() {
  reset();
  if (innerWidth < 960) els.settings.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
}
els.againBtn.addEventListener('click', playAgain);
els.detailBtn.addEventListener('click', openDetail);
els.detailClose.addEventListener('click', () => els.detail.close());
els.detail.addEventListener('click', (e) => { if (e.target === els.detail) els.detail.close(); });

function syncMute() {
  els.mute.setAttribute('aria-pressed', String(sound.muted));
  els.mute.setAttribute('aria-label', sound.muted ? '効果音オン' : '効果音オフ');
}
els.mute.addEventListener('click', () => { sound.setMuted(!sound.muted); syncMute(); });
syncMute();

// 開発・検証用：確率の簡易シミュレーション（コンソールで tabiGachaSimulate() を実行）
Object.assign(window, {
  tabiGachaSimulate(n = 100000, residence = 'kanto', distance = 'random') {
    /** @type {Record<string, number>} */
    const counts = { normal: 0, rare: 0, fakeRare: 0 };
    for (let i = 0; i < n; i++) counts[draw(residence, /** @type {any} */ (distance), secureRandom).effect]++;
    return counts;
  },
});

reset();
