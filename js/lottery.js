// @ts-check
import { PREFECTURES, REGIONS, RESIDENCES, SPECIAL_PREF_IDS } from './data.js';

/** @typedef {import('./data.js').RegionId} RegionId */
/** @typedef {'random'|'near'|'far'} Distance */
/** @typedef {'normal'|'rare'|'fakeRare'} Effect */
/**
 * @typedef {Object} DrawResult
 * @property {number} prefId
 * @property {RegionId} regionId
 * @property {Effect} effect         rare: 本物のレア演出 / fakeRare: ダミーレア演出
 * @property {RegionId[]} candidateRegions  ルーレットで光らせる地域
 */

export const RARE_RATE = 2 / 3;
export const FAKE_RARE_RATE = 1 / 5;

/** crypto ベースの一様乱数 [0, 1) */
export function secureRandom() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/**
 * @template T
 * @param {T[]} list
 * @param {() => number} rng
 * @returns {T}
 */
export function pick(list, rng = secureRandom) {
  return list[Math.floor(rng() * list.length)];
}

/** 北海道・東京・大阪・沖縄を含む地域 */
const SPECIAL_REGIONS = new Set(
  PREFECTURES.filter((p) => SPECIAL_PREF_IDS.includes(p.id)).map((p) => p.region),
);

/**
 * 居住地と距離から抽選対象の地域を返す
 * @param {string} residenceId
 * @param {Distance} distance
 * @returns {RegionId[]}
 */
export function candidateRegions(residenceId, distance) {
  const home = RESIDENCES.find((r) => r.id === residenceId);
  if (!home) throw new Error(`unknown residence: ${residenceId}`);
  const all = REGIONS.map((r) => r.id);
  if (distance === 'near') return [home.region];
  if (distance === 'far') return all.filter((id) => id !== home.region);
  return all;
}

/**
 * 「旅先を決める」押下時点で都道府県まで内部決定する。
 * 対象都道府県から一様に抽選し、その後に演出を決める。
 * @param {string} residenceId
 * @param {Distance} distance
 * @param {() => number} [rng]
 * @returns {DrawResult}
 */
export function draw(residenceId, distance, rng = secureRandom) {
  const regions = candidateRegions(residenceId, distance);
  const pool = PREFECTURES.filter((p) => regions.includes(p.region));
  const pref = pick(pool, rng);

  /** @type {Effect} */
  let effect = 'normal';
  if (distance === 'near') {
    // 「近く」は地域抽選を行わないため、レア演出なし
  } else if (SPECIAL_PREF_IDS.includes(pref.id)) {
    if (rng() < RARE_RATE) effect = 'rare';
  } else if (SPECIAL_REGIONS.has(pref.region)) {
    if (rng() < FAKE_RARE_RATE) effect = 'fakeRare';
  }

  return { prefId: pref.id, regionId: pref.region, effect, candidateRegions: regions };
}
