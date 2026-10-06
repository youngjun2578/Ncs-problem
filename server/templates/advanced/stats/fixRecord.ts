/** 심화(신규): 잘못 기록한 값을 고친 뒤의 평균 또는 중앙값 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { search, clean1, r1, distinctWrongs, josaBeforeParen } from '../util.js';
import { eunNeun, euro, iGa, josa } from '../../common.js';

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const h = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[h - 1] + s[h]) / 2;
};

export const fixRecord: Template = {
  id: 'adv.stats.fixRecord',
  area: 'stats',
  subtype: '자료 수정 후 대표값',
  difficulty: 2,
  generate(rng): Generated {
    const askMedian = rng.chance(0.5);
    const what = rng.pick(['점수', '판매량', '처리 건수']);
    const unit = what === '점수' ? '점' : what === '판매량' ? '개' : '건';
    if (!askMedian) {
      const p = search(rng, 4000, (r) => {
        const n = r.int(8, 12), M = r.int(55, 85), x = r.int(20, 99), y = r.int(20, 99);
        if (x === y) return null;
        const ans = M + (y - x) / n;
        if (!clean1(ans)) return null;
        const wrongs = [
          { value: M + (y - x), mistakeTag: '전체 합계 혼동' as const },
          { value: r1(M - (y - x) / n), mistakeTag: '증감 방향 오독' as const },
          { value: r1((M + y) / 2), mistakeTag: '산술평균 착각' as const },
          { value: M, mistakeTag: '조건 누락' as const },
          { value: r1(M + (y - x) / (n - 1)), mistakeTag: '계산 실수' as const },
        ];
        if (!distinctWrongs(ans, wrongs)) return null;
        return { n, M, x, y, ans, wrongs };
      });
      const { n, M, x, y, ans, wrongs } = p;
      const text = rng.pick([
        `${n}개 자료의 ${what} 평균을 ${euro(`${M}${unit}`)} 계산했는데, 실제로는 ${y}${unit}인 한 값을 ${euro(`${x}${unit}`)} 잘못 기록한 사실을 알았다. 바르게 고친 평균은?`,
        `${what} 자료 ${n}개의 평균이 ${josa(`${M}${unit}`, '이었다', '였다')}. 그런데 실제로는 ${y}${unit}인 한 값을 ${euro(`${x}${unit}`)} 잘못 기록했다면, 고친 뒤의 평균은 얼마인가?`,
        `${n}개 ${what} 자료의 평균은 ${josa(`${M}${unit}`, '이었다', '였다')}. 나중에 보니 실제로는 ${y}${unit}인 한 값을 ${euro(`${x}${unit}`)} 잘못 기록했다. 이 값을 바로잡은 뒤 평균을 구하면?`,
      ]);
      return {
        text,
        answer: ans,
        wrongs,
        format: (v) => `${num(v)}${unit}`,
        near: nearBy(ans, 1),
        steps: [
          `고치기 전 총합 = ${n} × ${M} = ${n * M}`,
          `고친 뒤 총합 = ${n * M} − ${x} + ${y} = ${n * M - x + y}`,
          `평균 = ${n * M - x + y} ÷ ${n} = ${num(ans)}${unit}`,
        ],
      };
    }
    const p = search(rng, 4000, (r) => {
      const n = r.pick([7, 8, 9]);
      const vals = Array.from({ length: n }, () => r.int(10, 99));
      if (new Set(vals).size !== n) return null;
      const i = r.int(0, n - 1);
      const y = r.int(10, 99);
      if (vals.includes(y)) return null;
      const fixed = vals.map((v, k) => (k === i ? y : v));
      const ans = median(fixed);
      const before = median(vals);
      const mid = n % 2 ? fixed[(n - 1) / 2] : (fixed[n / 2 - 1] + fixed[n / 2]) / 2;
      const mean = fixed.reduce((a, b) => a + b, 0) / n;
      const sorted = fixed.slice().sort((a, b) => a - b);
      const wrongs = [
        { value: before, mistakeTag: '조건 누락' as const },
        { value: mid, mistakeTag: '정렬 누락' as const },
        { value: r1(mean), mistakeTag: '평균·중앙값 혼동' as const },
        { value: n % 2 ? sorted[(n - 1) / 2 + 1] : sorted[n / 2], mistakeTag: n % 2 ? ('중앙 위치 오류' as const) : ('짝수 개 중앙값 오류' as const) },
      ];
      if (!clean1(ans) || !distinctWrongs(ans, wrongs)) return null;
      return { n, vals, i, y, fixed, ans, wrongs, sorted };
    });
    const { n, vals, i, y, ans, wrongs, sorted } = p;
    const list = vals.join(', ');
    const text = rng.pick([
      `${what} 자료 ${n}개가 ${josaBeforeParen(`${list}(단위: ${unit})`, euro)} 기록되어 있다. 이 가운데 ${i + 1}번째 값 ${eunNeun(`${vals[i]}${unit}`)} 실제로는 ${y}${unit}인 값을 잘못 기록한 것이다. 바르게 고친 자료의 중앙값은?`,
      `다음 ${n}개 ${what} 자료(${list}, 단위: ${unit})에서 ${i + 1}번째 값 ${eunNeun(`${vals[i]}${unit}`)} 실제로는 ${y}${unit}인 값을 잘못 기록한 것이다. 이 값을 바로잡은 뒤 중앙값은 얼마인가?`,
      `${list}(단위: ${unit}). 위 ${what} 자료의 ${i + 1}번째 값은 실제로는 ${y}${unit}인데 ${euro(`${vals[i]}${unit}`)} 잘못 기록되었다. 수정한 자료의 중앙값을 구하면?`,
    ]);
    return {
      text,
      answer: ans,
      wrongs,
      format: (v) => `${num(v)}${unit}`,
      near: nearBy(ans, 1),
      steps: [
        `${i + 1}번째 값을 ${euro(String(y))} 고친 뒤 크기순 정렬: ${sorted.join(', ')}`,
        n % 2
          ? `자료가 ${n}개(홀수)이므로 ${(n + 1) / 2}번째 값 ${iGa(`${num(ans)}${unit}`)} 중앙값이에요.`
          : `자료가 ${n}개(짝수)이므로 ${n / 2}번째와 ${n / 2 + 1}번째 값의 평균: (${sorted[n / 2 - 1]} + ${sorted[n / 2]}) ÷ 2 = ${num(ans)}${unit}`,
        `고치기 전 자료나 정렬하지 않은 순서로 중앙값을 고르면 틀려요.`,
      ],
    };
  },
};
