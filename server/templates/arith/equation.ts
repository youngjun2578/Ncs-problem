import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num, won } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { eulReul, eunNeun, gwaWa, iRa, ieyo } from '../common.js';

const CTX = [
  { a: '사과', b: '배', unit: '개', buy: '샀더니' },
  { a: '성인 입장권', b: '청소년 입장권', unit: '장', buy: '구매했더니' },
  { a: '볼펜', b: '형광펜', unit: '자루', buy: '주문했더니' },
  { a: '일반 택배', b: '특급 택배', unit: '건', buy: '접수했더니' },
];

/** 두 품목의 개수 */
function twoItems(rng: Rng): Generated {
  const c = rng.pick(CTX);
  let pa = 0, pb = 0, x = 0, y = 0;
  for (let i = 0; i < 300; i++) {
    pa = rng.int(5, 30) * 100;
    pb = rng.int(5, 30) * 100;
    x = rng.int(3, 15);
    y = rng.int(3, 15);
    if (pa !== pb && x !== y && Math.abs(pa - pb) >= 300) break;
  }
  if (pa < pb) [pa, pb] = [pb, pa];
  const n = x + y, T = pa * x + pb * y;
  const ask = rng.chance(0.5) ? 'a' : 'b';
  const target = ask === 'a' ? c.a : c.b;
  const ans = ask === 'a' ? x : y, other = ask === 'a' ? y : x;
  const text = rng.pick([
    `${eunNeun(c.a)} 한 ${c.unit}에 ${won(pa)}, ${eunNeun(c.b)} 한 ${c.unit}에 ${won(pb)}이다. 두 가지를 합쳐 ${eulReul(n + c.unit)} ${c.buy} ${won(T)}이었다. ${eunNeun(target)} 몇 ${c.unit}인가?`,
    `${c.a}(${c.unit}당 ${won(pa)})${gwaWa(c.a).slice(c.a.length)} ${c.b}(${c.unit}당 ${won(pb)})${eulReul(c.b).slice(c.b.length)} 모두 ${n}${c.unit} ${c.buy} 총액이 ${won(T)}이었다. 이때 ${target}의 수량은?`,
  ]);
  const p = ask === 'a' ? pa : pb;
  return {
    text,
    answer: ans,
    wrongs: [
      { value: other, mistakeTag: '구하는 대상 혼동' },
      { value: Math.round(n / 2), mistakeTag: '조건 누락' },
      { value: Math.round(T / p), mistakeTag: '조건 누락' },
      { value: Math.round(T / (pa + pb)), mistakeTag: '산술평균 착각' },
    ],
    format: (v) => `${num(v)}${c.unit}`,
    near: nearBy(ans, 1),
    steps: [
      `${eulReul(c.a)} x${c.unit}, ${eulReul(c.b)} ${iRa(`y${c.unit}`)} 하면 x + y = ${n}, ${num(pa)}x + ${num(pb)}y = ${num(T)}`,
      `(둘째 식) − ${num(pb)} × (첫째 식): ${num(pa - pb)}x = ${num(T - pb * n)} → x = ${x}`,
      `y = ${n} − ${x} = ${y}이므로 ${eunNeun(target)} ${ieyo(`${ans}${c.unit}`)}.`,
    ],
  };
}

/** 과부족 */
function shortage(rng: Rng): Generated {
  let s = 0, x = 0, y = 0, p = 0, q = 0;
  for (let i = 0; i < 300; i++) {
    s = rng.int(6, 30);
    x = rng.int(2, 6);
    y = x + rng.int(1, 3);
    p = rng.int(2, 20);
    q = s * (y - x) - p;
    if (q > 0 && q !== p && q < s * y) break;
  }
  const total = x * s + p;
  const [thing, who] = rng.pick([['사탕', '학생'], ['기념품', '참가자'], ['안내 책자', '방문객'], ['간식', '팀원']]);
  return {
    text: rng.pick([
      `${who}들에게 ${eulReul(thing)} 나누어 주는데, 한 명에게 ${x}개씩 주면 ${p}개가 남고 ${y}개씩 주면 ${q}개가 모자란다. ${eunNeun(who)} 모두 몇 명인가?`,
      `${eulReul(thing)} ${who} 한 명당 ${y}개씩 나눠 주려니 ${q}개가 부족해서, ${x}개씩 나눠 주었더니 ${p}개가 남았다. ${who} 수는 몇 명인가?`,
    ]),
    answer: s,
    wrongs: [
      { value: Math.round(Math.abs(p - q) / (y - x)), mistakeTag: '과부족 부호 혼동' },
      { value: total, mistakeTag: '구하는 대상 혼동' },
      { value: p + q, mistakeTag: '조건 누락' },
      { value: Math.round((p + q) / (x + y)), mistakeTag: '계산 실수' },
    ],
    format: (v) => `${num(v)}명`,
    near: nearBy(s, 1),
    steps: [
      `${who} 수를 n이라 하면 ${thing} 수는 ${x}n + ${p} = ${y}n − ${q}`,
      `(${y} − ${x})n = ${p} + ${q} → n = ${p + q} ÷ ${y - x} = ${s}명`,
      `남는 ${p}개와 모자라는 ${q}개를 더해야 해요. 빼면 부호를 혼동한 거예요.`,
    ],
  };
}

export const equation: Template = {
  id: 'arith.equation',
  area: 'arith',
  subtype: '간단한 방정식 응용',
  difficulty: 3,
  generate: (rng) => (rng.chance(0.5) ? twoItems(rng) : shortage(rng)),
};
