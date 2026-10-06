/** 심화(신규): 전체 합계와 항목별 비중(%) 표에서 한 항목의 실제 값 증가량 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { catNames } from '../../chart-read/data.js';
import { search, distinctWrongs } from '../util.js';
import { eunNeun } from '../../common.js';

const TOTALS = [200, 400, 500, 600, 800, 1000, 1200, 1500, 2000];
const CTX = [
  { cap: '사업 부문별 매출 비중', what: '매출', unit: '억 원', suffix: ' 부문' },
  { cap: '경로별 방문객 비중', what: '방문객 수', unit: '천 명', suffix: ' 경로' },
  { cap: '용도별 예산 비중', what: '예산', unit: '백만 원', suffix: ' 사업' },
];

function shares(rng: import('../../../engine/rng').Rng): number[] {
  for (let t = 0; t < 200; t++) {
    const s = [rng.int(2, 8) * 5, rng.int(2, 8) * 5, rng.int(2, 8) * 5];
    const last = 100 - s.reduce((a, b) => a + b, 0);
    if (last >= 10) return [...s, last];
  }
  return [30, 25, 25, 20];
}

export const shareToAmount: Template = {
  id: 'adv.chartRead.shareToAmount',
  area: 'chartRead',
  subtype: '비중으로 실제 값 비교',
  difficulty: 3,
  generate(rng): Generated {
    const c = rng.pick(CTX);
    const names = catNames(rng, 4, c.suffix);
    const y1 = rng.int(2019, 2023), y2 = y1 + 1;
    const p = search(rng, 4000, (r) => {
      const T1 = r.pick(TOTALS), T2 = r.pick(TOTALS);
      const s1 = shares(r), s2 = shares(r);
      const k = r.int(0, 3);
      const a = (T1 * s1[k]) / 100, b = (T2 * s2[k]) / 100;
      if (!Number.isInteger(a) || !Number.isInteger(b) || b <= a || s1[k] === s2[k]) return null;
      const ans = b - a;
      const wrongs = [
        { value: Math.abs(s2[k] - s1[k]), mistakeTag: '%p·% 혼동' as const },
        { value: ((T2 - T1) * s2[k]) / 100, mistakeTag: '기준량 혼동' as const },
        { value: b, mistakeTag: '구하는 대상 혼동' as const },
        { value: ((T2 - T1) * s1[k]) / 100, mistakeTag: '자료 열 혼동' as const },
        { value: (T2 * s1[k]) / 100 - a, mistakeTag: '자료 열 혼동' as const },
      ];
      if (wrongs.some((w) => !Number.isInteger(w.value * 10))) return null;
      if (!distinctWrongs(ans, wrongs)) return null;
      return { T1, T2, s1, s2, k, a, b, ans, wrongs };
    });
    const { T1, T2, s1, s2, k, a, b, ans, wrongs } = p;
    const text = rng.pick([
      `다음 표에서 ${names[k]}의 ${eunNeun(c.what)} ${y1}년보다 ${y2}년에 얼마나 늘었는가?`,
      `표의 전체 합계와 비중을 이용해 ${names[k]}의 ${c.what} 증가량(${y1}년 → ${y2}년)을 구하면?`,
      `${y1}년과 ${y2}년의 ${c.cap} 표이다. ${names[k]}의 실제 ${eunNeun(c.what)} 몇 ${c.unit} 증가했는가?`,
    ]);
    return {
      text,
      answer: ans,
      wrongs,
      figure: {
        kind: 'table',
        table: {
          caption: c.cap,
          unit: `비중: %, 전체: ${c.unit}`,
          head: ['구분', `${y1}년`, `${y2}년`],
          rows: [...names.map((n, i) => [n, s1[i], s2[i]]), [`전체(${c.unit})`, T1, T2]],
        },
      },
      format: (v) => `${num(v)}${c.unit}`,
      near: nearBy(ans, 5),
      steps: [
        `${y1}년 ${names[k]}: ${num(T1)} × ${s1[k]}/100 = ${num(a)}`,
        `${y2}년 ${names[k]}: ${num(T2)} × ${s2[k]}/100 = ${num(b)}`,
        `증가량 = ${num(b)} − ${num(a)} = ${num(ans)}${c.unit}`,
        `비중의 차이(%p)는 전체 합계가 바뀌면 실제 값의 변화와 달라요.`,
      ],
    };
  },
};
