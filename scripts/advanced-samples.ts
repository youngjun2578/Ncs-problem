/**
 * 심화 문제 샘플 문서(사람이 직접 풀어 보는 용도). build에는 연결하지 않는다.
 *   npx tsx scripts/advanced-samples.ts > docs/advanced-samples.md   문서 출력
 *   npx tsx scripts/advanced-samples.ts --check docs/advanced-samples.md   문서 검사(정답·해설 숫자·계산식·문구)
 *   npx tsx scripts/advanced-samples.ts --self-test   검산기 시험(맞는 식은 통과, 일부러 틀린 식은 잡는지)
 *
 * 문제는 makeProblem(템플릿, new Rng(시드))로 만든다. 시드는 문서에 적어 두므로 같은 문제를 다시 만들 수 있다.
 * 심화 16개 템플릿 × 2문제, 비교용 기본 4개 영역 × 2문제(영역에서 난이도가 가장 높은 기본 유형 2개).
 */
import { readFileSync } from 'node:fs';
import { ADVANCED, type AdvancedKind } from '../server/advanced/registry.js';
import { ADVANCED_TARGET_SEC } from '../server/advanced/constants.js';
import { TEMPLATES } from '../server/registry.js';
import { AREA_BY_ID } from '../server/areas.js';
import { Rng } from '../server/engine/rng.js';
import { makeProblem } from '../server/engine/set.js';
import type { AreaId, Problem, Template } from '../server/engine/types.js';
import type { ChartSpec, Figure } from '../shared/charts/types.js';
import { num } from '../shared/format.js';

const MARK = ['①', '②', '③', '④', '⑤'];
const AREA_ORDER: AreaId[] = ['arith', 'stats', 'chartRead', 'chartMake'];
/** 같은 시드로 보기를 만들지 못하면 시드에 이 값을 더해 다시 시도한다(쓴 시드를 문서에 적는다) */
const SEED_STEP = 10;

interface Sample {
  no: string;
  tpl: Template;
  kind: AdvancedKind | 'basic';
  seed: number;
  p: Problem;
}

/** 시드에서 문제를 만든다. 실패하거나 앞 문제와 문장이 같으면 시드를 SEED_STEP씩 올린다. */
function sample(tpl: Template, seed: number, avoid: Set<string>): { seed: number; p: Problem } {
  for (let s = seed, i = 0; i < 50; s += SEED_STEP, i++) {
    try {
      const p = makeProblem(tpl, new Rng(s));
      if (!avoid.has(p.text)) return { seed: s, p };
    } catch {
      // 숫자 조건이나 보기 구성이 맞지 않는 시드는 건너뛴다
    }
  }
  throw new Error(`샘플 생성 실패: ${tpl.id}`);
}

function collect(): { adv: Sample[]; basic: Sample[] } {
  const adv: Sample[] = [];
  ADVANCED.forEach(({ tpl, kind }, i) => {
    const seen = new Set<string>();
    for (const j of [1, 2]) {
      const { seed, p } = sample(tpl, 1000 * (i + 1) + j, seen);
      seen.add(p.text);
      adv.push({ no: `A${String(i + 1).padStart(2, '0')}-${j}`, tpl, kind, seed, p });
    }
  });
  const basic: Sample[] = [];
  AREA_ORDER.forEach((area, a) => {
    const picks = TEMPLATES.map((t, i) => ({ t, i }))
      .filter(({ t }) => t.area === area)
      .sort((x, y) => y.t.difficulty - x.t.difficulty || x.i - y.i)
      .slice(0, 2)
      .map(({ t }) => t);
    picks.forEach((tpl, k) => {
      const { seed, p } = sample(tpl, 90000 + 100 * (a + 1) + k + 1, new Set());
      basic.push({ no: `B${a + 1}-${k + 1}`, tpl, kind: 'basic', seed, p });
    });
  });
  return { adv, basic };
}

// ---------- 마크다운 ----------
const cell = (v: string | number) => String(typeof v === 'number' ? num(v) : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const row = (cells: (string | number)[]) => `| ${cells.map(cell).join(' | ')} |`;
const table = (head: (string | number)[], rows: (string | number)[][]) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
const anchor = (s: Sample) => s.no.toLowerCase();

const CHART_KIND: Record<ChartSpec['type'], string> = { bar: '막대그래프', line: '꺾은선그래프', pie: '원그래프', scatter: '점그래프' };
function chartKind(c: ChartSpec) {
  return c.type === 'bar' && c.horizontal ? '가로 막대그래프' : CHART_KIND[c.type];
}
/** 그래프가 나타내는 값을 [항목, 값] 쌍으로 */
function chartPairs(c: ChartSpec): [string, string][] {
  if (c.type === 'scatter') return c.xs.map((x, i) => [`점 ${i + 1}`, `${c.xLabel} ${num(x)}, ${c.yLabel} ${num(c.ys[i])}`]);
  if (c.type === 'pie') {
    const total = c.values.reduce((a, b) => a + b, 0);
    return c.labels.map((l, i) => [l, c.showValues ? `${num(c.values[i])}${c.unit ? ' ' + c.unit : ''}` : `${num((c.values[i] / total) * 100)}%`]);
  }
  return c.labels.map((l, i) => [l, `${num(c.values[i])}`]);
}
function chartUnit(c: ChartSpec) {
  return c.type === 'scatter' ? '' : c.type === 'pie' ? (c.showValues && c.unit ? c.unit : '%') : c.unit;
}

function figureMd(f: Figure): string {
  if (f.kind === 'table') {
    const t = f.table;
    const cap = [t.caption, t.unit && `단위: ${t.unit}`].filter(Boolean).join(' · ');
    return `${cap ? `*${cap}*\n\n` : ''}${table(t.head, t.rows)}`;
  }
  const c = f.spec;
  const pairs = chartPairs(c);
  const cap = [c.title, `${chartKind(c)}로 주어진 자료`, chartUnit(c) && `단위: ${chartUnit(c)}`].filter(Boolean).join(' · ');
  return `*${cap}*\n\n${table(['항목', ...pairs.map((p) => p[0])], [['값', ...pairs.map((p) => p[1])]])}`;
}

/** 보기가 그래프인 문제: 보기별로 그래프가 나타내는 값을 한 표에 */
function choiceChartsMd(p: Problem): string {
  const specs = p.choices.map((c) => c.chart!);
  const labels = chartPairs(specs[0]).map((x) => x[0]);
  const same = specs.every((s) => JSON.stringify(chartPairs(s).map((x) => x[0])) === JSON.stringify(labels));
  if (same) {
    const units = specs.map(chartUnit);
    const oneUnit = units.every((u) => u === units[0]);
    return `*보기별 그래프가 나타내는 값${oneUnit && units[0] ? ` (단위: ${units[0]})` : ''}*\n\n${table(
      ['보기', '그래프', ...(oneUnit ? [] : ['단위']), ...labels],
      specs.map((s, i) => [MARK[i], chartKind(s), ...(oneUnit ? [] : [units[i] || '-']), ...chartPairs(s).map((x) => x[1])]),
    )}`;
  }
  return `*보기별 그래프가 나타내는 값*\n\n${table(
    ['보기', '그래프', '단위', '값'],
    specs.map((s, i) => [MARK[i], chartKind(s), chartUnit(s) || '-', chartPairs(s).map((x) => `${x[0]} ${x[1]}`).join(', ')]),
  )}`;
}

const kindName = (k: Sample['kind']) => (k === 'extended' ? '확장(기존 유형을 키움)' : k === 'new' ? '신규' : '기본');
const estSec = (s: Sample) => (s.kind === 'basic' ? AREA_BY_ID[s.tpl.area].targetSec : ADVANCED_TARGET_SEC[s.tpl.area]);

function problemMd(s: Sample): string {
  const { p, tpl } = s;
  const isChart = p.choices.every((c) => c.chart);
  const out: string[] = [];
  out.push(`<a id="${anchor(s)}"></a>\n\n### ${s.no}. ${tpl.subtype}`);
  out.push(
    table(
      ['항목', '내용'],
      [
        ['템플릿 id', `\`${tpl.id}\``],
        ['이름', tpl.subtype],
        ['영역', AREA_BY_ID[tpl.area].name],
        ['구분', kindName(s.kind)],
        ['템플릿 난이도(1~3)', String(tpl.difficulty)],
        ['시드', String(s.seed)],
        ['풀이 단계 수', `${p.steps.length}단계`],
        ['예상 풀이 시간', `${s.kind === 'basic' ? '[가정]' : '[사용자 결정]'} ${estSec(s)}초`],
      ],
    ),
  );
  out.push(`**문제**\n\n${p.text}`);
  if (p.figure) out.push(`**자료**\n\n${figureMd(p.figure)}`);
  out.push(`**보기**\n\n${p.choices.map((c, i) => `- ${MARK[i]} ${c.label}`).join('\n')}`);
  if (isChart) out.push(choiceChartsMd(p));
  const ans = p.choices[p.answerIndex];
  out.push(
    [
      '<details><summary>정답과 해설 (다 푼 뒤에 펼치기)</summary>',
      '',
      `**정답**: ${MARK[p.answerIndex]} ${ans.label}`,
      ...(isChart ? ['', `정답 그래프는 위 값 표의 ${MARK[p.answerIndex]}번 줄입니다.`] : []),
      '',
      '**해설**',
      '',
      ...p.steps.map((st, i) => `${i + 1}. ${st}`),
      '',
      '</details>',
    ].join('\n'),
  );
  out.push(
    `**직접 채울 칸**\n\n${table(['내가 푼 시간(초)', '정답 여부', '문장 자연스러움(좋음/어색)', '난이도(쉬움/적당/어려움)', '메모'], [[' ', ' ', ' ', ' ', ' ']])}`,
  );
  return out.join('\n\n');
}

function render(): string {
  const { adv, basic } = collect();
  const toc = (list: Sample[]) => list.filter((s) => s.no.endsWith('-1')).map((s) => {
    const two = list.filter((x) => x.tpl.id === s.tpl.id);
    return `- ${s.no.slice(0, -2)} ${s.tpl.subtype} (\`${s.tpl.id}\`, ${AREA_BY_ID[s.tpl.area].name}, ${kindName(s.kind)}): ${two.map((x) => `[${x.no}](#${anchor(x)})`).join(' · ')}`;
  });
  const basicToc = basic.map((s) => `- [${s.no}](#${anchor(s)}) ${s.tpl.subtype} (\`${s.tpl.id}\`, ${AREA_BY_ID[s.tpl.area].name})`);
  const parts: string[] = [
    '# 심화 문제 샘플',
    '',
    '심화 템플릿 16개에서 2문제씩(32문제), 비교용으로 기본 템플릿에서 영역마다 2문제씩(8문제)을 고정 시드로 뽑았습니다. 이 문서는 `scripts/advanced-samples.ts`가 만듭니다.',
    '',
    '## 사용법',
    '',
    '문제 하나마다 시계(휴대전화 스톱워치 등)를 켜고 "문제"부터 읽기 시작해, 보기 하나를 고르는 순간 시계를 멈춥니다. 걸린 시간을 초 단위로 "내가 푼 시간(초)"에 적고, 그다음 "정답과 해설"을 펼쳐 맞았는지 "정답 여부"에 적습니다. 문장이 읽기 어색했는지, 체감 난이도가 어땠는지, 고칠 점이 있었는지를 나머지 칸에 적습니다. 계산은 종이와 펜만 쓰는 것을 기준으로 합니다. 심화 문제를 다 푼 뒤 뒤쪽 기본 비교 문제도 같은 방법으로 풀면 두 수준의 시간 차이를 비교할 수 있습니다.',
    '',
    '- "예상 풀이 시간"은 영역별 권장 시간 설정값을 그대로 적었습니다. 심화는 [사용자 결정](10/6, 1문항 90초, `server/advanced/constants.ts`)이고, 기본은 [가정](`server/areas.ts`, 실제로 재 본 값이 아님)입니다.',
    '- "풀이 단계 수"는 해설 줄 수입니다.',
    '- 도표작성 문제의 보기는 원래 그래프입니다. 이 문서에서는 그래프를 그릴 수 없으므로 보기마다 그래프가 나타내는 값을 표로 적었습니다.',
    `- 다시 만들기: \`makeProblem(템플릿, new Rng(시드))\`(\`server/engine/set.ts\`, \`server/engine/rng.ts\`). 정해 둔 시드로 보기를 만들지 못하면 시드에 ${SEED_STEP}씩 더해 다시 뽑으며, 문서의 시드는 실제로 쓴 값입니다. 심화 시드는 1000×(템플릿 번호)+(1 또는 2)에서, 기본 시드는 90000+100×(영역 번호)+(1 또는 2)에서 시작합니다.`,
    '- 기본 비교 문제는 영역마다 기본 템플릿 가운데 난이도가 가장 높은 2개(같으면 등록 순서)에서 뽑았습니다.',
    '',
    '## 목차',
    '',
    '### 심화 템플릿 16개',
    '',
    ...toc(adv),
    '',
    '### 기본 비교 8문제',
    '',
    ...basicToc,
    '',
    '## 심화 문제',
    '',
    ...adv.flatMap((s) => [problemMd(s), '', '---', '']),
    '## 기본 비교 문제',
    '',
    ...basic.flatMap((s) => [problemMd(s), '', '---', '']),
  ];
  return parts.join('\n').replace(/\n---\n\n$/, '\n');
}

// ---------- 검사 ----------
/** 한글 음절의 받침 유무(ㄹ 받침은 따로) */
function finalOf(ch: string): 'none' | 'rieul' | 'other' | null {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c > 11171) return null;
  const f = c % 28;
  return f === 0 ? 'none' : f === 8 ? 'rieul' : 'other';
}
/** 숫자를 읽었을 때 끝소리: 영·삼·육·십·백·천·만은 받침, 일·칠·팔은 ㄹ 받침, 이·사·오·구는 받침 없음 */
function finalOfNumber(n: string): 'none' | 'rieul' | 'other' {
  const s = n.replace(/,/g, '');
  const d = s.slice(-1);
  if (d === '0') return 'other';
  return '178'.includes(d) ? 'rieul' : '36'.includes(d) ? 'other' : 'none';
}
/** 조사: [받침 있을 때, 받침 없을 때] */
const PARTICLES: [string, string][] = [
  ['을', '를'],
  ['은', '는'],
  ['이', '가'],
  ['과', '와'],
  ['이나', '나'],
  ['이라', '라'],
  ['으로', '로'],
];
/** 조사처럼 보이지만 단어의 일부인 것(검사 제외) */
const WORD_END = /(있는|없는|맞는|하는|되는|가는|오는|나는|받는|같은|높은|낮은|많은|적은|작은|좋은|남은|늦은|빠른|다른|이른|기는|모든|어떤|증가|단가|평가|원가|정가|추가|물가|시가|결과|효과|초과|나이|사이|차이|길이|높이|넓이|깊이|가장|는가|인가|않는|앉는|경로|하은)$/;

function particleIssues(text: string): string[] {
  const issues: string[] = [];
  // 앞말(한글·숫자·닫는 괄호/따옴표/%) 바로 뒤에 붙고, 뒤가 공백·문장부호·끝인 조사만 본다
  const re = /([가-힣0-9][가-힣0-9,.]*?)?(\([^()]*\)|['"’”%])?(으로|이나|이라|을|를|은|는|이|가|과|와|로|나|라)(?=$|[\s.,?!:;)·…'"’”])/g;
  for (const m of text.matchAll(re)) {
    const word = m[1] ?? '';
    const tail = m[2] ?? '';
    const pt = m[3];
    if (!word) continue; // 앞말 없이 괄호·기호만 있으면 판단하지 않는다
    // 조사까지 합쳐 흔한 단어 끝이면 건너뛴다(예: 있는, 증가, 결과)
    if (!tail && !/[0-9]$/.test(word) && WORD_END.test(word + pt)) continue;
    const last = word.slice(-1);
    const fin = tail === '%' ? 'none' /* 퍼센트 */ : /[0-9]/.test(last) ? finalOfNumber(word.match(/[0-9][0-9,.]*$/)![0]) : finalOf(last);
    if (!fin) continue;
    const pair = PARTICLES.find(([a, b]) => a === pt || b === pt)!;
    let want: string;
    if (pair[0] === '으로') want = fin === 'other' ? '으로' : '로';
    else want = fin === 'none' ? pair[1] : pair[0];
    if (want !== pt) issues.push(`${word}${tail}${pt} → ${word}${tail}${want}`);
  }
  return issues;
}

const nums = (s: string) => [...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ''));

/** 사칙연산 식의 값(괄호 짝이 맞고 숫자·연산자·분수만 있을 때). 아니면 null. 분수 a/b는 한 덩어리 (a/b)로 계산한다 */
function evalExpr(e: string): number | null {
  e = e.replace(/\u2032/g, '');
  if (!/\d/.test(e) || !/^[\d.\s+−×÷()/]+$/.test(e)) return null;
  let depth = 0;
  for (const c of e) {
    if (c === '(') depth++;
    if (c === ')' && --depth < 0) return null;
  }
  if (depth !== 0) return null;
  try {
    const js = e
      .replace(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/g, '($1/$2)')
      .replace(/−/g, '-')
      .replace(/×/g, '*')
      .replace(/÷/g, '/');
    if (/\/\s*\//.test(js)) return null;
    const v = Function(`return ${js}`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * 숫자 뒤에 붙은 단위는 계산에서 빼고 숫자만 남긴다(빠진 자리에 ′ 표시를 남겨 형식을 센다).
 * 예: "10억 원 ÷ 50천 명 = 0.2 (억 원/천 명)" → "10′ ÷ 50′ = 0.2"
 */
const UNIT = /(\d)\s?(?:(?:억|천|만|백만)\s?)?(?:원|명|달러|개|건|점|km|g|분|시간|가지|%)/g;
function stripUnits(line: string): string {
  return line.replace(/\s*\((?=[^()\d]*\))[^()]*[가-힣][^()]*\)/g, '').replace(UNIT, '$1\u2032');
}

/** 검산한 식의 형식: 단위가 붙은 식, 분수(곱) 식, 그 밖의 식 */
type EqKind = '단위 식' | '분수 식' | '일반 식';
const kindOf = (seg: string): EqKind => (/\u2032/.test(seg) ? '단위 식' : /\d\/\d/.test(seg) ? '분수 식' : '일반 식');

/**
 * 해설 한 줄의 "식 = 값"(이어진 "= … =" 포함)을 검산한다.
 * 소수로 반올림한 값은 0.05 또는 0.05% 이내면 맞음, 분수로 적은 값은 정확히 같아야 맞음.
 */
function checkArithmetic(line: string): { ok: number; bad: string[]; kinds: Record<EqKind, number> } {
  const norm = stripUnits(line.replace(/(\d),(?=\d{3}(?!\d))/g, '$1'));
  let ok = 0;
  const bad: string[] = [];
  const kinds: Record<EqKind, number> = { '단위 식': 0, '분수 식': 0, '일반 식': 0 };
  for (const run of norm.match(/[\d.\s+−×÷()/=\u2032]*=[\d.\s+−×÷()/=\u2032]*/g) ?? []) {
    const segs = run.split('=').map((x) => x.trim());
    for (let i = 0; i + 1 < segs.length; i++) {
      const l = evalExpr(segs[i]);
      const r = evalExpr(segs[i + 1]);
      if (l === null || r === null || !/[+−×÷]|\d\/\d/.test(segs[i])) continue;
      // 분수 하나를 그대로 옮겨 적은 "a/b = a/b"는 계산식이 아니다
      if (!/[+−×÷]/.test(segs[i]) && segs[i] === segs[i + 1]) continue;
      const exact = /\d\/\d/.test(segs[i + 1]);
      const show = (x: string) => x.replace(/\u2032/g, '');
      if (exact ? Math.abs(l - r) < 1e-9 : Math.abs(l - r) <= Math.max(0.051, Math.abs(r) * 0.0005)) {
        ok++;
        kinds[kindOf(segs[i] + segs[i + 1])]++;
      } else bad.push(`${show(segs[i])} = ${show(segs[i + 1])} (계산하면 ${l})`);
    }
  }
  return { ok, bad, kinds };
}

/** 검산기 자체 시험: 맞는 식은 통과하고, 일부러 틀린 식은 잡아야 한다 */
function selfTest() {
  const good = [
    '2019년: 10억 원 ÷ 50천 명 = 0.2 (억 원/천 명), 2020년: 18억 원 ÷ 60천 명 = 0.3 (억 원/천 명)',
    '3/8 × 2/7 × 5/6 = 30/336',
    '확률 = 3 × 30/336 = 90/336 = 15/56',
    '1 − 10/56 = 46/56 = 23/28',
    '정가 = 12,000원 × 160/100 = 19,200원',
    '증가율 = (172.7 − 110) ÷ 110 × 100 = 57%',
    '옮긴 뒤 C 지점: 총점 1,215 − 280 = 935점, 인원 15 − 5 = 10명',
  ];
  const wrong = [
    '10억 원 ÷ 50천 명 = 0.3',
    '3/8 × 2/7 × 5/6 = 31/336',
    '확률 = 3 × 30/336 = 91/336',
    '1 − 10/56 = 46/56 = 23/27',
    '정가 = 12,000원 × 160/100 = 19,300원',
    '증가율 = (172.7 − 110) ÷ 110 × 100 = 58%',
    '인원 15 − 5 = 11명',
  ];
  const fails: string[] = [];
  for (const g of good) {
    const r = checkArithmetic(g);
    if (r.bad.length || r.ok === 0) fails.push(`맞는 식을 통과시키지 못함: ${g} (맞음 ${r.ok}, 틀림 ${r.bad.join(' / ')})`);
  }
  for (const w of wrong) if (checkArithmetic(w).bad.length === 0) fails.push(`틀린 식을 잡지 못함: ${w}`);
  const none = checkArithmetic('지수는 2018년을 100으로 둔 상댓값이에요.');
  if (none.ok || none.bad.length) fails.push('식이 없는 줄에서 식을 찾음');
  console.log(`검산기 시험: 맞는 식 ${good.length}줄, 틀린 식 ${wrong.length}줄`);
  if (fails.length) {
    fails.forEach((f) => console.error('FAIL ' + f));
    process.exit(1);
  }
  console.log('검산기 시험 통과');
}

function check(file: string) {
  const md = readFileSync(file, 'utf8');
  const sections = md.split(/\n(?=<a id="[ab]\d)/).slice(1);
  const fails: string[] = [];
  let ansOk = 0;
  let numOk = 0;
  let eqOk = 0;
  const eqKinds: Record<EqKind, number> = { '단위 식': 0, '분수 식': 0, '일반 식': 0 };
  const numMiss: string[] = [];
  const textIssues: string[] = [];
  for (const sec of sections) {
    const id = sec.match(/^### (\S+)\./m)![1];
    const tpl = sec.match(/템플릿 id \| `([^`]+)`/)![1];
    const seed = sec.match(/\| 시드 \| ([\d,]+) \|/)![1];
    const choices = [...sec.matchAll(/^- ([①-⑤]) (.*)$/gm)].map((m) => ({ mark: m[1], label: m[2] }));
    const am = sec.match(/^\*\*정답\*\*: ([①-⑤]) (.*)$/m);
    if (choices.length !== 5) fails.push(`${id}: 보기 ${choices.length}개`);
    if (!am) {
      fails.push(`${id}: 정답 줄 없음`);
      continue;
    }
    const hits = choices.filter((c) => c.label === am[2]);
    if (hits.length === 1 && hits[0].mark === am[1]) ansOk++;
    else fails.push(`${id}: 정답이 보기와 정확히 하나 일치하지 않음(일치 ${hits.length}개)`);
    const sol = sec.slice(sec.indexOf('**해설**'), sec.indexOf('</details>'));
    for (const line of sol.split('\n')) {
      const a = checkArithmetic(line);
      eqOk += a.ok;
      for (const k of Object.keys(eqKinds) as EqKind[]) eqKinds[k] += a.kinds[k];
      a.bad.forEach((b) => fails.push(`${id}: 해설 계산식이 맞지 않음 ${b}`));
    }
    const solNums = new Set(nums(sol));
    // 정답 표시 문자열의 숫자가 해설에 나오는가(그래프 보기는 단위 안 숫자를 뺀 값들)
    const ansNums = nums(am[2].replace(/\(단위: [^)]*\)/, ''));
    const missing = ansNums.filter((n) => !solNums.has(n));
    if (missing.length === 0) numOk++;
    else numMiss.push(`${id} (\`${tpl}\`, 시드 ${seed}): 정답 "${am[2]}"의 ${missing.join(', ')}이(가) 해설에 없음`);
    // 문구 검사: 문제·자료·보기·해설 전체(사람이 채울 칸 제외)
    const body = sec.slice(0, sec.indexOf('**직접 채울 칸**'));
    for (const bad of ['undefined', 'NaN', '[object', 'Infinity', 'null']) if (body.includes(bad)) textIssues.push(`${id} (\`${tpl}\`, 시드 ${seed}): "${bad}" 포함`);
    for (const line of body.split('\n')) {
      if (line.startsWith('|') && /템플릿 id|시드|예상 풀이/.test(line)) continue;
      for (const iss of particleIssues(line)) textIssues.push(`${id} (\`${tpl}\`, 시드 ${seed}): ${iss} — "${line.trim().slice(0, 120)}"`);
    }
  }
  for (const bad of ['undefined', 'NaN', '[object']) if (md.includes(bad)) fails.push(`문서 전체에 "${bad}" 포함`);
  console.log(`문제 ${sections.length}개`);
  console.log(`정답이 보기와 정확히 하나 일치: ${ansOk}/${sections.length}`);
  console.log(`정답 숫자가 해설에 모두 나옴: ${numOk}/${sections.length}`);
  console.log(`해설 계산식 검산: ${eqOk}개 맞음 (${Object.entries(eqKinds).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  numMiss.forEach((m) => console.log('  [해설 숫자] ' + m));
  console.log(`문구 의심 ${textIssues.length}건`);
  textIssues.forEach((m) => console.log('  [문구] ' + m));
  if (fails.length) {
    fails.forEach((f) => console.error('FAIL ' + f));
    process.exit(1);
  }
}

const ci = process.argv.indexOf('--check');
if (process.argv.includes('--self-test')) selfTest();
else if (ci >= 0) check(process.argv[ci + 1] ?? 'docs/advanced-samples.md');
else process.stdout.write(render());
