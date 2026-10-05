import type { Template } from '../../engine/types.js';
import type { BarSpec, ChartSpec } from '../../../shared/charts/types.js';
import { chartProblem, swap, withAt } from './common.js';
import { catNames } from '../chart-read/data.js';
import { num } from '../../engine/format.js';

const CTX = [
  { cap: '지점별 신규 계약 건수', unit: '건', suffix: ' 지점' },
  { cap: '부서별 연차 사용 일수', unit: '일', suffix: ' 부서' },
  { cap: '품목별 재고량', unit: '상자', suffix: ' 품목' },
];

export const barMake: Template<ChartSpec> = {
  id: 'chartMake.bar',
  area: 'chartMake',
  subtype: '막대그래프 작성',
  difficulty: 1,
  generate(rng) {
    const c = rng.pick(CTX);
    const k = rng.pick([4, 5]);
    const step = rng.pick([10, 20, 50]);
    const labels = catNames(rng, k, c.suffix);
    const y2 = rng.int(2022, 2025), y1 = y2 - 1;
    let cur: number[] = [], prev: number[] = [];
    for (let t = 0; t < 300; t++) {
      cur = Array.from({ length: k }, () => rng.int(1, 8) * step);
      prev = Array.from({ length: k }, () => rng.int(1, 8) * step);
      const sorted = cur.slice().sort((a, b) => b - a);
      if (new Set(cur).size === k && sorted.join() !== cur.join() && prev.join() !== cur.join() && cur.some((v, i) => i < k - 1 && v !== cur[i + 1])) break;
    }
    const bar = (values: number[]): BarSpec => ({ type: 'bar', unit: c.unit, labels, values });
    const i = rng.int(0, k - 2);
    const up = rng.int(0, k - 1);
    const down = cur.findIndex((v) => v > step);
    return chartProblem({
      text: rng.pick([
        `다음 표의 ${y2}년 자료를 막대그래프로 바르게 나타낸 것은?`,
        `표의 ${y2}년 값을 막대그래프로 옮겼을 때 올바른 것을 고르면?`,
        `${c.cap} 표의 ${y2}년 값을 그대로 나타낸 막대그래프는?`,
      ]),
      figure: { kind: 'table', table: { caption: c.cap, unit: c.unit, head: ['구분', `${y1}년`, `${y2}년`], rows: labels.map((l, j) => [l, prev[j], cur[j]]) } },
      answer: bar(cur),
      wrongs: [
        { value: bar(swap(cur, i, i + 1)), mistakeTag: '항목 대응 오류' },
        { value: bar(withAt(cur, up, cur[up] + step)), mistakeTag: '눈금 읽기 오류' },
        { value: bar(prev), mistakeTag: '자료 열 혼동' },
        { value: bar(cur.slice().sort((a, b) => b - a)), mistakeTag: '항목 대응 오류' },
        ...(down >= 0 ? [{ value: bar(withAt(cur, down, cur[down] - step)), mistakeTag: '눈금 읽기 오류' as const }] : []),
      ],
      steps: [
        `${y2}년 열의 값: ${labels.map((l, j) => `${l} ${num(cur[j])}`).join(', ')}`,
        `항목 순서를 표와 같게 두고, 각 막대의 높이가 세로축 눈금에서 위 값과 맞는 그래프를 고르면 돼요.`,
        `${y1}년 열을 그리거나 크기순으로 다시 정렬한 그래프는 자료와 맞지 않아요.`,
      ],
    });
  },
};
