import type { Template } from '../../engine/types.js';
import type { PieSpec, ChartSpec } from '../../../shared/charts/types.js';
import { chartProblem, swap } from './common.js';
import { catNames } from '../chart-read/data.js';
import { num } from '../../engine/format.js';

const CTX = [
  { cap: '부서별 예산', unit: '백만 원', suffix: ' 부서' },
  { cap: '경로별 신규 고객 수', unit: '명', suffix: ' 경로' },
  { cap: '용도별 지출액', unit: '만 원', suffix: '' },
];

function sharesOf(rng: import('../../engine/rng').Rng, k: number): number[] {
  for (let t = 0; t < 500; t++) {
    const s = Array.from({ length: k - 1 }, () => rng.int(2, 9) * 5);
    const last = 100 - s.reduce((a, b) => a + b, 0);
    if (last >= 10 && new Set([...s, last]).size === k) return [...s, last];
  }
  return [40, 30, 20, 10];
}

export const pieMake: Template<ChartSpec> = {
  id: 'chartMake.pie',
  area: 'chartMake',
  subtype: '원그래프 작성',
  difficulty: 2,
  generate(rng) {
    const c = rng.pick(CTX);
    const k = 4;
    const labels = c.suffix ? catNames(rng, k, c.suffix) : rng.pick([['인건비', '운영비', '시설비', '기타'], ['교육', '홍보', '장비', '여비']]);
    const total = rng.pick([200, 400, 500, 800, 1000]);
    const shares = sharesOf(rng, k);
    const prevShares = (() => {
      for (let t = 0; t < 50; t++) {
        const p = sharesOf(rng, k);
        if (p.join() !== shares.join()) return p;
      }
      return [25, 25, 30, 20];
    })();
    const vals = shares.map((s) => (s * total) / 100);
    const prevVals = prevShares.map((s) => (s * total) / 100);
    const pie = (sh: number[]): PieSpec => ({ type: 'pie', labels, values: sh, showPercent: true });
    const big = shares.indexOf(Math.max(...shares)), small = shares.indexOf(Math.min(...shares));
    const mid = [0, 1, 2, 3].find((i) => i !== big && i !== small)!;
    const shifted = shares.map((s, i) => (i === big ? s - 5 : i === small ? s + 5 : s));
    const shifted2 = shares.map((s, i) => (i === mid ? s + 5 : i === big ? s - 5 : s));
    const [y1, y2] = [rng.int(2021, 2024)].map((y) => [y, y + 1])[0];
    return chartProblem({
      text: rng.pick([
        `다음 표의 ${y2}년 ${c.cap} 구성비를 원그래프로 바르게 나타낸 것은?`,
        `표를 보고 ${y2}년 전체에서 각 항목이 차지하는 비율을 원그래프로 그렸을 때 알맞은 것은?`,
        `${y2}년 자료의 항목별 비중(%)을 계산해 원그래프로 옮긴 것으로 옳은 것은?`,
      ]),
      figure: { kind: 'table', table: { caption: c.cap, unit: c.unit, head: ['구분', `${y1}년`, `${y2}년`], rows: labels.map((l, i) => [l, prevVals[i], vals[i]]) } },
      answer: pie(shares),
      wrongs: [
        { value: pie(swap(shares, big, small)), mistakeTag: '항목 대응 오류' },
        { value: pie(prevShares), mistakeTag: '자료 열 혼동' },
        { value: pie(shifted), mistakeTag: '구성비 계산 오류' },
        { value: pie(shifted2), mistakeTag: '구성비 계산 오류' },
        { value: pie(swap(shares, mid, small)), mistakeTag: '항목 대응 오류' },
      ],
      steps: [
        `${y2}년 합계 = ${vals.map(num).join(' + ')} = ${num(total)}${c.unit}`,
        `구성비: ${labels.map((l, i) => `${l} ${num(vals[i])} ÷ ${num(total)} = ${shares[i]}%`).join(', ')}`,
        `조각의 이름과 비율이 모두 맞는 그래프를 골라야 해요.`,
      ],
    });
  },
};
