import type { Template } from '../../engine/types.js';
import type { LineSpec, ChartSpec } from '../../../shared/charts/types.js';
import { chartProblem, withAt } from './common.js';
import { num } from '../../engine/format.js';

const CTX = [
  { cap: '격월 온라인 문의 건수', unit: '건', labels: ['1월', '3월', '5월', '7월', '9월'] },
  { cap: '월별 전력 사용량', unit: 'MWh', labels: ['3월', '4월', '5월', '6월', '7월'] },
  { cap: '연도별 교육 이수자 수', unit: '명', labels: ['2021', '2022', '2023', '2024', '2025'] },
];

export const lineMake: Template<ChartSpec> = {
  id: 'chartMake.line',
  area: 'chartMake',
  subtype: '꺾은선그래프 작성',
  difficulty: 2,
  generate(rng) {
    const c = rng.pick(CTX);
    const n = 5;
    const step = rng.pick([10, 20, 50]);
    let v: number[] = [], other: number[] = [];
    for (let t = 0; t < 500; t++) {
      v = [rng.int(2, 6) * step];
      for (let i = 1; i < n; i++) v.push(Math.max(step, v[i - 1] + rng.int(-2, 3) * step));
      other = v.map((x) => Math.max(step, x + rng.int(-2, 2) * step));
      const dirs = v.slice(1).map((x, i) => Math.sign(x - v[i]));
      if (dirs.includes(1) && dirs.includes(-1) && other.join() !== v.join() && v.slice().reverse().join() !== v.join()) break;
    }
    // 증감 방향을 뒤집을 지점: 직전 대비 변화가 있는 가운데 지점
    const flipAt = [1, 2, 3].find((i) => v[i] !== v[i - 1] && 2 * v[i - 1] - v[i] >= step) ?? 1;
    const flipped = withAt(v, flipAt, Math.max(step, 2 * v[flipAt - 1] - v[flipAt]));
    const cumulative = v.map((_, i) => v.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const tick = rng.int(0, n - 1);
    const line = (values: number[], labels = c.labels): LineSpec => ({ type: 'line', unit: c.unit, labels, values });
    const [rowA, rowB] = rng.pick([['본사', '지사'], ['A 시설', 'B 시설'], ['계획', '실적']]);
    return chartProblem({
      text: rng.pick([
        `다음 표의 '${rowB}' 자료를 꺾은선그래프로 바르게 나타낸 것은?`,
        `표에 있는 ${rowB}의 ${c.cap.replace(/^\S+ /, '')} 변화를 꺾은선그래프로 그렸을 때 알맞은 것은?`,
        `${c.cap} 표에서 '${rowB}' 행을 시간 순서대로 이은 꺾은선그래프를 고르면?`,
      ]),
      figure: { kind: 'table', table: { caption: c.cap, unit: c.unit, head: ['구분', ...c.labels], rows: [[rowA, ...other], [rowB, ...v]] } },
      answer: line(v),
      wrongs: [
        { value: line(v.slice().reverse()), mistakeTag: '시간 순서 반전' },
        { value: line(flipped), mistakeTag: '증감 방향 오독' },
        { value: line(other), mistakeTag: '자료 열 혼동' },
        { value: line(withAt(v, tick, v[tick] + step)), mistakeTag: '눈금 읽기 오류' },
        { value: line(cumulative), mistakeTag: '누적값 혼동' },
      ],
      steps: [
        `'${rowB}' 행의 값: ${c.labels.map((l, i) => `${l} ${num(v[i])}`).join(', ')}`,
        `가로축은 왼쪽부터 시간 순서, 각 점의 높이는 그 시점의 값이에요. 늘고 줄어드는 방향이 표와 같은지 확인하세요.`,
      ],
    });
  },
};
