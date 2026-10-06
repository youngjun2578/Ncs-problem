/** 심화(신규): 기준 연도 = 100인 지수 자료에서 두 해 사이의 실제 증가율 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { years } from '../../chart-read/data.js';
import { search, clean1, r1, distinctWrongs } from '../util.js';
import { euro } from '../../common.js';

const ITEMS = [
  ['쌀', '밀가루', '설탕'],
  ['전기 요금', '가스 요금', '수도 요금'],
  ['A 품목', 'B 품목', 'C 품목'],
];

export const indexGrowth: Template = {
  id: 'adv.chartRead.indexGrowth',
  area: 'chartRead',
  subtype: '지수 자료 증가율',
  difficulty: 1,
  generate(rng): Generated {
    const names = rng.pick(ITEMS);
    const ys = years(rng, 4);
    const p = search(rng, 3000, (r) => {
      const rows = names.map(() => [100, r.int(85, 150), r.int(90, 170), r.int(95, 190)]);
      const k = r.int(0, names.length - 1);
      const [ia, ib] = r.sample([1, 2, 3], 2).sort((a, b) => a - b);
      const a = rows[k][ia], b = rows[k][ib];
      if (b <= a) return null;
      const ans = ((b - a) / a) * 100;
      if (!clean1(ans)) return null;
      const other = rows[(k + 1) % names.length];
      const wrongs = [
        // 지수 차이(포인트)를 그대로 증가율로 읽는 실수
        { value: b - a, mistakeTag: '증가량·증가율 혼동' as const },
        { value: r1(((b - a) / b) * 100), mistakeTag: '기준량 혼동' as const },
        { value: b - 100, mistakeTag: '구간 오독' as const },
        { value: r1(((other[ib] - other[ia]) / other[ia]) * 100), mistakeTag: '항목 오독' as const },
      ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { rows, k, ia, ib, a, b, ans, wrongs };
    });
    const { rows, k, ia, ib, a, b, ans, wrongs } = p;
    const text = rng.pick([
      `다음은 ${ys[0]}년을 100으로 한 가격 지수이다. ${names[k]}의 가격은 ${ys[ia]}년보다 ${ys[ib]}년에 몇 % 올랐는가?`,
      `표의 지수(${ys[0]}년 = 100)를 보고 ${ys[ia]}년 대비 ${ys[ib]}년 ${names[k]} 가격의 증가율을 구하면?`,
      `${ys[0]}년 가격을 100으로 둔 지수 자료이다. ${ys[ia]}년에서 ${ys[ib]}년 사이 ${names[k]} 가격은 몇 % 상승했는가?`,
    ]);
    return {
      text,
      answer: ans,
      wrongs,
      figure: {
        kind: 'table',
        table: { caption: `품목별 가격 지수 (${ys[0]}년 = 100)`, head: ['품목', ...ys.map((y) => `${y}년`)], rows: names.map((n, i) => [n, ...rows[i]]) },
      },
      format: (v) => `${num(v)}%`,
      near: nearBy(ans, 1),
      steps: [
        `지수는 ${ys[0]}년을 100으로 둔 상댓값이라, 두 해의 비교는 지수끼리 나눠서 구해요.`,
        `${names[k]}: ${ys[ia]}년 ${a}, ${ys[ib]}년 ${b}`,
        `증가율 = (${b} − ${a}) ÷ ${a} × 100 = ${num(ans)}%`,
        `지수의 차이는 ${b} − ${a} = ${b - a}포인트이지만, 이것이 증가율 ${b - a}%를 뜻하지는 않아요. 증가율은 기준이 되는 ${ys[ia]}년 지수 ${euro(String(a))} 나누어 계산해요.`,
      ],
    };
  },
};
