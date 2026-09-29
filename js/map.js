// @ts-check
import { MAP_SIZE, OKINAWA_BOX, PREF_SHAPES } from './map-data.js';
import { PREFECTURES, REGIONS } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const FULL = /** @type {Box} */ ([0, 0, MAP_SIZE.width, MAP_SIZE.height]);

/** @typedef {[x0: number, y0: number, x1: number, y1: number]} Box */

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 */
function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 表示用の短い名前（東京都→東京） */
export function shortName(/** @type {string} */ name) {
  return name === '北海道' ? name : name.replace(/[都府県]$/, '');
}

/**
 * SVG の日本地図を生成し、光らせる・ズームするための API を返す。
 * @param {HTMLElement} host
 */
export function createJapanMap(host) {
  const svg = /** @type {SVGSVGElement} */ (el('svg', {
    viewBox: FULL.join(' '),
    role: 'img',
    'aria-label': '日本地図',
    class: 'japan-map',
    preserveAspectRatio: 'xMidYMid meet',
  }));

  const defs = el('defs');
  // レア演出用：流れる虹色グラデーション
  const rainbow = el('linearGradient', {
    id: 'rainbow', gradientUnits: 'userSpaceOnUse',
    x1: 0, y1: 0, x2: MAP_SIZE.width / 2, y2: MAP_SIZE.height / 3, spreadMethod: 'repeat',
  });
  ['#ff5fa2', '#ffb547', '#fff27a', '#7dff8a', '#4fc3ff', '#b98cff', '#ff5fa2'].forEach((c, i, arr) => {
    rainbow.appendChild(el('stop', { offset: i / (arr.length - 1), 'stop-color': c }));
  });
  rainbow.appendChild(el('animateTransform', {
    attributeName: 'gradientTransform', type: 'translate',
    from: '0 0', to: `${MAP_SIZE.width / 2} ${MAP_SIZE.height / 3}`, dur: '2.4s', repeatCount: 'indefinite',
  }));
  defs.appendChild(rainbow);
  svg.appendChild(defs);

  const frame = el('rect', {
    class: 'oki-frame', x: OKINAWA_BOX[0], y: OKINAWA_BOX[1],
    width: OKINAWA_BOX[2] - OKINAWA_BOX[0], height: OKINAWA_BOX[3] - OKINAWA_BOX[1], rx: 10,
  });
  svg.appendChild(frame);

  const group = el('g', { class: 'prefs' });
  const labels = el('g', { class: 'labels', 'aria-hidden': 'true' });
  svg.append(group, labels);

  const regionColor = new Map(REGIONS.map((r) => [r.id, r.color]));
  /** @type {Map<number, SVGPathElement>} */
  const paths = new Map();
  /** @type {Map<number, SVGTextElement>} */
  const texts = new Map();
  /** @type {Map<number, import('./map-data.js').PrefShape>} */
  const shapes = new Map(PREF_SHAPES.map((s) => [s.id, s]));

  for (const pref of PREFECTURES) {
    const shape = shapes.get(pref.id);
    if (!shape) continue;
    const path = /** @type {SVGPathElement} */ (el('path', { d: shape.d, class: 'pref' }));
    path.dataset.id = String(pref.id);
    path.dataset.region = pref.region;
    path.style.setProperty('--c', regionColor.get(pref.region) ?? '#fff');
    group.appendChild(path);
    paths.set(pref.id, path);

    const text = /** @type {SVGTextElement} */ (el('text', { x: shape.cx, y: shape.cy, class: 'label' }));
    text.textContent = shortName(pref.name);
    labels.appendChild(text);
    texts.set(pref.id, text);
  }
  host.appendChild(svg);

  const prefsIn = (/** @type {string} */ regionId) =>
    PREFECTURES.filter((p) => p.region === regionId).map((p) => p.id);

  /** @param {number[]} ids */
  function bboxOf(ids) {
    /** @type {Box} */
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of ids) {
      const s = shapes.get(id);
      if (!s) continue;
      b[0] = Math.min(b[0], s.bbox[0]); b[1] = Math.min(b[1], s.bbox[1]);
      b[2] = Math.max(b[2], s.bbox[2]); b[3] = Math.max(b[3], s.bbox[3]);
    }
    return b;
  }

  /** 光っている要素を最前面へ（グローが隣県に隠れないように） */
  function raise(/** @type {SVGPathElement} */ p) { group.appendChild(p); }

  /** 現在の viewBox [x, y, w, h]（FULL は原点0なので同値） */
  let current = /** @type {Box} */ ([...FULL]);
  let zoomRaf = 0;

  const api = {
    svg,
    /** すべての状態をリセット */
    reset() {
      svg.classList.remove('is-rare', 'is-zoomed');
      for (const p of paths.values()) p.classList.remove('is-lit', 'is-out', 'is-picked');
      for (const t of texts.values()) t.classList.remove('is-shown', 'is-picked');
      frame.classList.remove('is-out');
      api.zoomTo(FULL, 0);
    },
    /** 抽選対象外の都道府県を暗くする */
    setCandidates(/** @type {Set<number>} */ ids) {
      for (const [id, p] of paths) p.classList.toggle('is-out', !ids.has(id));
      frame.classList.toggle('is-out', !ids.has(47));
    },
    /** 指定地域だけを光らせる（null で消灯） */
    lightRegion(/** @type {string|null} */ regionId) {
      for (const p of paths.values()) {
        const on = p.dataset.region === regionId;
        p.classList.toggle('is-lit', on);
        if (on) raise(p);
      }
    },
    /** 指定都道府県だけを光らせる（null で消灯） */
    lightPref(/** @type {number|null} */ id) {
      for (const [pid, p] of paths) {
        const on = pid === id;
        p.classList.toggle('is-lit', on);
        if (on) raise(p);
      }
    },
    /** 確定演出 */
    pickPref(/** @type {number} */ id) {
      const p = paths.get(id);
      if (!p) return;
      p.classList.add('is-picked');
      raise(p);
      texts.get(id)?.classList.add('is-shown', 'is-picked');
    },
    /** 日本全体を虹色に光らせるレア演出 */
    setRare(/** @type {boolean} */ on) { svg.classList.toggle('is-rare', on); },
    /** 地名ラベルを表示 */
    showLabels(/** @type {number[]} */ ids) {
      const set = new Set(ids);
      for (const [id, t] of texts) t.classList.toggle('is-shown', set.has(id));
    },
    prefsIn,
    bboxOf,
    /** 地域にズーム */
    zoomToRegion(/** @type {string} */ regionId, duration = 800) {
      api.zoomTo(bboxOf(prefsIn(regionId)), duration, 40);
    },
    zoomToAll(duration = 800) { api.zoomTo(FULL, duration); },
    /**
     * viewBox をアニメーションで移動
     * @param {Box} target
     * @param {number} duration
     * @param {number} [pad]
     */
    zoomTo(target, duration, pad = 0) {
      cancelAnimationFrame(zoomRaf);
      // ホストのアスペクト比に合わせて余白を足す
      const rect = host.getBoundingClientRect();
      const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : MAP_SIZE.width / MAP_SIZE.height;
      let [x0, y0, x1, y1] = [target[0] - pad, target[1] - pad, target[2] + pad, target[3] + pad];
      let w = x1 - x0, h = y1 - y0;
      if (w / h > aspect) { const nh = w / aspect; y0 -= (nh - h) / 2; h = nh; }
      else { const nw = h * aspect; x0 -= (nw - w) / 2; w = nw; }
      /** @type {Box} */
      const to = [x0, y0, w, h];
      const from = /** @type {Box} */ ([...current]);
      const isFull = target === FULL;
      svg.classList.toggle('is-zoomed', !isFull);
      labels.style.setProperty('--fs', String(Math.max(11, w / 34)));
      const apply = (/** @type {Box} */ b) => {
        svg.setAttribute('viewBox', b.map((n) => n.toFixed(1)).join(' '));
        current = b;
      };
      if (duration <= 0) { apply(to); return; }
      const t0 = performance.now();
      const ease = (/** @type {number} */ t) => 1 - Math.pow(1 - t, 3);
      const step = (/** @type {number} */ now) => {
        const t = Math.min(1, (now - t0) / duration);
        const k = ease(t);
        apply(/** @type {Box} */ (from.map((v, i) => v + (to[i] - v) * k)));
        if (t < 1) zoomRaf = requestAnimationFrame(step);
      };
      zoomRaf = requestAnimationFrame(step);
    },
  };
  return api;
}
