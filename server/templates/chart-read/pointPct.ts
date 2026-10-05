import type { Template, Generated } from '../../engine/types.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { catNames } from './data.js';

/** 합이 100인 k개 비율 (정수) */
function shares(rng: import('../../engine/rng').Rng, k: number): number[] {
  for (let t = 0; t < 500; t++) {
    const s = Array.from({ length: k - 1 }, () => rng.int(8, 40));
    const last = 100 - s.reduce((a, b) => a + b, 0);
    if (last >= 8 && last <= 50) return [...s, last];
  }
  return [30, 25, 25, 20];
}

export const pointPct: Template = {
  id: 'chartRead.pointPct',
  area: 'chartRead',
  subtype: '%p와 % 구분',
  difficulty: 3,
  generate(rng): Generated {
    const k = 4;
    const labels = catNames(rng, k, '사');
    const [y1, y2] = [rng.int(2019, 2023)].map((y) => [y, y + 1])[0];
    let s1: number[] = [], s2: number[] = [], idx = 0, r = 0;
    for (let t = 0; t < 1000; t++) {
      s1 = shares(rng, k);
      idx = rng.int(0, k - 1);
      r = rng.pick([10, 20, 25, 50, 40, 30]);
      const target = s1[idx] * (1 + r / 100);
      if (!Number.isInteger(target)) continue;
      const delta = target - s1[idx];
      // 다른 회사들에서 delta만큼 빼서 합 100 유지
      s2 = s1.slice();
      s2[idx] = target;
      let rest = delta;
      for (const j of rng.shuffle([...Array(k).keys()].filter((j) => j !== idx))) {
        const take = Math.min(rest, s2[j] - 5, rng.int(1, rest));
        s2[j] -= take;
        rest -= take;
      }
      if (rest !== 0 || s2.some((v) => v < 5)) continue;
      break;
    }
    const d = s2[idx] - s1[idx];
    const nb = (idx + 1) % k;
    const askPoint = rng.chance(0.5);
    const table = {
      caption: `${y1}~${y2}년 회사별 시장 점유율`,
      unit: '%',
      head: ['회사', `${y1}년`, `${y2}년`],
      rows: labels.map((l, i) => [l, s1[i], s2[i]]),
    };
    const nbRate = round((Math.abs(s2[nb] - s1[nb]) / s1[nb]) * 100, 1);
    if (askPoint) {
      return {
        text: rng.pick([
          `다음 표에서 ${labels[idx]}의 시장 점유율은 ${y1}년 대비 ${y2}년에 몇 %p 증가했는가?`,
          `${labels[idx]}의 점유율 변화를 %p(퍼센트포인트)로 나타내면 얼마인가?`,
        ]),
        figure: { kind: 'table', table },
        answer: d,
        wrongs: [
          { value: r, mistakeTag: '%p·% 혼동' },
          { value: s2[idx], mistakeTag: '구하는 대상 혼동' },
          { value: Math.abs(s2[nb] - s1[nb]), mistakeTag: '항목 오독' },
          { value: round((d / s2[idx]) * 100, 1), mistakeTag: '%p·% 혼동' },
        ],
        format: (v) => `${num(v)}%p`,
        near: nearBy(d, 1),
        steps: [`점유율 차이 = ${s2[idx]}% − ${s1[idx]}% = ${d}%p`, `비율끼리 뺀 값은 %p로 써요. (변화율로 계산하면 ${r}%예요.)`],
      };
    }
    return {
      text: rng.pick([
        `다음 표에서 ${labels[idx]}의 시장 점유율은 ${y1}년 대비 ${y2}년에 몇 % 증가했는가? (점유율 자체의 증가율)`,
        `${labels[idx]}의 점유율이 ${y1}년보다 ${y2}년에 몇 % 늘었는지 증가율로 구하면?`,
      ]),
      figure: { kind: 'table', table },
      answer: r,
      wrongs: [
        { value: d, mistakeTag: '%p·% 혼동' },
        { value: round((d / s2[idx]) * 100, 1), mistakeTag: '기준량 혼동' },
        { value: nbRate, mistakeTag: '항목 오독' },
        { value: round((s2[idx] / s1[idx]) * 100, 1), mistakeTag: '비율·증가율 혼동' },
      ],
      format: (v) => `${num(v)}%`,
      near: nearBy(r, 5),
      steps: [`점유율 차이 = ${s2[idx]} − ${s1[idx]} = ${d}%p`, `증가율 = ${d} ÷ ${s1[idx]} × 100 = ${r}%`, `%p(차이)와 %(변화율)는 다른 값이에요.`],
    };
  },
};
