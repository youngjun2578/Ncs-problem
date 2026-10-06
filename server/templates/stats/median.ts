import type { Template, Generated } from '../../engine/types.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { iGa, ieyo } from '../common.js';

const CTX = [
  { lead: (n: number, l: string) => `직원 ${n}명의 통근 시간을 조사했더니 각각 ${l}분이었다.`, unit: '분', lo: 15, hi: 80 },
  { lead: (n: number, l: string) => `어느 부서가 최근 ${n}개월 동안 처리한 월별 민원은 ${l}건이다.`, unit: '건', lo: 20, hi: 95 },
  { lead: (n: number, l: string) => `${n}개 지점의 하루 판매량을 기록한 자료는 다음과 같다. (단위: 개) ${l}.`, unit: '개', lo: 10, hi: 70 },
];

export const median: Template = {
  id: 'stats.median',
  area: 'stats',
  subtype: '중앙값',
  difficulty: 1,
  generate(rng): Generated {
    const ctx = rng.pick(CTX);
    const n = rng.pick([6, 7, 7, 8, 9]);
    let vals: number[] = [];
    let sorted: number[] = [];
    let med = 0;
    for (let i = 0; i < 500; i++) {
      // 한 값을 두 번 넣어 최빈값을 만든다
      const base = Array.from({ length: n - 1 }, () => rng.int(ctx.lo, ctx.hi));
      const dup = rng.pick(base);
      vals = rng.shuffle([...base, dup]);
      sorted = vals.slice().sort((a, b) => a - b);
      const m = n / 2;
      med = n % 2 ? sorted[(n - 1) / 2] : (sorted[m - 1] + sorted[m]) / 2;
      const counts = new Map<number, number>();
      vals.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
      const maxC = Math.max(...counts.values());
      const modes = [...counts].filter(([, c]) => c === maxC);
      const unsortedMid = n % 2 ? vals[(n - 1) / 2] : (vals[m - 1] + vals[m]) / 2;
      const mean = vals.reduce((s, v) => s + v, 0) / n;
      if (modes.length !== 1 || modes[0][0] === med) continue;
      if (unsortedMid === med || Math.abs(mean - med) < 1) continue;
      if (n % 2 === 0 && sorted[m - 1] === sorted[m]) continue;
      if (!Number.isInteger(med * 2)) continue;
      break;
    }
    const m = n / 2;
    const counts = new Map<number, number>();
    vals.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    const mode = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const mean = round(vals.reduce((s, v) => s + v, 0) / n, 1);
    const unsortedMid = n % 2 ? vals[(n - 1) / 2] : (vals[m - 1] + vals[m]) / 2;
    const wrongs: Generated['wrongs'] = [
      { value: mean, mistakeTag: '평균·중앙값 혼동' },
      { value: unsortedMid, mistakeTag: '정렬 누락' },
      { value: mode, mistakeTag: '최빈값 혼동' },
    ];
    if (n % 2 === 0) {
      wrongs.push({ value: sorted[m - 1], mistakeTag: '짝수 개 중앙값 오류' }, { value: sorted[m], mistakeTag: '짝수 개 중앙값 오류' });
    } else {
      wrongs.push({ value: sorted[(n - 1) / 2 + 1], mistakeTag: '중앙 위치 오류' }, { value: sorted[(n - 1) / 2 - 1], mistakeTag: '중앙 위치 오류' });
    }
    const list = vals.join(', ');
    const ask = rng.pick(['이 자료의 중앙값은?', '이 자료의 중앙값을 구하면?', '자료의 중앙값은 얼마인가?']);
    return {
      text: `${ctx.lead(n, list)} ${ask}`,
      answer: med,
      wrongs,
      format: (v) => `${num(v)}${ctx.unit}`,
      near: nearBy(med, 1),
      steps: [
        `크기순으로 정렬: ${sorted.join(', ')}`,
        n % 2
          ? `자료가 ${n}개(홀수)이므로 ${(n + 1) / 2}번째 값 ${iGa(`${num(med)}${ctx.unit}`)} 중앙값이에요.`
          : `자료가 ${n}개(짝수)이므로 ${m}번째와 ${m + 1}번째 값의 평균: (${sorted[m - 1]} + ${sorted[m]}) ÷ 2 = ${num(med)}${ctx.unit}`,
        `참고로 평균은 ${num(mean)}${ctx.unit}, 가장 자주 나온 값(최빈값)은 ${ieyo(`${mode}${ctx.unit}`)}.`,
      ],
    };
  },
};
