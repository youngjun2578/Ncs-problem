/** 심화(신규): 지역별 인구·총액 표에서 1인당 금액의 증가율 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { catNames } from '../../chart-read/data.js';
import { search, r1, distinctWrongs } from '../util.js';

const RATES = [5, 10, 20, 25, 40, 50];
/** 표의 인구 단위. 해설의 1인당 금액 단위(총액 단위/인구 단위)에도 쓴다 */
const POP_UNIT = '천 명';
const POP_RATES = [-10, -5, 5, 10, 20, 25];
const WHAT = [
  { what: '복지 예산', unit: '억 원' },
  { what: '문화 예산', unit: '억 원' },
  { what: '교육비 지원액', unit: '억 원' },
];

export const perCapitaRate: Template = {
  id: 'adv.chartRead.perCapitaRate',
  area: 'chartRead',
  subtype: '1인당 값 증가율',
  difficulty: 3,
  generate(rng): Generated {
    const w = rng.pick(WHAT);
    const names = catNames(rng, 3, ' 지역');
    const y1 = rng.int(2019, 2023), y2 = y1 + 1;
    const p = search(rng, 20000, (r) => {
      const rows = names.map(() => {
        const pop1 = r.int(2, 10) * 10, pc1 = r.int(2, 9) * 10, g = r.pick(RATES), gp = r.pick(POP_RATES);
        const pop2 = (pop1 * (100 + gp)) / 100, pc2 = (pc1 * (100 + g)) / 100;
        return { pop1, pc1, g, gp, pop2, pc2, t1: pop1 * pc1 / 100, t2: (pop2 * pc2) / 100 };
      });
      if (rows.some((x) => ![x.pop2, x.pc2, x.t1, x.t2].every(Number.isInteger))) return null;
      const k = r.int(0, 2);
      const x = rows[k];
      const ans = x.g;
      const tg = ((x.t2 - x.t1) / x.t1) * 100;
      const wrongs = [
        { value: r1(tg), mistakeTag: '구하는 대상 혼동' as const },
        { value: r1(Math.abs(x.gp)), mistakeTag: '항목 오독' as const },
        { value: r1(x.pc2 - x.pc1), mistakeTag: '증가량·증가율 혼동' as const },
        { value: r1(tg - x.gp), mistakeTag: '퍼센트 단순 합산' as const },
        { value: r1(((x.pc2 - x.pc1) / x.pc2) * 100), mistakeTag: '기준량 혼동' as const },
      ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { rows, k, ans, wrongs };
    });
    const { rows, k, ans, wrongs } = p;
    const x = rows[k];
    const text = rng.pick([
      `다음 표에서 ${names[k]}의 주민 1인당 ${w.what}은 ${y1}년보다 ${y2}년에 몇 % 늘었는가?`,
      `표의 인구와 ${w.what}을 이용해 ${names[k]}의 1인당 ${w.what} 증가율(${y1}년 대비 ${y2}년)을 구하면?`,
      `${names[k]}의 ${w.what}을 인구로 나눈 1인당 금액은 ${y1}년에서 ${y2}년 사이 몇 % 증가했는가?`,
    ]);
    return {
      text,
      answer: ans,
      wrongs,
      figure: {
        kind: 'table',
        table: {
          caption: `지역별 인구와 ${w.what}`,
          unit: `인구: ${POP_UNIT}, ${w.what}: ${w.unit}`,
          head: ['지역', `${y1}년 인구`, `${y1}년 ${w.what}`, `${y2}년 인구`, `${y2}년 ${w.what}`],
          rows: names.map((n, i) => [n, rows[i].pop1, rows[i].t1, rows[i].pop2, rows[i].t2]),
        },
      },
      format: (v) => `${num(v)}%`,
      near: nearBy(ans, 1),
      steps: [
        `1인당 금액 = ${w.what} ÷ 인구`,
        `${y1}년: ${num(x.t1)}${w.unit} ÷ ${num(x.pop1)}${POP_UNIT} = ${num(x.t1 / x.pop1)} (${w.unit}/${POP_UNIT}), ${y2}년: ${num(x.t2)}${w.unit} ÷ ${num(x.pop2)}${POP_UNIT} = ${num(x.t2 / x.pop2)} (${w.unit}/${POP_UNIT})`,
        `증가율 = (${num(x.t2 / x.pop2)} − ${num(x.t1 / x.pop1)}) ÷ ${num(x.t1 / x.pop1)} × 100 = ${num(ans)}%`,
        `${w.what} 전체의 증가율과 1인당 증가율은 인구가 바뀌면 달라요.`,
      ],
    };
  },
};
