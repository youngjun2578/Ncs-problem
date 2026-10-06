/** 심화(기존 확장): 2년 연속 증감률로 처음 값 역산, 또는 2년 동안의 증가율 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { METRICS, years } from '../../chart-read/data.js';
import { search, clean1, r1, distinctWrongs, signed } from '../util.js';
import { eunNeun, eulReul, iGa, gwaWa } from '../../common.js';

const STARTS = [200, 400, 500, 600, 800, 1000, 1200, 1600, 2000];
const RATES = [-20, -10, 10, 20, 25, 30, 40, 50];

export const rateChain: Template = {
  id: 'adv.chartRead.rateChain',
  area: 'chartRead',
  subtype: '연속 증감률 역산',
  difficulty: 2,
  generate(rng): Generated {
    const m = rng.pick(METRICS);
    const ys = years(rng, 3);
    const back = rng.chance(0.5);
    const p = search(rng, 3000, (r) => {
      const v1 = r.pick(STARTS), r2 = r.pick(RATES), r3 = r.pick(RATES);
      if (r2 === r3) return null;
      const v2 = (v1 * (100 + r2)) / 100, v3 = (v2 * (100 + r3)) / 100;
      if (!Number.isInteger(v2) || !Number.isInteger(v3)) return null;
      const total = ((v3 - v1) / v1) * 100;
      if (!back && (!clean1(total) || total <= 0)) return null;
      const ans = back ? v1 : total;
      const wrongs = back
        ? [
            { value: r1((v3 * (100 - r2 - r3)) / 100), mistakeTag: '퍼센트 단순 합산' as const },
            { value: r1((v3 * 100) / (100 + r3)), mistakeTag: '한 구간만 반영' as const },
            { value: r1((v3 * (100 - r2) * (100 - r3)) / 10000), mistakeTag: '기준량 혼동' as const },
            { value: r1((v3 * 100) / (100 + r2 + r3)), mistakeTag: '퍼센트 단순 합산' as const },
          ]
        : [
            { value: r2 + r3, mistakeTag: '퍼센트 단순 합산' as const },
            { value: r1((r2 + r3) / 2), mistakeTag: '산술평균 착각' as const },
            { value: r1(((v3 - v1) / v3) * 100), mistakeTag: '기준량 혼동' as const },
            { value: r3, mistakeTag: '한 구간만 반영' as const },
            { value: r1((v3 / v1) * 100), mistakeTag: '비율·증가율 혼동' as const },
          ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { v1, v2, v3, r2, r3, total, ans, wrongs };
    });
    const { v1, v2, v3, r2, r3, ans, wrongs } = p;
    const table = back
      ? {
          caption: `${m.who} ${gwaWa(m.what)} 전년 대비 증감률`,
          head: ['구분', `${ys[0]}년`, `${ys[1]}년`, `${ys[2]}년`],
          rows: [
            [`${m.what}(${m.unit})`, '?', '-', v3],
            ['증감률(%)', '-', signed(r2), signed(r3)],
          ],
        }
      : {
          caption: `${m.who} ${gwaWa(m.what)} 전년 대비 증감률`,
          head: ['구분', `${ys[0]}년`, `${ys[1]}년`, `${ys[2]}년`],
          rows: [
            [`${m.what}(${m.unit})`, v1, '-', '-'],
            ['증감률(%)', '-', signed(r2), signed(r3)],
          ],
        };
    const text = back
      ? rng.pick([
          `다음 표에서 ${ys[0]}년 ${m.who}의 ${eunNeun(m.what)} 몇 ${m.unit}인가?`,
          `${ys[2]}년 값과 해마다의 전년 대비 증감률이 표와 같을 때, ${ys[0]}년 ${eulReul(m.what)} 구하면?`,
          `표의 증감률을 이용해 ${m.who}의 ${ys[0]}년 ${eulReul(m.what)} 거꾸로 계산하면 얼마인가?`,
        ])
      : rng.pick([
          `다음 표에서 ${ys[0]}년 대비 ${ys[2]}년 ${m.what}의 증가율은 몇 %인가?`,
          `해마다의 전년 대비 증감률이 표와 같을 때, ${m.who}의 ${eunNeun(m.what)} ${ys[0]}년보다 ${ys[2]}년에 몇 % 늘었는가?`,
          `표를 보고 ${ys[0]}년부터 ${ys[2]}년까지 2년 동안 ${iGa(m.what)} 몇 % 증가했는지 구하면?`,
        ]);
    const f = (x: number) => (100 + x) / 100;
    return {
      text,
      answer: ans,
      wrongs,
      figure: { kind: 'table', table },
      format: back ? (v) => `${num(v)}${m.unit}` : (v) => `${num(v)}%`,
      near: back ? nearBy(ans, 10) : nearBy(ans, 1),
      steps: back
        ? [
            `${ys[1]}년 값 = ${num(v3)} ÷ ${num(f(r3))} = ${num(v2)}`,
            `${ys[0]}년 값 = ${num(v2)} ÷ ${num(f(r2))} = ${num(v1)}${m.unit}`,
            `증감률 ${signed(r2)}%와 ${signed(r3)}%를 더해 한 번에 계산하면 해마다 기준 값이 달라서 틀려요.`,
          ]
        : [
            `${ys[1]}년 값 = ${num(v1)} × ${num(f(r2))} = ${num(v2)}`,
            `${ys[2]}년 값 = ${num(v2)} × ${num(f(r3))} = ${num(v3)}`,
            `증가율 = (${num(v3)} − ${num(v1)}) ÷ ${num(v1)} × 100 = ${num(ans)}%`,
          ],
    };
  },
};
