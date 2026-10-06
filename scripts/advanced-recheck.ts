/**
 * 심화 문제 독립 풀이 검산. 실패하면 exit 1.
 *   npx tsx scripts/advanced-recheck.ts            (템플릿마다 시드 3,000개)
 *
 * 생성 코드의 계산을 가져다 쓰지 않는다. 화면에 보이는 문제 문장과 표만 읽어서 다른 방법으로 다시 푼다.
 *  - 시뮬레이션: 하루씩 일하기, 물·용질을 따로 추적하기, 해마다 값을 굴려 보기
 *  - 전수 조사: 줄 세우기 순열 전부 세기, 꺼내는 경우 전부 세기
 *  - 탐색: 원가·처음 값·집단 평균을 후보에서 찾아 조건과 맞추기
 * 그다음 엔진이 정한 정답 보기와 대조한다.
 */
import { ADVANCED_TEMPLATES } from '../server/advanced/registry.js';
import { makeProblem } from '../server/engine/set.js';
import { Rng } from '../server/engine/rng.js';
import type { Problem } from '../server/engine/types.js';
import type { TableSpec } from '../shared/charts/types.js';

const PER_TEMPLATE = Number(process.env.ADV_RECHECK ?? 3000);

/** 기약분수(독립 구현) */
class Q {
  constructor(
    public n: number,
    public d: number,
  ) {
    const g = Q.g(Math.abs(n), Math.abs(d)) || 1;
    this.n = n / g;
    this.d = d / g;
  }
  static g(a: number, b: number): number {
    return b ? Q.g(b, a % b) : a;
  }
  add(o: Q) {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  cmp(o: Q) {
    return this.n * o.d - o.n * this.d;
  }
  toString() {
    return this.d === 1 ? String(this.n) : `${this.n}/${this.d}`;
  }
}

const N = (s: string) => Number(s.replace(/,/g, ''));
const m1 = (re: RegExp, s: string) => {
  const m = s.match(re);
  if (!m) throw new Error(`문장에서 값을 찾지 못함: ${re}`);
  return m;
};
const all = (re: RegExp, s: string) => [...s.matchAll(re)];
const table = (p: Problem): TableSpec => {
  if (p.figure?.kind !== 'table') throw new Error('표 없음');
  return p.figure.table;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const labelNum = (label: string) => N(label.match(/[\d,]+(\.\d+)?/)![0]);
const parseSigned = (s: string | number) => (typeof s === 'number' ? s : Number(String(s).replace('+', '').replace('−', '-')));

/** 정답 확인 결과: 숫자형은 값, 확률은 분수 문자열, 그래프는 값 배열 */
type Expect = { num: number } | { frac: string } | { values: number[] };

const solvers: Record<string, (p: Problem) => Expect> = {
  'adv.arith.speedRest'(p) {
    const t = p.text;
    const speeds = all(/시속 (\d+)km/g, t).map((m) => N(m[1]));
    const dists = all(/(?<!시속 )(\d+)km(?!로)/g, t).map((m) => N(m[1]));
    const rest = N(m1(/(\d+)분/, t)[1]);
    // 분 단위로 시간 누적
    let minutes = rest;
    for (let i = 0; i < 2; i++) minutes += (dists[i] * 60) / speeds[i];
    return { num: Math.round(((dists[0] + dists[1]) / minutes) * 60 * 10) / 10 };
  },
  'adv.arith.mixThenChange'(p) {
    const t = p.text;
    const pairs = all(/(\d+)%[^\d%]{0,14}?(\d+)g/g, t).slice(0, 2).map((m) => [N(m[1]), N(m[2])]);
    const w = m1(/물 (\d+)g을 (증발|더 넣)/, t);
    // 용질과 물을 따로 추적한다
    let solute = 0, water = 0;
    for (const [c, g] of pairs) {
      solute += (g * c) / 100;
      water += g - (g * c) / 100;
    }
    water += w[2] === '증발' ? -N(w[1]) : N(w[1]);
    return { num: Math.round((solute / (solute + water)) * 1000) / 10 };
  },
  'adv.arith.workLeave'(p) {
    const t = p.text;
    const [a, b, c] = ['A', 'B', 'C'].map((x) => N(m1(new RegExp(`${x}(?:는)? (\\d+)일`), t)[1]));
    const d = N(m1(/함께 (\d+)일 동안|처음 (\d+)일은|(\d+)일 뒤부터/, t).slice(1).find(Boolean)!);
    // 하루씩 일한 양을 분수로 더해 간다
    let done = new Q(0, 1), day = 0;
    const one = new Q(1, 1);
    while (done.cmp(one) < 0) {
      day++;
      done = done.add(new Q(1, a)).add(new Q(1, b));
      if (day <= d) done = done.add(new Q(1, c));
      if (day > 1000) throw new Error('끝나지 않음');
    }
    if (done.cmp(one) !== 0) throw new Error('하루 단위로 딱 맞게 끝나지 않음');
    return { num: /모두 며칠/.test(t) ? day : day - d };
  },
  'adv.arith.profitChain'(p) {
    const t = p.text;
    const mk = /원가의 (\d+)%만큼|원가보다 (\d+)%/.test(t) ? N(m1(/원가의 (\d+)%만큼|원가보다 (\d+)%/, t).slice(1).find(Boolean)!) : N(m1(/정가는 원가의 (\d+)%/, t)[1]) - 100;
    const dc = /정가의 (\d+)%를 할인|정가에서 (\d+)%를? 할인/.test(t)
      ? N(m1(/정가의 (\d+)%를 할인|정가에서 (\d+)%를? 할인/, t).slice(1).find(Boolean)!)
      : 100 - N(m1(/판매가는 정가의 (\d+)%/, t)[1]);
    const sell = (cost: number) => (((cost * (100 + mk)) / 100) * (100 - dc)) / 100;
    if (/이익률/.test(t.slice(-40))) {
      const cost = N(m1(/원가가? ([\d,]+)원/, t)[1]);
      return { num: Math.round(((sell(cost) - cost) / cost) * 1000) / 10 };
    }
    const profit = N(m1(/([\d,]+)원의 이익|([\d,]+)원을 남겼다|이익은 ([\d,]+)원/, t).slice(1).find(Boolean)!);
    // 원가 후보를 1,000원 단위로 훑어 이익이 맞는 값을 찾는다
    for (let cost = 1000; cost <= 1_000_000; cost += 1000) if (near(sell(cost) - cost, profit)) return { num: cost };
    throw new Error('원가를 찾지 못함');
  },
  'adv.stats.drawThree'(p) {
    const t = p.text;
    const counts = all(/(\S+) (공|카드|제품) (\d+)개/g, t).slice(0, 2).map((m) => N(m[3]));
    const [a, b] = counts;
    // 구별되는 물건 a + b개에서 3개를 고르는 모든 조합을 센다
    let good = 0, total = 0;
    const n = a + b;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++) {
          total++;
          const red = [i, j, k].filter((x) => x < a).length;
          if (/정확히 2개/.test(t) ? red === 2 : red >= 1) good++;
        }
    return { frac: new Q(good, total).toString() };
  },
  'adv.stats.lineConditions'(p) {
    const t = p.text;
    const n = N(m1(/(\d+)명/, t)[1]);
    const people = Array.from({ length: n }, (_, i) => i); // 0=A, 1=B, 2=C
    const adj = (perm: number[], x: number, y: number) => Math.abs(perm.indexOf(x) - perm.indexOf(y)) === 1;
    const ok = (perm: number[]) => {
      if (/A와 B가 서로 이웃하지 않는/.test(t)) return !adj(perm, 0, 1);
      if (/A는 맨 앞에 서고, B와 C는 서로 이웃하는/.test(t)) return perm[0] === 0 && adj(perm, 1, 2);
      if (/C는 양 끝에 서지 않는/.test(t)) return adj(perm, 0, 1) && perm[0] !== 2 && perm[n - 1] !== 2;
      if (/C는 맨 앞에 서지 않는/.test(t)) return adj(perm, 0, 1) && perm[0] !== 2;
      throw new Error('조건을 읽지 못함');
    };
    let count = 0;
    const permute = (rest: number[], cur: number[]) => {
      if (!rest.length) {
        if (ok(cur)) count++;
        return;
      }
      for (let i = 0; i < rest.length; i++) permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...cur, rest[i]]);
    };
    permute(people, []);
    return { num: count };
  },
  'adv.stats.groupMean'(p) {
    const t = p.text;
    // '전체 N명'은 집단 인원이 아니므로 뺀다
    const [n1, n2] = all(/(전체 )?(\d+)명/g, t).filter((m) => !m[1]).map((m) => N(m[2]));
    if (/전체 평균은|평균 점수가|합친 전체 평균이/.test(t) && /평균은 몇 점인가\?$|평균은\?$|평균 점수를 구하면\?$/.test(t) && /전체 평균은 ([\d.]+)점|평균 점수가 ([\d.]+)점|전체 평균이 ([\d.]+)점/.test(t)) {
      const M = N(m1(/전체 평균은 ([\d.]+)점|평균 점수가 ([\d.]+)점|전체 평균이 ([\d.]+)점/, t).slice(1).find(Boolean)!);
      const m1v = N(m1(/평균은 (\d+)점이다|평균이 (\d+)점이면|평균이 (\d+)점이고/, t).slice(1).find(Boolean)!);
      // 둘째 집단 평균을 0~100 정수에서 찾아 전체 평균과 맞춘다
      for (let m2 = 0; m2 <= 100; m2++) if (near((n1 * m1v + n2 * m2) / (n1 + n2), M)) return { num: m2 };
      throw new Error('평균을 찾지 못함');
    }
    const means = all(/평균(?:은|이)? (\d+)점/g, t).map((m) => N(m[1]));
    const [a, b] = means;
    // 한 사람씩 점수를 늘어놓아 평균을 구한다
    const scores = [...Array(n1).fill(a), ...Array(n2).fill(b)];
    return { num: Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 };
  },
  'adv.stats.fixRecord'(p) {
    const t = p.text;
    if (/중앙값/.test(t)) {
      const list = m1(/((?:\d+, ){6,}\d+)/, t)[1].split(', ').map(N);
      const idx = N(m1(/(\d+)번째/, t)[1]) - 1;
      const y = N(m1(/값 \d+[은는] (\d+)[을를]|값을 (\d+)(?:로|으로)|사실은 (\d+)/, t).slice(1).find(Boolean)!);
      list[idx] = y;
      // 작은 값부터 하나씩 꺼내 가운데 위치를 찾는다
      const rest = list.slice(), ordered: number[] = [];
      while (rest.length) {
        const k = rest.indexOf(Math.min(...rest));
        ordered.push(rest.splice(k, 1)[0]);
      }
      const L = ordered.length;
      return { num: L % 2 ? ordered[(L - 1) / 2] : (ordered[L / 2 - 1] + ordered[L / 2]) / 2 };
    }
    const n = N(m1(/(\d+)개 자료|자료 (\d+)개/, t).slice(1).find(Boolean)!);
    const M = N(m1(/평균(?:을|이|은) (\d+)/, t)[1]);
    const nums = all(/(\d+)(?:점|개|건)/g, t).map((m) => N(m[1]));
    // 문장에 나오는 값: 평균, 그리고 잘못 기록한 값·바른 값
    const mWrong = t.match(/그중 (\d+)\D+?(\d+)\D+?잘못 기록/) ?? t.match(/실제로는 (\d+)\D+인데 (\d+)/) ?? t.match(/\((\d+)\D+→ 바른 값 (\d+)/);
    if (!mWrong) throw new Error(`값을 읽지 못함 ${nums}`);
    let correct: number, wrong: number;
    if (/그중/.test(t)) [correct, wrong] = [N(mWrong[1]), N(mWrong[2])];
    else if (/실제로는/.test(t)) [correct, wrong] = [N(mWrong[1]), N(mWrong[2])];
    else [wrong, correct] = [N(mWrong[1]), N(mWrong[2])];
    // 총합을 다시 만들어 나눈다
    const sum = n * M - wrong + correct;
    return { num: Math.round((sum / n) * 10) / 10 };
  },
  'adv.chartRead.rateChain'(p) {
    const tb = table(p);
    const [valRow, rateRow] = tb.rows;
    const r2 = parseSigned(rateRow[2]), r3 = parseSigned(rateRow[3]);
    const roll = (v: number) => (((v * (100 + r2)) / 100) * (100 + r3)) / 100;
    if (valRow[1] === '?') {
      const v3 = valRow[3] as number;
      // 처음 값을 1부터 늘려 가며 2년 뒤 값이 표와 같은 것을 찾는다
      for (let v = 1; v <= 100000; v++) if (near(roll(v), v3)) return { num: v };
      throw new Error('처음 값을 찾지 못함');
    }
    const v1 = valRow[1] as number;
    return { num: Math.round(((roll(v1) - v1) / v1) * 1000) / 10 };
  },
  'adv.chartRead.indexGrowth'(p) {
    const tb = table(p);
    const t = p.text;
    const row = tb.rows.find((r) => t.includes(String(r[0])))!;
    const ys = all(/(\d{4})년/g, t).map((m) => m[1]);
    // 문장에 나오는 연도 중 기준 연도(표 첫 열)를 뺀 두 해
    const base = tb.head[1].replace('년', '');
    const two = [...new Set(ys.filter((y) => y !== base))].sort();
    const col = (y: string) => tb.head.indexOf(`${y}년`);
    const a = row[col(two[0])] as number, b = row[col(two[1])] as number;
    return { num: Math.round((b / a - 1) * 1000) / 10 };
  },
  'adv.chartRead.perCapitaRate'(p) {
    const tb = table(p);
    const row = tb.rows.find((r) => p.text.includes(String(r[0])))!;
    const pc1 = (row[2] as number) / (row[1] as number), pc2 = (row[4] as number) / (row[3] as number);
    return { num: Math.round((pc2 / pc1 - 1) * 1000) / 10 };
  },
  'adv.chartRead.shareToAmount'(p) {
    const tb = table(p);
    const row = tb.rows.find((r) => p.text.includes(String(r[0])))!;
    const tot = tb.rows[tb.rows.length - 1];
    const v1 = ((tot[1] as number) * (row[1] as number)) / 100, v2 = ((tot[2] as number) * (row[2] as number)) / 100;
    return { num: v2 - v1 };
  },
  'adv.chartMake.baseRateChart'(p) {
    const v = table(p).rows[0].slice(1) as number[];
    return { values: v.slice(1).map((x) => (x / v[0] - 1) * 100) };
  },
  'adv.chartMake.combinedPie'(p) {
    const rows = table(p).rows;
    const sums = rows.map((r) => (r[1] as number) + (r[2] as number));
    const T = sums.reduce((a, b) => a + b, 0);
    return { values: sums.map((s) => (s / T) * 100) };
  },
  'adv.chartMake.perCapitaLine'(p) {
    const [pop, tot] = table(p).rows.map((r) => r.slice(1) as number[]);
    return { values: tot.map((x, i) => x / pop[i]) };
  },
  'adv.chartMake.gapBar'(p) {
    const [a, b] = table(p).rows.map((r) => r.slice(1) as number[]);
    return { values: a.map((x, i) => x - b[i]) };
  },
};

let failed = 0;
const rows: Record<string, string | number>[] = [];
for (const tpl of ADVANCED_TEMPLATES) {
  const solve = solvers[tpl.id];
  if (!solve) {
    console.error(`독립 풀이 없음: ${tpl.id}`);
    failed++;
    continue;
  }
  let ok = 0, bad = 0;
  const samples: string[] = [];
  for (let i = 0; i < PER_TEMPLATE; i++) {
    const seed = i * 104729 + 7;
    let p: Problem;
    try {
      p = makeProblem(tpl, new Rng(seed));
    } catch {
      continue; // 생성 실패는 validate:advanced가 따로 센다
    }
    const right = p.choices[p.answerIndex];
    let pass = false, why = '';
    try {
      const e = solve(p);
      if ('frac' in e) pass = right.label === e.frac;
      else if ('num' in e) pass = near(labelNum(right.label), e.num);
      else {
        const vals = right.chart && 'values' in right.chart ? right.chart.values : [];
        pass = vals.length === e.values.length && vals.every((v, k) => Math.abs(v - e.values[k]) < 1e-6);
      }
      if (!pass) why = `독립 풀이 ${JSON.stringify(e)} ≠ 정답 보기 ${right.label}`;
    } catch (err) {
      why = (err as Error).message;
    }
    if (pass) ok++;
    else {
      bad++;
      if (samples.length < 2) samples.push(`시드 ${seed}: ${why} | ${p.text.slice(0, 80)}`);
    }
  }
  rows.push({ id: tpl.id, 대조: ok + bad, 일치: ok, 불일치: bad });
  if (bad) {
    failed++;
    console.error(`${tpl.id}: 불일치 ${bad}건`);
    samples.forEach((s) => console.error('   ' + s));
  }
}
console.table(rows);
if (failed) {
  console.error(`\n심화 독립 풀이 검산 실패: 템플릿 ${failed}개`);
  process.exit(1);
}
console.log('\n심화 독립 풀이 검산 통과');
