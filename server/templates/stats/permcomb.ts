import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { C, P, fact } from '../../engine/frac.js';
import { eulReul, euro, gwaWa, iGa } from '../common.js';

const ways = (v: number) => `${num(v)}가지`;

function officers(rng: Rng): Generated {
  const n = rng.int(5, 10);
  const ordered = rng.chance(0.5);
  const group = rng.pick(['동아리 회원', '팀원', '위원회 위원']);
  const ans = ordered ? P(n, 2) : C(n, 2);
  return {
    text: ordered
      ? rng.pick([
          `${group} ${n}명 중에서 회장 1명과 부회장 1명을 뽑는 방법은 모두 몇 가지인가?`,
          `${n}명의 ${group} 가운데 발표자 1명과 질의응답 담당 1명을 정하려고 한다. 정하는 방법은 몇 가지인가? (한 사람이 두 역할을 맡지 않는다)`,
        ])
      : rng.pick([
          `${group} ${n}명 중에서 대표 2명을 뽑는 방법은 모두 몇 가지인가?`,
          `${n}명의 ${group} 가운데 외부 교육에 보낼 2명을 고르는 방법은 몇 가지인가?`,
        ]),
    answer: ans,
    wrongs: [
      { value: ordered ? C(n, 2) : P(n, 2), mistakeTag: '순서 고려 혼동' },
      { value: n * n, mistakeTag: '전체 경우의 수 오류' },
      { value: 2 * n, mistakeTag: '합·곱의 법칙 혼동' },
      { value: ordered ? n * (n - 1) * 2 : n * (n + 1) / 2, mistakeTag: '계산 실수' },
    ],
    format: ways,
    near: nearBy(ans, 2),
    steps: ordered
      ? [`두 자리의 역할이 다르므로 순서가 있는 선택(순열)이에요.`, `첫째 자리 ${n}명, 둘째 자리는 남은 ${n - 1}명: ${n} × ${n - 1} = ${ans}가지`]
      : [`뽑힌 두 사람의 역할이 같으므로 순서가 없는 선택(조합)이에요.`, `${n}C2 = ${n} × ${n - 1} ÷ 2 = ${ans}가지`],
  };
}

function adjacent(rng: Rng): Generated {
  const n = rng.int(4, 6);
  const ans = 2 * fact(n - 1);
  const [a, b] = rng.pick([['A', 'B'], ['갑', '을'], ['팀장', '부팀장']]);
  return {
    text: rng.pick([
      `${a}, ${eulReul(b)} 포함한 ${n}명이 한 줄로 설 때, ${gwaWa(a)} ${iGa(b)} 이웃하여 서는 방법은 모두 몇 가지인가?`,
      `${n}명이 일렬로 놓인 의자에 앉으려고 한다. ${gwaWa(a)} ${iGa(b)} 반드시 나란히 앉는 경우의 수는?`,
    ]),
    answer: ans,
    wrongs: [
      { value: fact(n - 1), mistakeTag: '묶음 내부 순서 누락' },
      { value: fact(n), mistakeTag: '조건 누락' },
      { value: 2 * fact(n - 2), mistakeTag: '계산 실수' },
      { value: 2 * fact(n), mistakeTag: '조건 누락' },
    ],
    format: ways,
    near: nearBy(ans, 2),
    steps: [
      `${gwaWa(a)} ${eulReul(b)} 한 묶음으로 보면 ${n - 1}명을 줄 세우는 셈: ${n - 1}! = ${fact(n - 1)}`,
      `묶음 안에서 ${a}, ${iGa(b)} 자리를 바꾸는 2가지를 곱해요.`,
      `${fact(n - 1)} × 2 = ${ans}가지`,
    ],
  };
}

function round_(rng: Rng): Generated {
  const n = rng.int(4, 7);
  const ans = fact(n - 1);
  return {
    text: rng.pick([
      `${n}명이 원형 탁자에 둘러앉는 방법은 모두 몇 가지인가? (회전하여 같아지는 경우는 같은 것으로 본다)`,
      `회의실의 둥근 테이블에 ${n}명이 앉으려고 한다. 앉는 방법의 수는? (돌려서 같아지는 배치는 한 가지로 센다)`,
    ]),
    answer: ans,
    wrongs: [
      { value: fact(n), mistakeTag: '원순열 중복' },
      { value: fact(n - 1) / 2, mistakeTag: '계산 실수' },
      { value: fact(n - 2), mistakeTag: '계산 실수' },
      { value: n * (n - 1), mistakeTag: '전체 경우의 수 오류' },
    ],
    format: ways,
    near: nearBy(ans, 2),
    steps: [`한 줄로 세우는 방법은 ${n}! = ${fact(n)}가지`, `원형에서는 회전해서 같은 배치가 ${n}개씩 있으므로 ${euro(String(n))} 나눠요.`, `${fact(n)} ÷ ${n} = (${n} − 1)! = ${ans}가지`],
  };
}

function committee(rng: Rng): Generated {
  const m = rng.int(3, 6), w = rng.int(3, 6);
  const ans = C(m, 2) * w;
  const [g1, g2] = rng.pick([['경력 사원', '신입 사원'], ['남성', '여성'], ['연구직', '사무직']]);
  return {
    text: rng.pick([
      `${g1} ${m}명, ${g2} ${w}명 중에서 ${g1} 2명과 ${g2} 1명으로 이루어진 3인 위원회를 만드는 방법은 몇 가지인가?`,
      `${g1} ${m}명과 ${g2} ${w}명이 있다. ${g1}에서 2명, ${g2}에서 1명을 뽑아 TF를 꾸리는 방법의 수는?`,
    ]),
    answer: ans,
    wrongs: [
      { value: C(m, 2) + w, mistakeTag: '합·곱의 법칙 혼동' },
      { value: P(m, 2) * w, mistakeTag: '순서 고려 혼동' },
      { value: C(m + w, 3), mistakeTag: '조건 누락' },
      { value: m * w, mistakeTag: '계산 실수' },
    ],
    format: ways,
    near: nearBy(ans, 2),
    steps: [`${g1} 2명 고르기: ${m}C2 = ${C(m, 2)}`, `${g2} 1명 고르기: ${w}가지`, `동시에 일어나므로 곱해요: ${C(m, 2)} × ${w} = ${ans}가지`],
  };
}

export const permcomb: Template = {
  id: 'stats.permcomb',
  area: 'stats',
  subtype: '순열·조합',
  difficulty: 3,
  generate: (rng) => rng.pick([officers, adjacent, round_, committee])(rng),
};
