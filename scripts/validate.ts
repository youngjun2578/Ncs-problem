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
import { TEMPLATES } from '../src/registry';
import { AREAS } from '../src/areas';
import { Rng } from '../src/engine/rng';
import { buildChoices, hasBadToken, isValidValue } from '../src/engine/choices';
import { generateSet } from '../src/engine/set';
import { hasAtMostDecimals } from '../src/engine/format';
import { MISTAKES } from '../src/engine/mistakes';
import { renderChart, renderTable } from '../src/charts/render';
import type { Figure } from '../src/charts/types';

const PER_TEMPLATE = Number(process.env.PER_TEMPLATE ?? 3000);
const SETS = Number(process.env.SETS ?? 3000);
const MIN_TEMPLATES_PER_AREA = 5;
const MAX_FILLER_RATE = 0.25;
const MIN_PHRASINGS = 3;
/** 단계별 구현 중에는 비어 있는 영역을 경고로만 처리한다. 모든 영역이 갖춰지면 true. */
const STRICT_COVERAGE = false;

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

console.log(`템플릿 ${TEMPLATES.length}개 × ${PER_TEMPLATE}회 생성 검사`);
const rows: Record<string, string | number>[] = [];

for (const tpl of TEMPLATES) {
  const skeletons = new Set<string>();
  const tags = new Set<string>();
  let fillers = 0;
  let generated = 0;
  for (let i = 0; i < PER_TEMPLATE; i++) {
    const rng = new Rng(i * 7919 + 13);
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
  rows.push({
    id: tpl.id,
    유형: tpl.subtype,
    난이도: tpl.difficulty,
    성공: `${generated}/${PER_TEMPLATE}`,
    문장틀: skeletons.size,
    실수태그: tags.size,
    근접값: `${(fillerRate * 100).toFixed(1)}%`,
  });
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
  const seed = (s * 2654435761) >>> 0;
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

if (errors.length) {
  console.error(`\n검증 실패 ${errors.length}건${errors.length >= 200 ? ' (200건까지 표시)' : ''}:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log(`\n검증 통과: 템플릿 ${TEMPLATES.length}개, 세트 ${SETS}개 (실패 세트 ${setFail})`);
