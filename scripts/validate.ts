/**
 * 문제 생성기 검증. 실패하면 exit 1 → npm run build도 실패한다.
 *
 * 템플릿 단위: 각 템플릿을 PER_TEMPLATE번 생성해
 *   - 정답 존재(정확히 1개), 보기 5개·표시 중복 없음
 *   - 정답이 소수 첫째 자리 이내로 깔끔한 값인지
 *   - NaN·Infinity·음수·undefined 같은 비정상 값이 문장/보기/해설/도표에 없는지
 *   - 모든 오답에 mistakeTag가 붙었는지, 근접값 채움 비율이 낮은지
 *   - 문장 틀이 3가지 이상인지
 * 세트 단위: SETS개 세트를 만들어
 *   - 영역별 문항 수, 영역 내 유형 중복 없음, 같은 세트 내 문장 중복 없음
 */
import { TEMPLATES } from '../server/registry.js';
import { AREAS } from '../server/areas.js';
import { Rng } from '../server/engine/rng.js';
import { buildChoices, hasBadToken, isValidValue } from '../server/engine/choices.js';
import { generateSet } from '../server/engine/set.js';
import { hasAtMostDecimals, num } from '../server/engine/format.js';
import { isFrac, fracLabel } from '../server/engine/frac.js';
import { MISTAKES } from '../server/engine/mistakes.js';
import { renderChart, renderTable } from '../shared/charts/render.js';
import type { Figure } from '../shared/charts/types.js';
import { analyze, judge } from '../server/report/analyze.js';

const PER_TEMPLATE = Number(process.env.PER_TEMPLATE ?? 3000);
const SETS = Number(process.env.SETS ?? 5000);
/** 기본은 고정 시드(재현 가능). SEED_OFFSET=임의값 으로 다른 범위를 탐색할 수 있다. */
const SEED_OFFSET = Number(process.env.SEED_OFFSET ?? 0);
const MIN_TEMPLATES_PER_AREA = 5;
const MAX_FILLER_RATE = 0.25;
const MIN_PHRASINGS = 3;
/** 단계별 구현 중에는 비어 있는 영역을 경고로만 처리한다. 모든 영역이 갖춰지면 true. */
const STRICT_COVERAGE = true;

const errors: string[] = [];
const fail = (msg: string) => {
  if (errors.length < 200) errors.push(msg);
};

function figureNumbers(f: Figure): number[] {
  if (f.kind === 'table') return f.table.rows.flat().filter((x): x is number => typeof x === 'number');
  const s = f.spec;
  if (s.type === 'scatter') return [...s.xs, ...s.ys];
  return s.values;
}

function checkFigure(id: string, f: Figure) {
  for (const n of figureNumbers(f)) {
    if (!Number.isFinite(n) || n < 0) fail(`${id}: 도표에 비정상 수치 ${n}`);
  }
  const html = f.kind === 'chart' ? renderChart(f.spec) : renderTable(f.table);
  if (hasBadToken(html.replace(/<[^>]+>/g, ' '))) fail(`${id}: 도표 텍스트에 비정상 값`);
  if (/NaN|undefined/.test(html)) fail(`${id}: 도표 SVG에 NaN/undefined`);
}

/** 숫자·이름을 지운 문장 뼈대. 서로 다른 뼈대 수 = 문장 틀 수 */
function skeleton(text: string): string {
  return text
    .replace(/[\d,.]+/g, '#')
    .replace(/(갑|을|A 사원|B 사원|민준|서연|김 주임|이 대리|도윤|하은)[은는이가과와을를의]?/g, '@')
    .replace(/(소금|설탕)/g, '$');
}

console.log(`템플릿 ${TEMPLATES.length}개 × ${PER_TEMPLATE}회 생성 검사${SEED_OFFSET ? ` (SEED_OFFSET=${SEED_OFFSET})` : ''}`);
const t0 = Date.now();
const rows: Record<string, string | number>[] = [];

for (const tpl of TEMPLATES) {
  const skeletons = new Set<string>();
  const tags = new Set<string>();
  let fillers = 0;
  let generated = 0;
  const positions = [0, 0, 0, 0, 0];
  for (let i = 0; i < PER_TEMPLATE; i++) {
    const rng = new Rng(i * 7919 + 13 + SEED_OFFSET);
    const id = `${tpl.id}#${i}`;
    let g;
    try {
      g = tpl.generate(rng);
    } catch (e) {
      fail(`${id}: generate 예외 ${(e as Error).message}`);
      continue;
    }
    if (typeof g.answer === 'number' && !hasAtMostDecimals(g.answer, 1)) fail(`${id}: 정답이 깔끔하지 않음 ${g.answer}`);
    if (!isValidValue(g.answer)) fail(`${id}: 정답 값 비정상 ${String(g.answer)}`);
    if (g.wrongs.length < 4) fail(`${id}: 흔한 실수 오답이 4개 미만 (${g.wrongs.length})`);
    for (const w of g.wrongs) if (!(w.mistakeTag in MISTAKES)) fail(`${id}: 알 수 없는 mistakeTag ${w.mistakeTag}`);
    if (hasBadToken(g.text)) fail(`${id}: 문장에 비정상 값: ${g.text}`);
    for (const t of [g.text, ...g.steps]) {
      if (/\S {2,}\S|\(가\)|\(를\)|\(는\)|\(와\)|\(으\)로/.test(t)) fail(`${id}: 문장 다듬기 필요(이중 공백·괄호 조사): ${t}`);
      if (/[가-힣]\(이\)|[가-힣]\(은\)|[가-힣]\(을\)/.test(t)) fail(`${id}: 괄호 조사 남음: ${t}`);
    }
    if (!/[?.)]$/.test(g.text.trim())) fail(`${id}: 문장이 물음표/마침표로 끝나지 않음: ${g.text}`);
    // 해설에 정답 값이 실제로 나오는지 (해설과 정답의 불일치 방지)
    const ansToken = typeof g.answer === 'number' ? num(g.answer) : isFrac(g.answer) ? fracLabel(g.answer) : typeof g.answer === 'string' ? g.answer : null;
    const stepsText = g.steps.join(' ');
    if (ansToken && !stepsText.includes(ansToken) && !stepsText.includes(g.format(g.answer)) && !g.chart) fail(`${id}: 해설에 정답 값(${ansToken})이 없음`);
    for (const s of g.steps) if (hasBadToken(s)) fail(`${id}: 해설에 비정상 값: ${s}`);
    if (g.steps.length === 0) fail(`${id}: 해설 없음`);
    if (g.figure) checkFigure(id, g.figure);

    let built;
    try {
      built = buildChoices(rng, g);
    } catch (e) {
      fail(`${id}: 보기 구성 실패 ${(e as Error).message} | ${g.text}`);
      continue;
    }
    generated++;
    const { choices, answerIndex } = built;
    positions[answerIndex]++;
    fillers += built.fillers;
    if (choices.length !== 5) fail(`${id}: 보기 수 ${choices.length}`);
    if (new Set(choices.map((c) => c.label)).size !== choices.length) fail(`${id}: 보기 중복`);
    if (choices.filter((c) => c.mistakeTag === null).length !== 1) fail(`${id}: 정답 보기가 정확히 1개가 아님`);
    if (choices[answerIndex]?.label !== g.format(g.answer)) fail(`${id}: answerIndex 불일치`);
    for (const c of choices) {
      if (hasBadToken(c.label)) fail(`${id}: 보기에 비정상 값 ${c.label}`);
      if (c.mistakeTag) tags.add(c.mistakeTag);
      if (c.chart) checkFigure(id, { kind: 'chart', spec: c.chart });
    }
    if (g.chart) {
      const svgs = choices.map((c) => renderChart(c.chart!));
      if (new Set(svgs).size !== 5) fail(`${id}: 그래프 보기가 시각적으로 중복`);
    }
    skeletons.add(skeleton(g.text));
  }
  const fillerRate = generated ? fillers / (generated * 4) : 1;
  if (fillerRate > MAX_FILLER_RATE) fail(`${tpl.id}: 근접값 채움 비율 ${(fillerRate * 100).toFixed(1)}% > ${MAX_FILLER_RATE * 100}%`);
  if (skeletons.size < MIN_PHRASINGS) fail(`${tpl.id}: 문장 틀 ${skeletons.size}가지 (최소 ${MIN_PHRASINGS})`);
  if (tags.size < 2) fail(`${tpl.id}: 실수 유형이 ${tags.size}가지뿐`);
  // 정답 위치가 한쪽으로 쏠리지 않는지 (기대 20%)
  const posRates = positions.map((p) => p / Math.max(1, generated));
  // 허용 오차: 최소 ±5%p, 표본이 작으면 3 표준편차까지
  const tol = Math.max(0.05, 3 * Math.sqrt((0.2 * 0.8) / Math.max(1, generated)));
  if (posRates.some((r) => Math.abs(r - 0.2) > tol)) fail(`${tpl.id}: 정답 위치 분포 치우침 ${posRates.map((r) => (r * 100).toFixed(0) + '%').join('/')}`);
  rows.push({
    id: tpl.id,
    유형: tpl.subtype,
    난이도: tpl.difficulty,
    성공: `${generated}/${PER_TEMPLATE}`,
    문장틀: skeletons.size,
    실수태그: tags.size,
    근접값: `${(fillerRate * 100).toFixed(1)}%`,
  });
  if (process.env.VERBOSE) console.log(tpl.id, '정답 위치', posRates.map((r) => (r * 100).toFixed(1)).join(' / '));
}
console.table(rows);

// 영역 구성
const activeAreas = AREAS.filter((a) => TEMPLATES.some((t) => t.area === a.id));
for (const a of AREAS) {
  const n = TEMPLATES.filter((t) => t.area === a.id).length;
  const subtypes = new Set(TEMPLATES.filter((t) => t.area === a.id).map((t) => t.subtype)).size;
  if (n === 0) {
    if (STRICT_COVERAGE) fail(`${a.name}: 템플릿 없음`);
    else console.warn(`경고: ${a.name} 템플릿 없음 (구현 예정)`);
    continue;
  }
  if (subtypes < MIN_TEMPLATES_PER_AREA && !STRICT_COVERAGE) console.warn(`경고: ${a.name} 유형 ${subtypes}개 (목표 ${MIN_TEMPLATES_PER_AREA})`);
  else if (subtypes < MIN_TEMPLATES_PER_AREA) fail(`${a.name}: 유형 ${subtypes}개 (최소 ${MIN_TEMPLATES_PER_AREA})`);
  for (const t of TEMPLATES.filter((t) => t.area === a.id)) {
    if (!a.studyOrder.includes(t.subtype)) fail(`${a.name}: 학습 순서에 없는 유형 ${t.subtype}`);
  }
}
if (new Set(TEMPLATES.map((t) => t.id)).size !== TEMPLATES.length) fail('템플릿 id 중복');

// 세트
console.log(`세트 ${SETS}개 생성 검사 (영역 ${activeAreas.length}개 × 3문항)`);
let setFail = 0;
for (let s = 0; s < SETS; s++) {
  const seed = (s * 2654435761 + SEED_OFFSET) >>> 0;
  let set;
  try {
    set = generateSet(TEMPLATES, seed, { areas: activeAreas.map((a) => a.id), perArea: 3 });
  } catch (e) {
    fail(`세트 ${seed}: 생성 실패 ${(e as Error).message}`);
    setFail++;
    continue;
  }
  if (set.length !== activeAreas.length * 3) fail(`세트 ${seed}: 문항 수 ${set.length}`);
  const texts = new Set(set.map((p) => p.text));
  if (texts.size !== set.length) fail(`세트 ${seed}: 같은 세트 내 문장 중복`);
  for (const a of activeAreas) {
    const ps = set.filter((p) => p.area === a.id);
    if (ps.length !== 3) fail(`세트 ${seed}: ${a.name} ${ps.length}문항`);
    if (new Set(ps.map((p) => p.subtype)).size !== ps.length) fail(`세트 ${seed}: ${a.name} 유형 중복`);
  }
}
// 같은 시드 → 같은 세트 (재현성)
const areas = activeAreas.map((a) => a.id);
const a1 = JSON.stringify(generateSet(TEMPLATES, 42, { areas, perArea: 3 }));
const a2 = JSON.stringify(generateSet(TEMPLATES, 42, { areas, perArea: 3 }));
if (a1 !== a2) fail('같은 시드에서 다른 세트가 나옴 (재현성 실패)');

// 리포트 분석 규칙
{
  const set = generateSet(TEMPLATES, 7, { areas, perArea: 3 });
  const right = set.map((q) => ({ picked: q.answerIndex, sec: 30 }));
  const wrongPick = (q: (typeof set)[number]) => (q.answerIndex + 1) % 5;
  const allRight = analyze(set, right, 360);
  if (allRight.correct !== set.length || allRight.areas.some((a) => a.level !== 'stable')) fail('리포트: 모두 맞히면 모든 영역이 안정이어야 함');
  if (allRight.areas.some((a) => a.patterns.length)) fail('리포트: 오답이 없는데 틀린 패턴이 나옴');

  const allWrong = analyze(set, set.map((q) => ({ picked: wrongPick(q), sec: 30 })), 360);
  if (allWrong.areas.some((a) => a.level !== 'focus')) fail('리포트: 모두 틀리면 모든 영역이 집중 필요여야 함');
  for (const a of allWrong.areas) {
    if (!a.patterns.length) fail(`리포트: ${a.meta.name} 오답인데 틀린 패턴 없음`);
    if (a.study[0]?.reason !== '틀린 유형') fail(`리포트: ${a.meta.name} 학습 순서가 틀린 유형부터가 아님`);
    if (new Set(a.study.map((s) => s.subtype)).size !== a.meta.studyOrder.length) fail(`리포트: ${a.meta.name} 학습 순서 누락/중복`);
  }

  // 첫 영역만 1문항 틀림 → 보완 필요, 우선순위 맨 앞
  const firstArea = set[0].area;
  const oneWrong = set.map((q, i) => ({ picked: i === 0 ? wrongPick(q) : q.answerIndex, sec: 30 }));
  const r1 = analyze(set, oneWrong, 360);
  const a1 = r1.areas.find((a) => a.meta.id === firstArea)!;
  if (a1.level !== 'improve') fail(`리포트: 3문항 중 2문항 정답이면 보완 필요여야 함 (${a1.level})`);
  if (r1.priority[0].meta.id !== firstArea) fail('리포트: 학습 우선순위가 수준 낮은 영역부터가 아님');
  if (a1.patterns[0]?.tag !== set[0].choices[wrongPick(set[0])].mistakeTag) fail('리포트: 틀린 패턴이 고른 보기의 mistakeTag와 다름');

  if (judge(1, 200, 75).level !== 'improve') fail('리포트: 모두 맞혀도 시간이 매우 길면 보완 필요여야 함');
  if (judge(1 / 3, 30, 75).level !== 'focus') fail('리포트: 1/3 정답은 집중 필요여야 함');
}

if (errors.length) {
  console.error(`\n검증 실패 ${errors.length}건${errors.length >= 200 ? ' (200건까지 표시)' : ''}:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log(`\n검증 통과: 템플릿 ${TEMPLATES.length}개, 세트 ${SETS}개 (실패 세트 ${setFail}), ${((Date.now() - t0) / 1000).toFixed(1)}초`);
