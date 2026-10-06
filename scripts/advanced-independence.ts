/**
 * 심화 세트의 난수 독립성 검사. 실패하면 exit 1.
 *   npx tsx scripts/advanced-independence.ts           (시드 2,000개)
 *   npx tsx scripts/advanced-independence.ts --quick   (시드 200개. npm run build에 포함)
 *
 * 템플릿 하나의 난수 소비량을 일부러 바꾼 시험 버전으로 세트를 다시 만들고, 원래 세트와 비교한다.
 *  - 세트의 템플릿 구성·순서가 같아야 한다.
 *  - 바꾼 템플릿을 뺀 나머지 문항(문장·도표·보기·정답 위치·해설·태그)이 모두 같아야 한다.
 * 바꾸는 방식은 세 가지: 문항 만들기 전에 난수를 더 쓰기, 만든 뒤에 더 쓰기, 첫 시도를 실패시켜 재시도하기.
 * 바꾼 템플릿의 문항은 실제로 달라져야 한다(시험 버전이 효과가 있는지 확인).
 *
 * 검사가 정말 잡아내는지도 함께 본다: 세트 전체가 난수 하나를 같이 쓰던 옛 방식(아래 legacySet)에
 * 같은 시험을 하면 반드시 차이가 나와야 한다. 차이가 안 나오면 이 검사가 무뎌진 것이므로 실패로 본다.
 *
 * 또 세트의 각 문항이 "템플릿·세트 시드·자리"만으로 정해지는지(세트 안 중복 문장 규칙이 실제로 끼어들지 않는지) 확인한다.
 */
import { isDeepStrictEqual } from 'node:util';
import { ADVANCED_TEMPLATES, ADVANCED_KIND } from '../server/advanced/registry.js';
import { generateAdvancedSet, makeAdvancedItem } from '../server/advanced/set.js';
import { ADVANCED_PER_AREA } from '../server/advanced/constants.js';
import { AREAS } from '../server/areas.js';
import { TEMPLATES } from '../server/registry.js';
import { Rng } from '../server/engine/rng.js';
import { makeProblem } from '../server/engine/set.js';
import type { Problem, Template } from '../server/engine/types.js';

const QUICK = process.argv.includes('--quick');
const SEEDS = Number(process.env.ADV_INDEP_SEEDS ?? (QUICK ? 200 : 2000));
const LEGACY_SEEDS = QUICK ? 50 : 200;
const AREA_IDS = AREAS.filter((a) => TEMPLATES.some((t) => t.area === a.id)).map((a) => a.id);
const OPTS = { areas: AREA_IDS, perArea: ADVANCED_PER_AREA };
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

type Mode = 'before' | 'after' | 'retry';
const MODES: Mode[] = ['before', 'after', 'retry'];
/** 난수 소비량만 바꾼 시험 버전(id·영역·유형·난이도는 그대로) */
function perturb(tpl: Template, mode: Mode): Template {
  let calls = 0;
  return {
    ...tpl,
    generate(rng) {
      if (mode === 'before') for (let i = 0; i < 7; i++) rng.next();
      if (mode === 'retry' && calls++ % 2 === 0) {
        rng.next();
        throw new Error('시험: 첫 시도 실패');
      }
      const g = tpl.generate(rng);
      if (mode === 'after') for (let i = 0; i < 5; i++) rng.next();
      return g;
    },
  };
}

/** 옛 방식(세트 전체가 난수 하나를 같이 씀). 검사가 차이를 잡아내는지 보이려고만 둔다 */
function legacySet(templates: Template[], seed: number): Problem[] {
  const rng = new Rng(seed);
  const texts = new Set<string>();
  const out: Problem[] = [];
  for (const area of OPTS.areas) {
    const pool = templates.filter((t) => t.area === area);
    const shuffled = rng.shuffle(pool);
    const kinds = new Set(pool.map((t) => ADVANCED_KIND[t.id]));
    const chosen: Template[] = [];
    for (const k of rng.shuffle([...kinds])) {
      const t = shuffled.find((x) => ADVANCED_KIND[x.id] === k && !chosen.includes(x));
      if (t && chosen.length < OPTS.perArea) chosen.push(t);
    }
    for (const t of shuffled) {
      if (chosen.length >= OPTS.perArea) break;
      if (!chosen.includes(t) && !chosen.some((c) => c.subtype === t.subtype)) chosen.push(t);
    }
    for (const tpl of chosen.sort((a, b) => a.difficulty - b.difficulty)) {
      let p: Problem | null = null;
      for (let tries = 0; tries < 30 && !p; tries++) {
        try {
          const cand = makeProblem(tpl, rng);
          if (!texts.has(cand.text)) p = cand;
        } catch {
          // 다시 뽑는다
        }
      }
      if (!p) throw new Error(`옛 방식 생성 실패: ${tpl.id}`);
      texts.add(p.text);
      out.push(p);
    }
  }
  return out;
}

/** 원래 세트와 시험 세트 비교: 구성이 다르면 'plan', 다른 템플릿 문항이 다르면 'other', 바꾼 템플릿 문항이 달라졌으면 changed */
function compare(base: Problem[], test: Problem[], id: string) {
  const plan = base.map((p) => p.templateId).join() === test.map((p) => p.templateId).join();
  let other = 0, same = 0, changed = false;
  if (plan)
    base.forEach((p, i) => {
      if (p.templateId === id) changed ||= !isDeepStrictEqual(p, test[i]);
      else if (isDeepStrictEqual(p, test[i])) same++;
      else other++;
    });
  return { plan, other, same, changed };
}

const t0 = Date.now();
const fails: string[] = [];
const seeds = Array.from({ length: SEEDS }, (_, i) => (Math.imul(i + 1, 2654435761) + 12345) >>> 0);

// 1) 문항 = 템플릿·시드·자리만의 함수(세트 안 중복 문장 규칙이 끼어들지 않음)
const bases = seeds.map((s) => plain(generateAdvancedSet(ADVANCED_TEMPLATES, s, OPTS)));
let standalone = 0;
seeds.forEach((s, k) =>
  bases[k].forEach((p, slot) => {
    const tpl = ADVANCED_TEMPLATES.find((t) => t.id === p.templateId)!;
    if (isDeepStrictEqual(plain(makeAdvancedItem(tpl, s, slot)), p)) standalone++;
    else fails.push(`시드 ${s} 자리 ${slot}: 세트 안 문항이 단독으로 만든 문항과 다름`);
  }),
);

// 2) 새 방식: 템플릿마다 세 가지 시험 버전
let compared = 0, sameItems = 0, planSame = 0;
const effectiveBy: Record<Mode, number> = { before: 0, after: 0, retry: 0 }, appearedBy: Record<Mode, number> = { before: 0, after: 0, retry: 0 };
const appearances: Record<string, number> = {};
for (const tpl of ADVANCED_TEMPLATES) {
  for (const mode of MODES) {
    const list = ADVANCED_TEMPLATES.map((t) => (t.id === tpl.id ? perturb(t, mode) : t));
    seeds.forEach((s, k) => {
      const r = compare(bases[k], plain(generateAdvancedSet(list, s, OPTS)), tpl.id);
      compared++;
      if (!r.plan) return void fails.push(`${tpl.id} (${mode}) 시드 ${s}: 템플릿 구성·순서가 바뀜`);
      planSame++;
      sameItems += r.same;
      if (r.other) fails.push(`${tpl.id} (${mode}) 시드 ${s}: 다른 템플릿 문항 ${r.other}개가 바뀜`);
      if (bases[k].some((p) => p.templateId === tpl.id)) {
        appearances[`${tpl.id}/${mode}`] = (appearances[`${tpl.id}/${mode}`] ?? 0) + 1;
        appearedBy[mode]++;
        if (r.changed) effectiveBy[mode]++;
      }
    });
    if (!appearances[`${tpl.id}/${mode}`]) fails.push(`${tpl.id} (${mode}): 시드 ${SEEDS}개 중 한 번도 세트에 나오지 않음`);
  }
}
// 시험 버전이 정말 문항을 바꿨는지(효과 없는 시험이면 비교가 의미 없음).
// 'after'는 보기 순서만 바꾸므로 우연히 같은 순서가 나올 수 있다. 방식마다 90% 이상이면 된다
for (const m of MODES) if (effectiveBy[m] < appearedBy[m] * 0.9) fails.push(`시험 버전(${m})이 바꾼 템플릿 문항을 거의 바꾸지 못함: ${effectiveBy[m]}/${appearedBy[m]}`);

// 3) 옛 방식에서는 같은 시험이 차이를 잡아내야 한다
let legacyCaught = 0, legacyTotal = 0, legacyLast = 0;
const legacySeeds = seeds.slice(0, LEGACY_SEEDS);
const legacyBases = legacySeeds.map((s) => plain(legacySet(ADVANCED_TEMPLATES, s)));
for (const tpl of ADVANCED_TEMPLATES) {
  const list = ADVANCED_TEMPLATES.map((t) => (t.id === tpl.id ? perturb(t, 'before') : t));
  legacySeeds.forEach((s, k) => {
    const at = legacyBases[k].findIndex((p) => p.templateId === tpl.id);
    if (at < 0) return;
    // 세트 마지막 자리 템플릿은 옛 방식에서도 뒤에 영향 받을 문항이 없다
    if (at === legacyBases[k].length - 1) return void legacyLast++;
    legacyTotal++;
    const r = compare(legacyBases[k], plain(legacySet(list, s)), tpl.id);
    if (!r.plan || r.other) legacyCaught++;
  });
}
// 옛 방식에서도 다시 뽑기를 많이 하는 템플릿은, 앞에 난수를 더 써도 몇 번 다시 뽑는 사이에 난수열의 같은 위치로
// 되돌아와(재동기화) 뒤 문항이 그대로인 경우가 있다. 그래서 전부가 아니라 80% 이상 잡으면 검사가 살아 있다고 본다
if (legacyCaught < legacyTotal * 0.8) fails.push(`옛 방식(공유 난수)에서 차이를 잡은 세트가 너무 적음 ${legacyCaught}/${legacyTotal}: 검사가 무뎌짐`);

console.log(`심화 난수 독립성 검사: 시드 ${SEEDS.toLocaleString()}개 × 템플릿 ${ADVANCED_TEMPLATES.length}개 × 시험 방식 ${MODES.length}가지`);
console.log(` - 세트 안 문항 = 단독으로 만든 문항: ${standalone.toLocaleString()}/${(SEEDS * 12).toLocaleString()}`);
console.log(` - 세트 구성·순서 같음: ${planSame.toLocaleString()}/${compared.toLocaleString()}`);
console.log(` - 다른 템플릿 문항 같음: ${sameItems.toLocaleString()}개 (다름 ${fails.filter((f) => f.includes('다른 템플릿')).length}건)`);
console.log(` - 시험 버전이 바꾼 템플릿 문항이 실제로 달라짐: ${MODES.map((m) => `${m} ${effectiveBy[m].toLocaleString()}/${appearedBy[m].toLocaleString()}`).join(', ')}`);
console.log(` - 옛 방식(공유 난수)에서 같은 시험('before')이 차이를 잡음: ${legacyCaught}/${legacyTotal} 세트 (바꾼 템플릿이 마지막 자리라 뒤 문항이 없는 ${legacyLast}세트 제외)`);
if (fails.length) {
  console.error(`\n심화 난수 독립성 검사 실패 ${fails.length}건:`);
  fails.slice(0, 20).forEach((f) => console.error(' - ' + f));
  process.exit(1);
}
console.log(`\n심화 난수 독립성 검사 통과 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
