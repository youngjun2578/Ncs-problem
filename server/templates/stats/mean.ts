import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { person, eunNeun } from '../common.js';

const pt = (v: number) => `${num(v)}점`;

function target(rng: Rng): Generated {
  let n = 4, m = 80, M = 82, x = 90;
  for (let i = 0; i < 300; i++) {
    const N = rng.int(3, 5), Mm = rng.int(62, 88), gap = rng.int(1, 4);
    const X = (N + 1) * (Mm + gap) - N * Mm;
    if (X <= 100) {
      [n, m, M, x] = [N, Mm, Mm + gap, X];
      break;
    }
  }
  const who = person(rng);
  return {
    text: rng.pick([
      `${who}의 지난 ${n}번의 시험 평균은 ${m}점이었다. 다음 시험까지 ${n + 1}번의 평균을 ${M}점으로 올리려면 다음 시험에서 몇 점을 받아야 하는가?`,
      `${eunNeun(who)} 직무 평가 ${n}회의 평균이 ${m}점이다. ${n + 1}회차 평가를 포함한 평균이 ${M}점이 되려면 ${n + 1}회차 점수는 몇 점이어야 하는가?`,
    ]),
    answer: x,
    wrongs: [
      { value: M + (M - m), mistakeTag: '부족분 누적 누락' },
      { value: M, mistakeTag: '조건 누락' },
      { value: (n + 1) * M, mistakeTag: '구하는 대상 혼동' },
      { value: x + (M - m), mistakeTag: '계산 실수' },
    ],
    format: pt,
    near: nearBy(x, 2),
    steps: [
      `지금까지 총점 = ${n} × ${m} = ${n * m}점`,
      `목표 총점 = ${n + 1} × ${M} = ${(n + 1) * M}점`,
      `필요한 점수 = ${(n + 1) * M} − ${n * m} = ${x}점`,
      `목표 평균보다 ${M - m}점만 더 받으면 된다고 생각하면 틀려요. 지난 ${n}번의 부족분까지 채워야 해요.`,
    ],
  };
}

function weighted(rng: Rng): Generated {
  let p = 20, q = 30, a = 70, b = 80, ans = 76;
  for (let i = 0; i < 500; i++) {
    const P = rng.int(2, 8) * 5, Q = rng.int(2, 8) * 5, A = rng.int(60, 90), B = rng.int(60, 90);
    if (P === Q || Math.abs(A - B) < 4) continue;
    if ((P * A + Q * B) % (P + Q) !== 0) continue;
    [p, q, a, b, ans] = [P, Q, A, B, (P * A + Q * B) / (P + Q)];
    break;
  }
  const [g1, g2] = rng.pick([['A반', 'B반'], ['1팀', '2팀'], ['오전 교육반', '오후 교육반']] as [string, string][]);
  return {
    text: rng.pick([
      `${g1} ${p}명의 평균 점수는 ${a}점, ${g2} ${q}명의 평균 점수는 ${b}점이다. 두 집단 전체의 평균 점수는 몇 점인가?`,
      `직무 시험에서 ${g1}(${p}명)의 평균은 ${a}점, ${g2}(${q}명)의 평균은 ${b}점이었다. 전체 ${p + q}명의 평균은?`,
    ]),
    answer: ans,
    wrongs: [
      { value: (a + b) / 2, mistakeTag: '산술평균 착각' },
      { value: (a * q + b * p) / (p + q), mistakeTag: '가중치 뒤바꿈' },
      { value: Math.max(a, b), mistakeTag: '한 구간만 반영' },
      { value: Math.min(a, b), mistakeTag: '한 구간만 반영' },
    ].map((w) => ({ ...w, value: round(w.value, 1) })) as Generated['wrongs'],
    format: pt,
    near: nearBy(ans, 1),
    steps: [
      `전체 총점 = ${p}×${a} + ${q}×${b} = ${p * a + q * b}점`,
      `전체 인원 = ${p + q}명`,
      `평균 = ${p * a + q * b} ÷ ${p + q} = ${num(ans)}점`,
      `인원이 다르므로 두 평균의 단순 평균(${num((a + b) / 2)}점)은 맞지 않아요.`,
    ],
  };
}

function missing(rng: Rng): Generated {
  const k = rng.pick([5, 6]);
  const M = rng.int(14, 40);
  let vals: number[] = [];
  for (let i = 0; i < 300; i++) {
    vals = Array.from({ length: k - 1 }, () => M + rng.int(-9, 9));
    const x = k * M - vals.reduce((s, v) => s + v, 0);
    if (x > 0 && x !== M && !vals.includes(x)) {
      vals.push(x);
      break;
    }
  }
  const x = vals[k - 1];
  const known = vals.slice(0, k - 1);
  const sumKnown = known.reduce((s, v) => s + v, 0);
  const days = ['월', '화', '수', '목', '금', '토'].slice(0, k);
  const store = rng.chance(0.5);
  const unit = store ? '개' : '건';
  return {
    text: store
      ? `${k}개 지점의 평균 판매량이 ${M}개이다. 그중 ${k - 1}개 지점의 판매량이 각각 ${known.join(', ')}개라면, 나머지 한 지점의 판매량은 몇 개인가?`
      : `${k}일 동안 하루 평균 ${M}건의 문의가 접수되었다. ${days
          .slice(0, k - 1)
          .map((d, i) => `${d}요일 ${known[i]}건`)
          .join(', ')}이었다면 ${days[k - 1]}요일에는 몇 건이 접수되었는가?`,
    answer: x,
    wrongs: [
      { value: M, mistakeTag: '조건 누락' },
      { value: round(sumKnown / (k - 1), 1), mistakeTag: '구하는 대상 혼동' },
      { value: k * M, mistakeTag: '구하는 대상 혼동' },
      { value: round(2 * M - sumKnown / (k - 1), 1), mistakeTag: '부족분 누적 누락' },
    ],
    format: (v) => `${num(v)}${unit}`,
    near: nearBy(x, 1),
    steps: [`전체 합계 = ${k} × ${M} = ${k * M}${unit}`, `알려진 값의 합 = ${sumKnown}${unit}`, `나머지 = ${k * M} − ${sumKnown} = ${x}${unit}`],
  };
}

export const mean: Template = {
  id: 'stats.mean',
  area: 'stats',
  subtype: '평균',
  difficulty: 1,
  generate: (rng) => rng.pick([target, weighted, missing])(rng),
};
