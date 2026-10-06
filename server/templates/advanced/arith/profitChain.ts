/** 심화(신규): 원가 → 정가(이익률) → 일부는 정가, 나머지는 할인가로 판매 → 전체 이익률 또는 전체 이익금 */
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
  difficulty: 2,
  generate(rng): Generated {
    const item = rng.pick(ITEMS);
    const askRate = rng.chance(0.5);
    const p = search(rng, 4000, (r) => {
      const C = r.int(2, 20) * 1000, mk = r.pick(MARKUPS), dc = r.pick(DISCOUNTS);
      const Q = r.int(4, 20) * 10, q1 = r.int(1, Q / 10 - 1) * 10, q2 = Q - q1;
      if (q1 === q2) return null;
      const list = (C * (100 + mk)) / 100;
      const sale = (list * (100 - dc)) / 100;
      if (!Number.isInteger(list) || !Number.isInteger(sale) || sale <= C) return null;
      const rev = q1 * list + q2 * sale, cost = Q * C, profit = rev - cost;
      const rate = (profit / cost) * 100;
      if (!clean1(rate)) return null;
      // 흔한 실수로 계산한 할인 판매분 1개의 이익
      const saleOnCost = list - (C * dc) / 100; // 할인액을 원가 기준으로 계산
      const simpleUnit = (C * (mk - dc)) / 100; // 할인 판매분 이익률을 mk − dc%로 계산
      const wrongs = askRate
        ? [
            { value: r1((mk + ((sale - C) / C) * 100) / 2), mistakeTag: '산술평균 착각' as const },
            { value: r1(((q1 * list + q2 * saleOnCost - cost) / cost) * 100), mistakeTag: '기준량 혼동' as const },
            { value: r1((profit / (Q * list)) * 100), mistakeTag: '기준량 혼동' as const },
            { value: r1((q1 * mk + q2 * (mk - dc)) / Q), mistakeTag: '퍼센트 단순 합산' as const },
            { value: mk, mistakeTag: '조건 누락' as const },
          ]
        : [
            { value: ((list - C + (sale - C)) / 2) * Q, mistakeTag: '산술평균 착각' as const },
            { value: q1 * (list - C) + q2 * (saleOnCost - C), mistakeTag: '기준량 혼동' as const },
            { value: q1 * (list - C) + q2 * simpleUnit, mistakeTag: '퍼센트 단순 합산' as const },
            { value: Q * (list - C), mistakeTag: '조건 누락' as const },
            { value: rev, mistakeTag: '구하는 대상 혼동' as const },
          ];
      if (!askRate && wrongs.some((w) => !Number.isInteger(w.value))) return null;
      if (!distinctWrongs(askRate ? rate : profit, wrongs)) return null;
      return { C, mk, dc, Q, q1, q2, list, sale, rev, cost, profit, rate, wrongs };
    });
    const { C, mk, dc, Q, q1, q2, list, sale, rev, cost, profit, rate, wrongs } = p;
    const ask = askRate ? '전체 원가에 대한 이익률은 몇 %인가?' : '전체 이익금은 얼마인가?';
    const text = rng.pick([
      `원가가 ${won(C)}인 ${item} ${Q}개에 원가의 ${mk}%만큼 이익을 붙여 정가를 정했다. 이 중 ${q1}개는 정가에 팔고, 나머지 ${q2}개는 정가에서 ${dc}% 할인해 모두 팔았다. ${ask}`,
      `${item} ${Q}개를 개당 ${won(C)}에 들여와 정가를 원가보다 ${mk}% 높게 매겼다. ${q1}개는 정가대로 팔렸고, 남은 ${q2}개는 정가의 ${dc}%를 할인해 팔았다. ${ask}`,
      `개당 원가 ${won(C)}, 정가는 원가의 ${100 + mk}%인 ${eulReul(item)} ${Q}개 판매했다. ${q1}개는 정가로, ${q2}개는 정가에서 ${dc}% 할인한 값으로 팔았을 때 ${ask}`,
    ]);
    const common = [
      `정가 = ${won(C)} × ${100 + mk}/100 = ${won(list)}`,
      `할인가 = ${won(list)} × ${100 - dc}/100 = ${won(sale)}`,
      `판매액 = ${num(list)} × ${q1} + ${num(sale)} × ${q2} = ${num(q1 * list)} + ${num(q2 * sale)} = ${won(rev)}`,
      `전체 원가 = ${num(C)} × ${Q} = ${won(cost)}`,
      `이익 = ${num(rev)} − ${num(cost)} = ${won(profit)}`,
    ];
    return {
      text,
      answer: askRate ? rate : profit,
      wrongs,
      format: askRate ? (v) => `${num(v)}%` : won,
      near: askRate ? nearBy(rate, 1) : nearBy(profit, 1000),
      steps: askRate
        ? [
            ...common,
            `이익률 = ${num(profit)} ÷ ${num(cost)} × 100 = ${num(rate)}%`,
            `정가 판매분과 할인 판매분의 이익률을 단순히 평균하면 팔린 개수(${q1}개, ${q2}개)의 차이를 무시하게 돼요.`,
          ]
        : [...common, `할인은 원가가 아니라 정가를 기준으로 계산해요. 정가로 판 ${q1}개와 할인해 판 ${q2}개를 따로 계산해서 더해야 해요.`],
    };
  },
};
