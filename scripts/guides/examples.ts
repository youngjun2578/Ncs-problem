/**
 * 가이드 글의 예제: 엔진이 고정 시드로 만든 문제를 쓰고, 풀이는 여기서 새로 쓴 계산 코드로 다시 계산한다.
 *  - 문제·보기·정답 위치는 엔진(makeProblem)이 만든 그대로
 *  - 풀이 문장과 중간 숫자는 아래 풀이 함수가 문제 문장·도표에서 수를 읽어 직접 계산한 값
 *  - 직접 계산한 답이 엔진의 정답 보기와 다르면 빌드를 멈춘다(코드 검산)
 *  - 엔진의 해설 문장을 그대로 쓰지 않았는지도 검사한다
 */
import { TEMPLATES } from '../../server/registry.js';
import { Rng } from '../../server/engine/rng.js';
import { makeProblem } from '../../server/engine/set.js';
import type { Problem } from '../../server/engine/types.js';
import { C, P, fact } from '../../server/engine/frac.js';
import { num } from '../../shared/format.js';
import type { ChartSpec, Figure } from '../../shared/charts/types.js';

export interface Solved {
  /** 풀이 단계(새로 쓴 문장) */
  steps: string[];
  /** 직접 계산한 정답 표시 */
  answer: string;
}

type Solver = (p: Problem) => Solved;

const toNum = (s: string) => Number(s.replace(/,/g, ''));
const all = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => toNum(m[1]));
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
function fracStr(n: number, d: number) {
  const g = gcd(n, d);
  return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`;
}
/**
 * 숫자 뒤 조사: 우리말로 읽었을 때 끝소리의 받침으로 고른다.
 * 끝자리 1 일·7 칠·8 팔(ㄹ 받침), 3 삼·6 육(받침), 0으로 끝나면 십·백·천·만(받침).
 */
function numBatchim(s: string): 'none' | 'rieul' | 'other' {
  const d = s.replace(/[^\d.]/g, '');
  const last = d[d.length - 1];
  if (last === '0') return 'other'; // 십·백·천·만 모두 받침이 있다(ㄹ 아님)
  if ('178'.includes(last)) return 'rieul'; // 일·칠·팔
  if ('36'.includes(last)) return 'other'; // 삼·육
  return 'none'; // 이·사·오·구
}
/** n + 조사. kind: 은/는, 이/가, 과/와, 으로/로, 을/를 */
export function jn(v: number | string, kind: '은' | '이' | '과' | '으로' | '을'): string {
  const s = typeof v === 'number' ? num(v) : v;
  const b = numBatchim(s);
  const has = b !== 'none';
  const pick = { 은: has ? '은' : '는', 이: has ? '이' : '가', 과: has ? '과' : '와', 으로: has && b !== 'rieul' ? '으로' : '로', 을: has ? '을' : '를' }[kind];
  return s + pick;
}

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`예제 풀이: ${msg}`);
}

/** 도표에서 (이름, 값) 목록 */
function figureSeries(f: Figure | undefined): { labels: string[]; values: number[] } {
  need(f, '도표가 없음');
  if (f.kind === 'chart') {
    const s = f.spec as Exclude<ChartSpec, { type: 'scatter' }>;
    return { labels: s.labels, values: s.values };
  }
  const t = f.table;
  if (t.rows.length === 1) return { labels: t.head.slice(1), values: t.rows[0].slice(1) as number[] };
  return { labels: t.rows.map((r) => String(r[0])), values: t.rows.map((r) => r[1] as number) };
}

const SOLVERS: Record<string, { match: RegExp; solve: Solver }[]> = {
  'arith.speed': [
    {
      // 왕복 평균 속력
      match: /평균 속력/,
      solve(p) {
        const [v1, v2] = all(/시속 ([\d.]+)km/g, p.text);
        // 소수 속력도 다룰 수 있게 10배로 올려 최소공배수를 구한다
        const d = lcm(v1 * 10, v2 * 10) / 10;
        const t1 = d / v1, t2 = d / v2;
        const ans = (2 * d) / (t1 + t2);
        return {
          steps: [
            `편도 거리를 계산하기 쉬운 값으로 정합니다. 두 속력 ${jn(v1, '과')} ${jn(v2, '으로')} 모두 나누어떨어지는 ${num(d)}km를 편도 거리로 둡니다.`,
            `갈 때 걸린 시간은 ${num(d)} ÷ ${num(v1)} = ${num(t1)}시간, 올 때 걸린 시간은 ${num(d)} ÷ ${num(v2)} = ${num(t2)}시간입니다.`,
            `왕복 거리는 ${num(2 * d)}km, 왕복에 걸린 시간은 ${num(t1)} + ${num(t2)} = ${num(t1 + t2)}시간입니다.`,
            `평균 속력은 전체 거리 ÷ 전체 시간 = ${num(2 * d)} ÷ ${num(t1 + t2)} = 시속 ${num(ans)}km입니다.`,
          ],
          answer: `시속 ${num(ans)}km`,
        };
      },
    },
    {
      // 마주 보고 출발해서 만나기
      match: /만나/,
      solve(p) {
        const D = toNum(p.text.match(/([\d.,]+)km(?:인| 떨어진|이다)/)![1]);
        const [a, b] = all(/시속 ([\d.]+)km/g, p.text);
        const t = D / (a + b);
        return {
          steps: [
            `${/차량/.test(p.text) ? '두 차량' : '두 사람'}이 서로를 향해 움직이므로, 1시간마다 둘 사이의 거리는 ${num(a)} + ${num(b)} = ${num(a + b)}km씩 줄어듭니다.`,
            `처음 떨어진 거리 ${num(D)}km가 모두 줄어들 때 만나므로, 걸리는 시간은 ${num(D)} ÷ ${num(a + b)} = ${num(t)}시간입니다.`,
            `문제는 분 단위로 물으므로 ${num(t)} × 60 = ${num(t * 60)}분입니다.`,
          ],
          answer: `${num(t * 60)}분`,
        };
      },
    },
  ],
  'arith.concentration': [
    {
      match: /섞/,
      solve(p) {
        const ms = [...p.text.matchAll(/([\d.]+)%\s*(?:의\s*)?(소금|설탕)물\s*([\d,]+)g/g)];
        need(ms.length === 2, '섞기: 두 용액을 찾지 못함');
        const sub = ms[0][2];
        const [[a, x], [b, y]] = ms.map((m) => [toNum(m[1]), toNum(m[3])]);
        const s1 = (x * a) / 100, s2 = (y * b) / 100;
        const ans = ((s1 + s2) / (x + y)) * 100;
        return {
          steps: [
            `두 ${sub}물에 들어 있는 ${sub}의 양을 따로 구합니다. ${num(x)}g의 ${num(a)}%는 ${num(s1)}g, ${num(y)}g의 ${num(b)}%는 ${num(s2)}g입니다.`,
            `섞으면 ${sub}은 ${num(s1)} + ${num(s2)} = ${num(s1 + s2)}g, ${sub}물 전체는 ${num(x)} + ${num(y)} = ${num(x + y)}g입니다.`,
            `농도는 ${num(s1 + s2)} ÷ ${num(x + y)} × 100 = ${num(ans)}%입니다.`,
          ],
          answer: `${num(ans)}%`,
        };
      },
    },
    {
      match: /물 [\d,]+g을 (?:더 넣|부어)/,
      solve(p) {
        const m = p.text.match(/([\d.]+)%\s*(?:의\s*)?(소금|설탕)물\s*([\d,]+)g/)!;
        const [a, sub, x] = [toNum(m[1]), m[2], toNum(m[3])];
        const w = toNum(p.text.match(/(?<!소금|설탕)물 ([\d,]+)g을/)![1]);
        const s = (x * a) / 100;
        const ans = (s / (x + w)) * 100;
        return {
          steps: [
            `물을 넣기 전 ${sub}의 양은 ${num(x)} × ${num(a)} ÷ 100 = ${num(s)}g입니다. 물을 넣어도 이 양은 변하지 않습니다.`,
            `${sub}물 전체는 물이 더해진 만큼 늘어 ${num(x)} + ${num(w)} = ${num(x + w)}g이 됩니다.`,
            `새 농도는 ${num(s)} ÷ ${num(x + w)} × 100 = ${num(ans)}%입니다.`,
          ],
          answer: `${num(ans)}%`,
        };
      },
    },
    {
      match: /증발/,
      solve(p) {
        const m = p.text.match(/([\d.]+)%\s*(?:의\s*)?(소금|설탕)물\s*([\d,]+)g/)!;
        const [a, sub, x] = [toNum(m[1]), m[2], toNum(m[3])];
        const w = toNum(p.text.match(/(?<!소금|설탕)물 ([\d,]+)g/)![1]);
        const s = (x * a) / 100;
        const ans = (s / (x - w)) * 100;
        return {
          steps: [
            `처음 ${sub}의 양은 ${num(x)} × ${num(a)} ÷ 100 = ${num(s)}g입니다. 날아가는 것은 물뿐이므로 이 값은 그대로입니다.`,
            `증발한 뒤 ${sub}물 전체는 ${num(x)} − ${num(w)} = ${num(x - w)}g입니다.`,
            `농도는 ${num(s)} ÷ ${num(x - w)} × 100 = ${num(ans)}%로 처음보다 진해집니다.`,
          ],
          answer: `${num(ans)}%`,
        };
      },
    },
  ],
  'arith.work': [
    {
      // 함께 하면 며칠
      match: /함께 하면|동시에 열면|처음부터 둘이/,
      solve(p) {
        const [a, b] = all(/(\d+)(?:일|시간)/g, p.text);
        const unit = /시간/.test(p.text) ? '시간' : '일';
        const per = unit === '일' ? '하루' : '한 시간';
        // 분모는 두 기간의 최소공배수로 맞춘다(기본 해설과 같은 방식)
        const L = lcm(a, b);
        const sum = L / a + L / b;
        const g = gcd(sum, L);
        const [rn, rd] = [sum / g, L / g];
        const ans = (a * b) / (a + b);
        need(rd / rn === ans, '일의 양: 약분한 하루치와 답이 맞지 않음');
        return {
          steps: [
            `해야 할 일 전체를 1로 둡니다. 혼자 ${a}${unit} 걸리면 ${per}에 1/${a}, 혼자 ${b}${unit} 걸리면 ${per}에 1/${b}만큼 합니다.`,
            `함께 하면 ${per}에 1/${a} + 1/${b}만큼 합니다. 분모를 ${jn(a, '과')} ${b}의 최소공배수 ${jn(L, '으로')} 맞추면 ${L / a}/${L} + ${L / b}/${L} = ${sum}/${L}${g > 1 ? ` = ${rn}/${rd}` : ''}입니다.`,
            `1을 채우는 데 걸리는 기간은 1 ÷ ${rn}/${rd}${rn === 1 ? '' : ` = ${rd}/${rn}`} = ${num(ans)}${unit}입니다.`,
          ],
          answer: `${num(ans)}${unit}`,
        };
      },
    },
    {
      // 함께 하다가 한 사람이 마무리
      match: /혼자 (?:마무리|일해서)/,
      solve(p) {
        const [a, b, k] = all(/(\d+)일/g, p.text);
        const L = lcm(a, b);
        const pa = L / a, pb = L / b;
        const done = k * (pa + pb);
        const rest = L - done;
        const ans = rest / pa;
        need(Number.isInteger(ans), '일의 양: 정수가 아님');
        return {
          steps: [
            `전체 일 1을 ${jn(a, '과')} ${b}의 최소공배수인 ${L}칸으로 나눠 생각합니다. 그러면 ${a}일 걸리는 사람은 하루 ${pa}칸, ${b}일 걸리는 사람은 하루 ${pb}칸을 합니다.`,
            `둘이 함께 ${k}일 동안 한 일은 ${k} × (${pa} + ${pb}) = ${done}칸입니다.`,
            `남은 일은 ${L} − ${done} = ${rest}칸입니다.`,
            `남은 일은 하루 ${pa}칸씩 하는 사람이 혼자 했으므로 ${rest} ÷ ${pa} = ${ans}일이 걸렸습니다.`,
          ],
          answer: `${num(ans)}일`,
        };
      },
    },
  ],
  'arith.rate': [
    // 연속 증감이 먼저: '처음 대비 증가율' 문장도 아래 증가율 형태에 걸리므로
    {
      match: /오른 뒤|증가하고/,
      solve(p) {
        const x = toNum(p.text.match(/([\d.]+)% (?:오른|증가)/)![1]);
        const y = toNum(p.text.match(/([\d.]+)% (?:내렸|감소)/)![1]);
        const v1 = 100 * (1 + x / 100);
        const v2 = v1 * (1 - y / 100);
        const net = r1(v2 - 100);
        return {
          steps: [
            `처음 값을 100으로 놓고 차례대로 바꿉니다.`,
            `${num(x)}% 오르면 100 × ${num(1 + x / 100)} = ${num(v1)}입니다.`,
            `두 번째 변화의 기준은 처음 값이 아니라 오른 뒤의 값 ${num(v1)}입니다. ${num(y)}% 내리면 ${num(v1)} × ${num(r2(1 - y / 100))} = ${num(v2)}입니다.`,
            `처음 100과 비교하면 ${num(v2)} − 100 = ${num(net)}이므로 ${num(net)}% 올랐습니다.`,
          ],
          answer: `${num(net)}%`,
        };
      },
    },
    {
      match: /(증가율|감소율)/,
      solve(p) {
        const A = toNum(p.text.match(/작년 ([\d,.]+)/)![1]);
        const B = toNum(p.text.match(/올해 ([\d,.]+)/)![1]);
        const up = B > A;
        const d = Math.abs(B - A);
        const r = (d / A) * 100;
        return {
          steps: [
            `비교의 기준은 작년 값 ${num(A)}입니다. 올해 값 ${jn(B, '은')} 기준과 견주어 볼 대상입니다.`,
            `변화한 양은 ${num(B)} − ${num(A)} = ${up ? '' : '−'}${num(d)}입니다. 작년보다 ${up ? '늘었' : '줄었'}습니다.`,
            `${up ? '증가율' : '감소율'} = 변화량 ÷ 기준값 × 100 = ${num(d)} ÷ ${num(A)} × 100 = ${num(r)}%입니다.`,
          ],
          answer: `${num(r)}%`,
        };
      },
    },
  ],
  'chartRead.growth': [
    {
      match: /년/,
      solve(p) {
        const ys = all(/(\d{4})년/g, p.text);
        const s = figureSeries(p.figure);
        const years = s.labels.map((l) => toNum(l.replace('년', '')));
        // "~년의 전년 대비"처럼 연도가 하나만 나오면 그 앞해가 기준
        const [y0, y1] = ys.length >= 2 ? [ys[0], ys[1]] : [ys[0] - 1, ys[0]];
        const a = s.values[years.indexOf(y0)], b = s.values[years.indexOf(y1)];
        need(a !== undefined && b !== undefined, '증감률: 연도 값을 찾지 못함');
        const d = Math.abs(b - a);
        const r = (d / a) * 100;
        return {
          steps: [
            `자료에서 두 해의 값을 찾습니다. ${y0}년은 ${num(a)}, ${y1}년은 ${num(b)}입니다.`,
            `앞선 해(${y0}년)가 기준입니다. 변화량은 ${num(d)}${b > a ? ' 증가' : ' 감소'}입니다.`,
            `증감률 = ${num(d)} ÷ ${num(a)} × 100 = ${num(r)}%입니다.`,
          ],
          answer: `${num(r)}%`,
        };
      },
    },
  ],
  'chartRead.pointPct': [
    {
      match: /%p/,
      solve(p) {
        need(p.figure?.kind === 'table', '%p: 표가 아님');
        const t = p.figure.table;
        const row = t.rows.find((r) => p.text.includes(String(r[0])))!;
        const [name, s1, s2] = [String(row[0]), row[1] as number, row[2] as number];
        return {
          steps: [
            `표에서 ${name}의 점유율을 찾습니다. ${t.head[1]} ${s1}%, ${t.head[2]} ${s2}%입니다.`,
            `두 비율의 차이는 ${s2} − ${s1} = ${s2 - s1}입니다. 비율끼리 뺀 값이므로 단위는 %p입니다.`,
          ],
          answer: `${num(s2 - s1)}%p`,
        };
      },
    },
    {
      match: /증가율|% 증가했는가/,
      solve(p) {
        need(p.figure?.kind === 'table', '%: 표가 아님');
        const t = p.figure.table;
        const row = t.rows.find((r) => p.text.includes(String(r[0])))!;
        const [name, s1, s2] = [String(row[0]), row[1] as number, row[2] as number];
        const r = ((s2 - s1) / s1) * 100;
        return {
          steps: [
            `${name}의 점유율은 ${t.head[1]} ${s1}%에서 ${t.head[2]} ${s2}%로 바뀌었습니다. 차이는 ${s2 - s1}%p입니다.`,
            `문제는 점유율 자체가 몇 % 늘었는지(증가율)를 묻습니다. 기준은 처음 점유율 ${s1}%입니다.`,
            `증가율 = ${s2 - s1} ÷ ${s1} × 100 = ${num(r)}%입니다.`,
          ],
          answer: `${num(r)}%`,
        };
      },
    },
  ],
  'chartRead.share': [
    {
      match: /./,
      solve(p) {
        const s = figureSeries(p.figure);
        const i = s.labels.findIndex((l) => p.text.includes(l));
        need(i >= 0, '비중: 항목을 찾지 못함');
        const total = s.values.reduce((x, y) => x + y, 0);
        const ans = r1((s.values[i] / total) * 100);
        return {
          steps: [
            `먼저 전체를 구합니다. 모든 항목을 더하면 ${s.values.map(num).join(' + ')} = ${num(total)}입니다.`,
            `${s.labels[i]}의 값은 ${num(s.values[i])}입니다.`,
            `비중 = ${num(s.values[i])} ÷ ${num(total)} × 100 = ${num(ans)}%입니다.`,
          ],
          answer: `${num(ans)}%`,
        };
      },
    },
  ],
  'stats.mean': [
    {
      // 인원이 다른 두 집단의 전체 평균
      match: /전체/,
      solve(p) {
        const [n1, n2] = all(/(\d+)명/g, p.text);
        const [a, b] = all(/([\d.]+)점/g, p.text);
        const s = n1 * a + n2 * b;
        const ans = s / (n1 + n2);
        return {
          steps: [
            `평균에 인원을 곱해 집단별 총점을 구합니다. ${n1} × ${a} = ${num(n1 * a)}점, ${n2} × ${b} = ${num(n2 * b)}점입니다.`,
            `두 집단을 합친 총점은 ${num(s)}점, 인원은 ${n1 + n2}명입니다.`,
            `전체 평균 = ${num(s)} ÷ ${n1 + n2} = ${num(ans)}점입니다.`,
          ],
          answer: `${num(ans)}점`,
        };
      },
    },
    {
      // 목표 평균을 맞추려면 다음 점수는
      match: /올리려면|되려면/,
      solve(p) {
        const n = toNum(p.text.match(/(\d+)(?:번|회)/)![1]);
        const [m, M] = all(/(\d+)점/g, p.text);
        const gap = M - m;
        const x = M + n * gap;
        return {
          steps: [
            `지금까지 ${n}번의 평균은 ${m}점으로, 목표 ${M}점보다 한 번에 ${gap}점씩 모자랍니다.`,
            `${n}번 동안 모자란 점수를 모두 더하면 ${n} × ${gap} = ${n * gap}점입니다.`,
            `다음 시험은 목표 평균 ${M}점에 모자란 ${n * gap}점까지 채워야 하므로 ${M} + ${n * gap} = ${x}점이 필요합니다.`,
            `확인: (${n} × ${m} + ${x}) ÷ ${n + 1} = ${(n * m + x) / (n + 1)}점으로 목표와 같습니다.`,
          ],
          answer: `${num(x)}점`,
        };
      },
    },
  ],
  'stats.median': [
    {
      match: /중앙값/,
      solve(p) {
        const list = p.text.match(/(\d+(?:, \d+)+)/)![1].split(', ').map(Number);
        const unit = p.text.match(/\d(분|건|개)/)?.[1] ?? '';
        const s = list.slice().sort((a, b) => a - b);
        const n = s.length;
        const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
        const mean = r1(list.reduce((a, b) => a + b, 0) / n);
        return {
          steps: [
            `값을 작은 것부터 늘어놓습니다: ${s.join(', ')}. 모두 ${n}개입니다.`,
            n % 2
              ? `개수가 홀수이므로 한가운데인 ${(n + 1) / 2}번째 값 ${med}${unit}${unit === '개' ? '가' : '이'} 중앙값입니다.`
              : `개수가 짝수이므로 가운데 두 값 ${jn(s[n / 2 - 1], '과')} ${s[n / 2]}의 평균 ${num(med)}${unit}${unit === '개' ? '가' : '이'} 중앙값입니다.`,
            `같은 자료의 평균은 ${num(mean)}${unit}입니다. 중앙값과 평균이 다를 수 있으므로 문제가 어느 쪽을 묻는지 확인합니다.`,
          ],
          answer: `${num(med)}${unit}`,
        };
      },
    },
  ],
  'stats.permcomb': [
    {
      match: /회장|발표자/,
      solve(p) {
        const n = toNum(p.text.match(/(\d+)명/)![1]);
        return {
          steps: [
            `두 자리는 맡는 역할이 다릅니다. 같은 두 사람이라도 자리를 바꾸면 다른 결과이므로 순서를 따지는 경우(순열)입니다.`,
            `첫 번째 자리에 올 사람은 ${n}명, 두 번째 자리는 남은 ${n - 1}명 중에서 고릅니다.`,
            `${n} × ${n - 1} = ${P(n, 2)}가지입니다.`,
          ],
          answer: `${num(P(n, 2))}가지`,
        };
      },
    },
    {
      match: /대표 2명|2명을 고르/,
      solve(p) {
        const n = toNum(p.text.match(/(\d+)명/)![1]);
        return {
          steps: [
            `뽑힌 두 사람은 같은 자격이므로, 누구를 먼저 골랐는지는 결과에 영향이 없습니다(조합).`,
            `순서를 따져 세면 ${n} × ${n - 1} = ${P(n, 2)}가지인데, 같은 두 사람이 순서만 바뀐 경우가 2번씩 들어 있습니다.`,
            `그래서 2로 나눕니다: ${P(n, 2)} ÷ 2 = ${C(n, 2)}가지입니다.`,
          ],
          answer: `${num(C(n, 2))}가지`,
        };
      },
    },
    {
      match: /위원회|TF/,
      solve(p) {
        const [m, w] = all(/(\d+)명/g, p.text);
        return {
          steps: [
            `첫 번째 집단 ${m}명에서 2명을 고르는 방법: 역할 구분이 없으므로 조합, ${m} × ${m - 1} ÷ 2 = ${C(m, 2)}가지입니다.`,
            `두 번째 집단 ${w}명에서 1명을 고르는 방법: ${w}가지입니다.`,
            `두 선택을 모두 해야 한 팀이 되므로 곱합니다: ${C(m, 2)} × ${w} = ${C(m, 2) * w}가지입니다.`,
          ],
          answer: `${num(C(m, 2) * w)}가지`,
        };
      },
    },
    {
      match: /이웃|나란히/,
      solve(p) {
        const n = toNum(p.text.match(/(\d+)명/)![1]);
        return {
          steps: [
            `붙어 있어야 하는 두 사람을 한 덩어리로 묶으면, 줄 세울 대상은 ${n - 1}개가 됩니다.`,
            `${n - 1}개를 한 줄로 세우는 방법은 ${n - 1}! = ${fact(n - 1)}가지입니다.`,
            `덩어리 안에서 두 사람이 자리를 바꾸는 2가지를 곱합니다: ${fact(n - 1)} × 2 = ${2 * fact(n - 1)}가지입니다.`,
          ],
          answer: `${num(2 * fact(n - 1))}가지`,
        };
      },
    },
  ],
  'stats.probability': [
    {
      match: /2개를|한 개를 더/,
      solve(p) {
        const [r, b] = all(/(\d+)개/g, p.text);
        const n = r + b;
        const want = p.text.match(/모두 (.+?)일 확률/)?.[1] ?? '구하는 쪽';
        return {
          steps: [
            `전체 ${n}개에서 2개를 고르는 방법은 ${n} × ${n - 1} ÷ 2 = ${C(n, 2)}가지입니다.`,
            `${want} ${r}개에서 2개를 고르는 방법은 ${r} × ${r - 1} ÷ 2 = ${C(r, 2)}가지입니다.`,
            gcd(C(r, 2), C(n, 2)) > 1
              ? `확률은 ${C(r, 2)}/${C(n, 2)}입니다. 분자와 분모를 최대공약수 ${jn(gcd(C(r, 2), C(n, 2)), '으로')} 나누면 ${fracStr(C(r, 2), C(n, 2))}입니다.`
              : `확률은 ${C(r, 2)}/${C(n, 2)}입니다. 분자와 분모의 최대공약수가 1이므로 더 줄일 수 없습니다.`,
          ],
          answer: fracStr(C(r, 2), C(n, 2)),
        };
      },
    },
    {
      match: /주사위.*적어도|한 번이라도/,
      solve(p) {
        const k = toNum(p.text.match(/(\d+)번/)![1]);
        const face = p.text.match(/(\d)의 눈/)![1];
        const tot = 6 ** k, miss = 5 ** k;
        return {
          steps: [
            `"적어도 한 번"은 경우가 여러 갈래라 직접 세기 번거롭습니다. 반대 경우인 "${k}번 모두 ${jn(face, '이')} 아닌 눈"을 먼저 셉니다.`,
            `한 번 던질 때 ${jn(face, '이')} 아닌 눈은 5가지이므로, ${k}번 모두 아닌 경우는 ${Array(k).fill(5).join(' × ')} = ${miss}가지, 전체는 ${Array(k).fill(6).join(' × ')} = ${tot}가지입니다.`,
            `구하는 확률은 1 − ${miss}/${tot} = ${tot - miss}/${tot}${fracStr(tot - miss, tot) !== `${tot - miss}/${tot}` ? ` = ${fracStr(tot - miss, tot)}` : ''}입니다.`,
          ],
          answer: fracStr(tot - miss, tot),
        };
      },
    },
    {
      match: /눈의 합|두 눈의 합/,
      solve(p) {
        const s = toNum(p.text.match(/합이 (\d+)/)![1]);
        const pairs: string[] = [];
        for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === s) pairs.push(`(${a}, ${b})`);
        return {
          steps: [
            `두 주사위는 서로 구별되므로 전체 경우는 6 × 6 = 36가지입니다.`,
            `합이 ${s}인 경우를 모두 적습니다: ${pairs.join(', ')} → ${pairs.length}가지입니다.`,
            `확률은 ${pairs.length}/36${fracStr(pairs.length, 36) !== `${pairs.length}/36` ? ` = ${fracStr(pairs.length, 36)}` : ''}입니다.`,
          ],
          answer: fracStr(pairs.length, 36),
        };
      },
    },
  ],
  'chartMake.typeFit': [
    {
      match: /./,
      solve(p) {
        const type = p.choices[p.answerIndex].chart?.type;
        // 문제 문장만 보고 목적을 따로 판단해 엔진 정답과 맞는지 검산한다
        const purpose = /관계|관련성|함께 커지는/.test(p.text) ? 'scatter' : /비율|비중|몫|구성비/.test(p.text) ? 'pie' : /흐름|추이|늘었는지|변해/.test(p.text) ? 'line' : null;
        need(purpose === type, `그래프 종류: 문장으로 판단한 목적(${purpose})과 엔진 정답(${type})이 다름`);
        const why: Record<string, [string, string]> = {
          line: ['시간에 따라 값이 어떻게 변했는지(흐름)', '시점을 순서대로 이어 오르내림이 선으로 드러나는 꺾은선그래프'],
          pie: ['전체 가운데 각 부분이 차지하는 몫(구성비)', '전체를 하나의 원으로 놓고 몫을 조각 크기로 보여 주는 원그래프'],
          scatter: ['두 수치가 함께 움직이는지(관계)', '한 축에 한 수치씩 놓고 점을 찍어 분포를 보는 점그래프'],
        };
        need(type && why[type], '그래프 종류: 예상하지 못한 정답 유형');
        const name: Record<string, string> = { line: '꺾은선그래프', pie: '원그래프', scatter: '점그래프' };
        return {
          steps: [`문제에서 보여 주려는 것은 ${why[type][0]}입니다.`, `이 목적에 맞는 것은 ${why[type][1]}입니다.`],
          answer: name[type],
        };
      },
    },
  ],
};

export interface Example {
  templateId: string;
  seed: number;
  problem: Problem;
  solved: Solved;
}

/** 템플릿 id와 시드로 예제를 만들고 검산한다. variant: 풀이 함수의 match와 맞아야 한다. */
export function buildExample(templateId: string, seed: number): Example {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  need(tpl, `없는 템플릿 ${templateId}`);
  const problem = makeProblem(tpl, new Rng(seed));
  const solver = SOLVERS[templateId]?.find((s) => s.match.test(problem.text));
  need(solver, `${templateId} 시드 ${seed}: 이 문제 형태의 풀이 함수가 없음 — ${problem.text.slice(0, 40)}`);
  const solved = solver.solve(problem);
  // 코드 검산: 직접 계산한 답 = 엔진의 정답 보기
  const correct = problem.choices[problem.answerIndex];
  const engineAnswer = templateId === 'chartMake.typeFit' ? null : correct.label;
  if (engineAnswer !== null) need(engineAnswer === solved.answer, `${templateId} 시드 ${seed}: 검산 불일치 (엔진 ${engineAnswer}, 계산 ${solved.answer})`);
  // 엔진 해설 문장을 그대로 쓰지 않았는지
  for (const s of solved.steps) need(!problem.steps.includes(s), `${templateId} 시드 ${seed}: 엔진 해설 문장과 같은 풀이 문장`);
  return { templateId, seed, problem, solved };
}

/** 개발용: 원하는 형태의 문제가 나오는 시드 찾기 */
export function findSeeds(templateId: string, match: RegExp, count = 5, from = 1): number[] {
  const tpl = TEMPLATES.find((t) => t.id === templateId)!;
  const out: number[] = [];
  for (let s = from; out.length < count && s < from + 20000; s++) {
    try {
      const p = makeProblem(tpl, new Rng(s));
      if (match.test(p.text)) {
        buildExample(templateId, s);
        out.push(s);
      }
    } catch {
      // 맞지 않는 시드
    }
  }
  return out;
}
