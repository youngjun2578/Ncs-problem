import type { Generated, Wrong } from '../../engine/types.js';
import type { ChartSpec } from '../../../shared/charts/types.js';
import { describe, niceScale } from '../../../shared/charts/render.js';

/** 그래프 보기 문제 공통: 값 자체가 ChartSpec, 표시 문자열은 그래프 설명(중복 판정·대체 텍스트) */
export function chartProblem(p: {
  text: string;
  answer: ChartSpec;
  wrongs: Wrong<ChartSpec>[];
  steps: string[];
  figure?: Generated<ChartSpec>['figure'];
}): Generated<ChartSpec> {
  // 정답과 단위가 같고 값 범위가 비슷한 보기는 같은 눈금으로 그려야 눈금 비교가 공정하다.
  // 단위가 다르거나(증가량 등) 범위가 크게 다른(누적값 등) 보기는 자기 눈금을 쓴다.
  const a = p.answer;
  if (a.type === 'bar' || a.type === 'line') {
    const aMax = Math.max(...a.values);
    const near = [a, ...p.wrongs.map((w) => w.value)].filter(
      (s): s is typeof a => (s.type === 'bar' || s.type === 'line') && s.unit === a.unit && Math.max(...s.values) <= aMax * 1.5,
    );
    const top = niceScale(Math.max(...near.flatMap((s) => s.values))).top;
    for (const s of near) s.yMax ??= top;
  }
  return { ...p, format: describe, chart: (v) => v };
}

/** 값 배열에서 i, j 위치를 바꾼 복사본 */
export const swap = (a: number[], i: number, j: number) => {
  const b = a.slice();
  [b[i], b[j]] = [b[j], b[i]];
  return b;
};
export const withAt = (a: number[], i: number, v: number) => a.map((x, k) => (k === i ? v : x));
