import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num, won } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { ieyo } from '../common.js';

/** 원가 c, 이익률 p%, 할인율 d% — 정가·판매가가 원 단위로 떨어지는 조합 */
function pickDeal(rng: Rng) {
  for (let i = 0; i < 500; i++) {
    const c = rng.int(4, 16) * 5000, p = rng.pick([20, 25, 30, 40, 50, 60]), d = rng.pick([10, 15, 20, 25, 30]);
    const list = (c * (100 + p)) / 100;
    const sell = (list * (100 - d)) / 100;
    if (!Number.isInteger(list) || !Number.isInteger(sell) || sell <= c) continue;
    if (sell % 100 !== 0) continue;
    return { c, p, d, list, sell };
  }
  return { c: 40000, p: 30, d: 20, list: 52000, sell: 41600 };
}

function profitAmount(rng: Rng): Generated {
  const { c, p, d, list, sell } = pickDeal(rng);
  const ans = sell - c;
  return {
    text: rng.pick([
      `원가가 ${won(c)}인 상품에 ${p}%의 이익을 붙여 정가를 정했다. 이 상품을 정가에서 ${d}% 할인하여 판매했을 때, 개당 이익은 얼마인가?`,
      `한 매장은 원가 ${won(c)}짜리 물건의 정가를 원가보다 ${p}% 높게 매겼다. 할인 행사에서 정가의 ${d}%를 깎아 팔았다면 한 개를 팔 때 남는 이익은 얼마인가?`,
    ]),
    answer: ans,
    wrongs: [
      { value: (c * (p - d)) / 100, mistakeTag: '퍼센트 단순 합산' },
      { value: (c * p) / 100, mistakeTag: '조건 누락' },
      { value: sell, mistakeTag: '구하는 대상 혼동' },
      { value: (list * d) / 100, mistakeTag: '구하는 대상 혼동' },
    ],
    format: won,
    near: nearBy(ans, Math.max(100, Math.round((ans * 0.1) / 100) * 100)),
    steps: [
      `정가 = ${won(c)} × (1 + ${p}/100) = ${won(list)}`,
      `판매가 = ${won(list)} × (1 − ${d}/100) = ${won(sell)}`,
      `이익 = ${won(sell)} − ${won(c)} = ${won(ans)}`,
      `이익률에서 할인율을 그대로 빼는 계산(${p}−${d}=${p - d}%)은 기준이 달라서 틀려요. 이익률은 원가, 할인율은 정가가 기준이에요.`,
    ],
  };
}

function costBack(rng: Rng): Generated {
  const { c, p, d, list, sell } = pickDeal(rng);
  const r100 = (v: number) => Math.round(v / 100) * 100;
  return {
    text: rng.pick([
      `어떤 상품에 원가의 ${p}%만큼 이익을 붙여 정가를 정하고, 정가에서 ${d}% 할인하여 ${won(sell)}에 팔았다. 이 상품의 원가는 얼마인가?`,
      `정가를 원가보다 ${p}% 높게 정한 제품을 ${d}% 할인된 ${won(sell)}에 판매했다. 이 제품의 원가는 얼마인가?`,
    ]),
    answer: c,
    wrongs: [
      { value: list, mistakeTag: '구하는 대상 혼동' },
      { value: r100(sell / (1 + p / 100)), mistakeTag: '조건 누락' },
      { value: r100(sell / (1 + (p - d) / 100)), mistakeTag: '퍼센트 단순 합산' },
      { value: r100(sell * (1 - (p - d) / 100)), mistakeTag: '기준량 혼동' },
    ],
    format: won,
    near: nearBy(c, 1000),
    steps: [
      `원가를 x라 하면 정가 = x × ${num(1 + p / 100)}, 판매가 = x × ${num(1 + p / 100)} × ${num(1 - d / 100)}`,
      `x × ${num(((100 + p) * (100 - d)) / 10000)} = ${won(sell)}`,
      `x = ${won(sell)} ÷ ${num(((100 + p) * (100 - d)) / 10000)} = ${won(c)}`,
    ],
  };
}

function profitRate(rng: Rng): Generated {
  const [p, d] = rng.pick([[50, 20], [40, 25], [30, 10], [60, 25], [50, 10], [20, 10], [40, 10], [60, 20], [25, 12]]);
  const ans = ((100 + p) * (100 - d)) / 100 - 100;
  return {
    text: rng.pick([
      `원가에 ${p}%의 이익을 붙여 정가를 매긴 상품을 정가의 ${d}%만큼 할인해 팔았다. 원가 대비 이익률은 몇 %인가?`,
      `정가가 원가보다 ${p}% 높은 상품을 정가에서 ${d}% 내린 가격에 판매하면, 원가 대비 몇 %의 이익이 남는가?`,
    ]),
    answer: ans,
    wrongs: [
      { value: p - d, mistakeTag: '퍼센트 단순 합산' },
      { value: p, mistakeTag: '조건 누락' },
      { value: ans + 100, mistakeTag: '비율·증가율 혼동' },
      { value: d, mistakeTag: '구하는 대상 혼동' },
    ],
    format: (v) => `${num(v)}%`,
    near: nearBy(ans, 1),
    steps: [
      `원가를 100이라 하면 정가는 ${ieyo(String(100 + p))}.`,
      `판매가 = ${100 + p} × (1 − ${d}/100) = ${num(ans + 100)}`,
      `이익률 = (${num(ans + 100)} − 100) ÷ 100 × 100 = ${num(ans)}%`,
    ],
  };
}

export const profit: Template = {
  id: 'arith.profit',
  area: 'arith',
  subtype: '할인·이익',
  difficulty: 2,
  generate: (rng) => rng.pick([profitAmount, costBack, profitRate])(rng),
};
