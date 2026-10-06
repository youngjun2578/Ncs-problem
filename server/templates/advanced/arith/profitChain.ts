/** 심화(신규): 원가 → 정가(이익률) → 할인 → 실제 이익률, 또는 실제 이익으로 원가 역산 */
import type { Template, Generated } from '../../../engine/types.js';
import { num, won } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { search, clean1, r1, distinctWrongs } from '../util.js';
import { eulReul } from '../../common.js';

const MARKUPS = [20, 25, 30, 40, 50, 60];
const DISCOUNTS = [10, 15, 20, 25, 30];
const ITEMS = ['가방', '전자 제품', '사무용 의자', '운동화', '도서 세트'];

export const profitChain: Template = {
  id: 'adv.arith.profitChain',
  area: 'arith',
  subtype: '정가·할인 후 이익률',
  difficulty: 1,
  generate(rng): Generated {
    const item = rng.pick(ITEMS);
    const askRate = rng.chance(0.5);
    const p = search(rng, 4000, (r) => {
      const C = r.int(2, 20) * 5000, mk = r.pick(MARKUPS), dc = r.pick(DISCOUNTS);
      const list = (C * (100 + mk)) / 100;
      const sale = (list * (100 - dc)) / 100;
      if (!Number.isInteger(list) || !Number.isInteger(sale) || sale <= C) return null;
      const profit = sale - C;
      const rate = (profit / C) * 100;
      if (!clean1(rate)) return null;
      const ans = askRate ? rate : C;
      const wrongs = askRate
        ? [
            { value: mk - dc, mistakeTag: '퍼센트 단순 합산' as const },
            { value: r1((profit / sale) * 100), mistakeTag: '기준량 혼동' as const },
            { value: mk, mistakeTag: '조건 누락' as const },
            { value: r1((profit / list) * 100), mistakeTag: '기준량 혼동' as const },
          ]
        : [
            { value: (profit * 100) / (mk - dc), mistakeTag: '퍼센트 단순 합산' as const },
            { value: sale, mistakeTag: '구하는 대상 혼동' as const },
            { value: list, mistakeTag: '구하는 대상 혼동' as const },
            { value: (profit * 100) / mk, mistakeTag: '조건 누락' as const },
          ];
      if (!askRate && wrongs.some((w) => !Number.isInteger(w.value))) return null;
      if (!distinctWrongs(ans, wrongs)) return null;
      return { C, mk, dc, list, sale, profit, rate, ans, wrongs };
    });
    const { C, mk, dc, list, sale, profit, rate, ans, wrongs } = p;
    const text = askRate
      ? rng.pick([
          `원가가 ${won(C)}인 ${item}에 원가의 ${mk}%만큼 이익을 붙여 정가를 정했다. 이 정가에서 ${dc}%를 할인해 팔았다면, 원가에 대한 실제 이익률은 몇 %인가?`,
          `${item}의 정가를 원가보다 ${mk}% 높게 정했다가 정가의 ${dc}%를 할인해 판매했다. 원가가 ${won(C)}일 때 원가 대비 이익률을 구하면?`,
          `원가 ${won(C)}, 정가는 원가의 ${100 + mk}%, 판매가는 정가에서 ${dc}% 할인한 값이다. 이 ${item}의 원가 대비 이익률은?`,
        ])
      : rng.pick([
          `어떤 ${item}에 원가의 ${mk}%만큼 이익을 붙여 정가를 정하고, 정가의 ${dc}%를 할인해 팔았더니 ${won(profit)}의 이익이 남았다. 이 ${item}의 원가는 얼마인가?`,
          `정가를 원가보다 ${mk}% 높게 매긴 ${eulReul(item)} 정가에서 ${dc}% 할인해 팔아 ${won(profit)}을 남겼다. 원가를 구하면?`,
          `${item} 하나를 팔 때 정가는 원가의 ${100 + mk}%, 판매가는 정가의 ${100 - dc}%이며 이익은 ${won(profit)}이다. 원가는?`,
        ]);
    return {
      text,
      answer: ans,
      wrongs,
      format: askRate ? (v) => `${num(v)}%` : won,
      near: askRate ? nearBy(ans, 1) : nearBy(ans, 1000),
      steps: askRate
        ? [
            `정가 = ${won(C)} × ${100 + mk}/100 = ${won(list)}`,
            `판매가 = ${won(list)} × ${100 - dc}/100 = ${won(sale)}`,
            `이익 = ${won(sale)} − ${won(C)} = ${won(profit)}`,
            `이익률 = ${num(profit)} ÷ ${num(C)} × 100 = ${num(rate)}%`,
            `${mk}% − ${dc}%처럼 비율을 바로 빼면 기준(원가와 정가)이 달라서 틀려요.`,
          ]
        : [
            `원가를 x라 하면 판매가 = x × ${100 + mk}/100 × ${100 - dc}/100 = ${num(sale / C)}x`,
            `이익 = ${num(sale / C)}x − x = ${num((sale - C) / C)}x = ${num(profit)}`,
            `x = ${num(profit)} ÷ ${num((sale - C) / C)} = ${won(C)}`,
          ],
    };
  },
};
