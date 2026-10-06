/**
 * 심화 문제 생성기 검증. 실패하면 exit 1.
 *   npx tsx scripts/validate-advanced.ts            (템플릿마다 시드 20,000개, 세트 5,000개)
 *   npx tsx scripts/validate-advanced.ts --quick    (빠른 검사: 시드 2,000개, 세트 1,000개. npm run build에 포함)
 *
 * 템플릿 단위(시드마다)
 *  - 정답 유일성: 보기 5개, 표시 문자열 중복 없음, 정답 보기 정확히 1개, 오답이 정답과 수치로 같지 않음(0.5와 1/2, 48과 48.0 등)
 *  - 자릿수·단위: 정답은 소수 첫째 자리 이내(확률은 기약분수), 숫자 보기 5개의 단위 표기가 같음
 *  - 해설 일치: 해설에 정답 표시가 "= 정답" 꼴로 나옴(그래프 정답은 정답의 모든 값이 해설에 나옴)
 *  - 재현성: 같은 시드로 두 번 만든 문항(문장·보기·도표·해설·정답 위치)이 완전히 같음
 *  - 비정상 값(NaN·음수·undefined), 괄호 조사, 문장 끝, 오답 태그, 도표 수치
 *  - 그래프 보기 5개가 서로 다르게 그려짐
 * 템플릿 요약: 실패 시드 비율, 생성 실패(숫자 조건을 못 찾음) 비율, 근접값 채움 비율, 문장 틀 수, 정답 위치 분포
 * 세트 단위: 영역별 3문항, 유형 중복 없음, 확장·신규 섞임, 세트 안 문장 중복 없음, 같은 시드 재현성
 */
import { ADVANCED, ADVANCED_TEMPLATES, ADVANCED_KIND } from '../server/advanced/registry.js';
import { generateAdvancedSet } from '../server/advanced/set.js';
import { ADVANCED_PER_AREA } from '../server/advanced/constants.js';
import { AREAS } from '../server/areas.js';
import { Rng } from '../server/engine/rng.js';
import { makeProblem } from '../server/engine/set.js';
import { hasBadToken, isValidValue } from '../server/engine/choices.js';
import { hasAtMostDecimals, num } from '../server/engine/format.js';
import { isFrac, fracLabel } from '../server/engine/frac.js';
import { MISTAKES } from '../server/engine/mistakes.js';
import { renderChart, renderTable } from '../shared/charts/render.js';
import type { ChartSpec, Figure } from '../shared/charts/types.js';
import type { Problem } from '../server/engine/types.js';

/** --quick: build에 넣는 빠른 검사(템플릿마다 시드 2,000개, 세트 1,000개) */
const QUICK = process.argv.includes('--quick');
const PER_TEMPLATE = Number(process.env.ADV_PER_TEMPLATE ?? (QUICK ? 2000 : 20000));
const SETS = Number(process.env.ADV_SETS ?? (QUICK ? 1000 : 5000));
/** 숫자 조건을 찾지 못해 다시 뽑는 비율의 상한(세트 생성기가 다시 뽑으므로 사용자에게는 보이지 않지만 너무 잦으면 범위를 고친다) */
const MAX_GEN_FAIL_RATE = 0.01;
const MAX_FILLER_RATE = 0.25;
const MIN_PHRASINGS = 3;
const MIN_PER_AREA = 3;

const errors: string[] = [];
const fail = (msg: string) => {
  if (errors.length < 200) errors.push(msg);
};

function figureNumbers(f: Figure): number[] {
  if (f.kind === 'table') return f.table.rows.flat().filter((x): x is number => typeof x === 'number');
  const s = f.spec;
  return s.type === 'scatter' ? [...s.xs, ...s.ys] : s.values;
}
function figureProblems(f: Figure): string[] {
  const out: string[] = [];
  for (const n of figureNumbers(f)) if (!Number.isFinite(n) || n < 0) out.push(`도표 수치 ${n}`);
  const html = f.kind === 'chart' ? renderChart(f.spec) : renderTable(f.table);
  if (hasBadToken(html.replace(/<[^>]+>/g, ' ')) || /NaN|undefined/.test(html)) out.push('도표에 비정상 값');
  return out;
}
const skeleton = (t: string) => t.replace(/[\d,.]+/g, '#').replace(/(소금|설탕)/g, '$');

/** 보기 표시 문자열 → 수치(숫자형). 분수는 값으로. */
function labelValue(label: string): number | null {
  const f = label.match(/^(\d+)\/(\d+)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  const m = label.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
const unitOf = (label: string) => label.replace(/[\d,.]+/g, '#');

/** 한 시드의 문항 하나를 검사한다. 문제가 있으면 목록을 돌려준다. */
function checkProblem(p: Problem, answer: unknown, chartAnswer: ChartSpec | null): string[] {
  const out: string[] = [];
  const { choices, answerIndex } = p;
  if (choices.length !== 5) out.push(`보기 수 ${choices.length}`);
  if (new Set(choices.map((c) => c.label)).size !== choices.length) out.push('보기 표시 중복');
  if (choices.filter((c) => c.mistakeTag === null).length !== 1) out.push('정답 보기가 1개가 아님');
  for (const c of choices) {
    if (hasBadToken(c.label)) out.push(`보기에 비정상 값 ${c.label}`);
    if (c.mistakeTag && !(c.mistakeTag in MISTAKES)) out.push(`알 수 없는 태그 ${c.mistakeTag}`);
    if (c.chart) out.push(...figureProblems({ kind: 'chart', spec: c.chart }));
  }
  if (chartAnswer) {
    const svgs = choices.map((c) => renderChart(c.chart!));
    if (new Set(svgs).size !== 5) out.push('그래프 보기가 시각적으로 중복');
    const vals = 'values' in chartAnswer ? chartAnswer.values : [];
    const stepsText = p.steps.join(' ');
    if (!vals.every((v) => stepsText.includes(num(v)))) out.push('해설에 정답 그래프 값이 모두 나오지 않음');
  } else {
    const vals = choices.map((c) => labelValue(c.label));
    if (vals.some((v) => v === null)) out.push('보기에서 수치를 읽지 못함');
    const ansV = vals[answerIndex]!;
    if (vals.some((v, i) => i !== answerIndex && v !== null && Math.abs(v - ansV) < 1e-9)) out.push('오답이 정답과 수치로 같음');
    if (new Set(vals.map((v) => (v === null ? 'x' : v.toFixed(9)))).size !== 5) out.push('보기 수치 중복');
    if (new Set(choices.map((c) => unitOf(c.label))).size !== 1 && !choices.every((c) => /^\d+\/\d+$|^1$/.test(c.label)))
      out.push(`보기 단위 표기가 섞임 ${choices.map((c) => c.label).join(' | ')}`);
    if (typeof answer === 'number' && !hasAtMostDecimals(answer, 1)) out.push(`정답 자릿수 ${answer}`);
    // 해설 일치: "= 정답" 또는 정답 표시 문자열이 해설에 있어야 한다
    const label = choices[answerIndex].label;
    const token = typeof answer === 'number' ? num(answer) : isFrac(answer) ? fracLabel(answer) : label;
    const stepsText = p.steps.join(' ');
    if (!stepsText.includes(`= ${token}`) && !stepsText.includes(`= ${label}`) && !stepsText.includes(label)) out.push(`해설에 정답(${label})이 계산 결과로 나오지 않음`);
  }
  for (const t of [p.text, ...p.steps]) {
    if (hasBadToken(t)) out.push(`문장·해설에 비정상 값: ${t.slice(0, 60)}`);
    if (/\S {2,}\S|\(가\)|\(를\)|\(는\)|\(와\)|\(으\)로|[가-힣]\(이\)|[가-힣]\(은\)|[가-힣]\(을\)/.test(t)) out.push(`문장 다듬기 필요: ${t.slice(0, 60)}`);
  }
  if (!/[?.)]$/.test(p.text.trim())) out.push('문장이 물음표/마침표로 끝나지 않음');
  if (p.figure) out.push(...figureProblems(p.figure));
  return out;
}

console.log(`심화 템플릿 ${ADVANCED_TEMPLATES.length}개 × 시드 ${PER_TEMPLATE.toLocaleString()}개 검사`);
const t0 = Date.now();
const rows: Record<string, string | number>[] = [];
for (const tpl of ADVANCED_TEMPLATES) {
  let genFail = 0, badSeeds = 0, built = 0, fillers = 0;
  const skeletons = new Set<string>();
  const positions = [0, 0, 0, 0, 0];
  const firstProblems = new Map<string, number>();
  for (let i = 0; i < PER_TEMPLATE; i++) {
    const seed = i * 7919 + 13;
    let p: Problem, answer: unknown, chartAnswer: ChartSpec | null;
    try {
      // 생성 원재료(정답 값)와 완성 문항을 같은 시드로 각각 만든다
      const g = tpl.generate(new Rng(seed));
      answer = g.answer;
      chartAnswer = g.chart ? (g.answer as ChartSpec) : null;
      if (!isValidValue(g.answer)) throw new Error('정답 값 비정상');
      if (g.wrongs.length < 4) throw new Error('오답 후보 4개 미만');
      p = makeProblem(tpl, new Rng(seed));
    } catch {
      genFail++;
      continue;
    }
    built++;
    fillers += p.fillers;
    positions[p.answerIndex]++;
    skeletons.add(skeleton(p.text));
    const problems = checkProblem(p, answer, chartAnswer);
    // 재현성: 같은 시드로 다시 만들면 완전히 같아야 한다
    if (JSON.stringify(makeProblem(tpl, new Rng(seed))) !== JSON.stringify(p)) problems.push('같은 시드에서 다른 문항');
    if (problems.length) {
      badSeeds++;
      for (const m of problems) firstProblems.set(m, (firstProblems.get(m) ?? 0) + 1);
    }
  }
  const badRate = badSeeds / PER_TEMPLATE, genRate = genFail / PER_TEMPLATE, fillerRate = built ? fillers / (built * 4) : 1;
  if (badSeeds) fail(`${tpl.id}: 검사 실패 시드 ${badSeeds}개 (${(badRate * 100).toFixed(2)}%) — ${[...firstProblems].slice(0, 3).map(([m, c]) => `${m} ×${c}`).join(' / ')}`);
  if (genRate > MAX_GEN_FAIL_RATE) fail(`${tpl.id}: 생성 실패 ${(genRate * 100).toFixed(2)}% > ${MAX_GEN_FAIL_RATE * 100}%`);
  if (fillerRate > MAX_FILLER_RATE) fail(`${tpl.id}: 근접값 채움 ${(fillerRate * 100).toFixed(1)}%`);
  if (skeletons.size < MIN_PHRASINGS) fail(`${tpl.id}: 문장 틀 ${skeletons.size}가지`);
  const posRates = positions.map((x) => x / Math.max(1, built));
  if (posRates.some((r) => Math.abs(r - 0.2) > 0.05)) fail(`${tpl.id}: 정답 위치 치우침 ${posRates.map((r) => (r * 100).toFixed(0)).join('/')}`);
  rows.push({
    id: tpl.id,
    구분: ADVANCED_KIND[tpl.id] === 'extended' ? '확장' : '신규',
    '실패 시드': `${badSeeds} (${(badRate * 100).toFixed(2)}%)`,
    '생성 실패': `${genFail} (${(genRate * 100).toFixed(2)}%)`,
    근접값: `${(fillerRate * 100).toFixed(1)}%`,
    문장틀: skeletons.size,
  });
}
console.table(rows);

// 영역 구성
for (const a of AREAS) {
  const list = ADVANCED.filter((x) => x.tpl.area === a.id);
  const subtypes = new Set(list.map((x) => x.tpl.subtype));
  if (subtypes.size < MIN_PER_AREA) fail(`${a.name}: 심화 유형 ${subtypes.size}개 (최소 ${MIN_PER_AREA})`);
}
if (new Set(ADVANCED_TEMPLATES.map((t) => t.id)).size !== ADVANCED_TEMPLATES.length) fail('심화 템플릿 id 중복');

// 세트
const areaIds = AREAS.map((a) => a.id);
let setFail = 0;
for (let s = 0; s < SETS; s++) {
  const seed = (s * 2654435761) >>> 0;
  let set: Problem[];
  try {
    set = generateAdvancedSet(ADVANCED_TEMPLATES, seed, { areas: areaIds, perArea: ADVANCED_PER_AREA });
  } catch (e) {
    setFail++;
    fail(`심화 세트 ${seed}: 생성 실패 ${(e as Error).message}`);
    continue;
  }
  if (set.length !== areaIds.length * ADVANCED_PER_AREA) fail(`심화 세트 ${seed}: 문항 수 ${set.length}`);
  if (new Set(set.map((p) => p.text)).size !== set.length) fail(`심화 세트 ${seed}: 문장 중복`);
  for (const a of areaIds) {
    const ps = set.filter((p) => p.area === a);
    if (ps.length !== ADVANCED_PER_AREA) fail(`심화 세트 ${seed}: ${a} ${ps.length}문항`);
    if (new Set(ps.map((p) => p.subtype)).size !== ps.length) fail(`심화 세트 ${seed}: ${a} 유형 중복`);
    const kinds = new Set(ps.map((p) => ADVANCED_KIND[p.templateId]));
    const poolKinds = new Set(ADVANCED.filter((x) => x.tpl.area === a).map((x) => x.kind));
    if (kinds.size < poolKinds.size) fail(`심화 세트 ${seed}: ${a} 확장·신규가 섞이지 않음`);
  }
}
const j1 = JSON.stringify(generateAdvancedSet(ADVANCED_TEMPLATES, 42, { areas: areaIds, perArea: ADVANCED_PER_AREA }));
const j2 = JSON.stringify(generateAdvancedSet(ADVANCED_TEMPLATES, 42, { areas: areaIds, perArea: ADVANCED_PER_AREA }));
if (j1 !== j2) fail('같은 시드에서 다른 심화 세트 (재현성 실패)');
console.log(`심화 세트 ${SETS.toLocaleString()}개 검사 (생성 실패 ${setFail}개)`);

if (errors.length) {
  console.error(`\n심화 검증 실패 ${errors.length}건:`);
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
console.log(`\n심화 검증 통과 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
