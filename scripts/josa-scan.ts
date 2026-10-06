/**
 * 기본 템플릿 조사 점검(개발용). build에는 연결하지 않는다.
 *   npx tsx scripts/josa-scan.ts              템플릿마다 시드 3,000개로 문제를 만들어 조사 의심 지점을 찾는다(오류가 있으면 exit 1)
 *   npx tsx scripts/josa-scan.ts --seeds 500  시드 수 바꾸기
 *   npx tsx scripts/josa-scan.ts --advanced   심화 템플릿(server/advanced/registry.ts)을 점검
 *   npx tsx scripts/josa-scan.ts --all        기본과 심화를 모두 점검
 *   npx tsx scripts/josa-scan.ts --self-test  검사기 자체 시험
 *
 * 숫자·영문자·괄호·따옴표·한글 단위 뒤에 붙은 조사(을/를, 은/는, 이/가, 과/와, (으)로, (이)라, (이)나, 이에요/예요)를 본다.
 * 앞말의 끝소리는 읽는 소리 기준이다. 숫자는 일·칠·팔(ㄹ 받침), 영·삼·육·십·백·천·만(받침), 이·사·오·구(받침 없음).
 * 결과는 세 갈래로 나눈다.
 *   오류: 규칙상 틀린 조사
 *   오탐: 조사처럼 보이지만 단어의 일부(예: 있는, 증가, 경로) — 아래 NOT_PARTICLE 목록
 *   판단 불가: 읽는 소리를 규칙으로 정할 수 없는 앞말(모르는 영문 약어, 기호 등)
 */
import { TEMPLATES } from '../server/registry.js';
import { ADVANCED_TEMPLATES } from '../server/advanced/registry.js';
import { Rng } from '../server/engine/rng.js';
import { makeProblem } from '../server/engine/set.js';
import type { Problem, Template } from '../server/engine/types.js';
import type { ChartSpec, Figure } from '../shared/charts/types.js';
import { eulReul, eunNeun, euro, gwaWa, iGa, iRa, ieyo } from '../server/templates/common.js';

type Final = 'none' | 'rieul' | 'other';

/** 한글 음절의 끝소리 */
function hangulFinal(ch: string): Final | null {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c > 11171) return null;
  const f = c % 28;
  return f === 0 ? 'none' : f === 8 ? 'rieul' : 'other';
}

/** 숫자를 읽었을 때 끝소리: 끝자리가 0이면 영·십·백·천·만(받침), 1·7·8은 ㄹ 받침, 3·6은 받침, 2·4·5·9는 받침 없음 */
export function numberFinal(n: string): Final {
  const d = n.replace(/,/g, '').slice(-1);
  if (d === '0' || d === '3' || d === '6') return 'other';
  if (d === '1' || d === '7' || d === '8') return 'rieul';
  return 'none';
}

/** 숫자 뒤 단위의 읽는 소리 */
const UNIT_FINAL: Record<string, Final> = {
  km: 'none', // 킬로미터
  m: 'none', // 미터
  cm: 'none',
  kg: 'other', // 킬로그램
  g: 'other', // 그램
  L: 'none', // 리터
  mL: 'none',
  t: 'none', // 톤으로 읽으면 받침이 있지만 템플릿은 '톤'을 한글로 쓴다
  TOE: 'none', // 티오이
  MWh: 'none', // 메가와트시
  ha: 'none', // 헥타르
};
/** 영문자 하나를 읽었을 때: 엘·알은 ㄹ 받침, 엠·엔은 받침, 나머지(에이·비·씨·엑스·와이 …)는 받침 없음 */
function letterFinal(ch: string): Final {
  const u = ch.toUpperCase();
  return u === 'L' || u === 'R' ? 'rieul' : u === 'M' || u === 'N' ? 'other' : 'none';
}

/** 조사: [받침 뒤, 받침 없을 때] */
const PAIRS: Record<string, [string, string]> = {
  을: ['을', '를'], 를: ['을', '를'],
  은: ['은', '는'], 는: ['은', '는'],
  이: ['이', '가'], 가: ['이', '가'],
  과: ['과', '와'], 와: ['과', '와'],
  이라: ['이라', '라'], 라: ['이라', '라'],
  이나: ['이나', '나'], 나: ['이나', '나'],
  으로: ['으로', '로'], 로: ['으로', '로'],
  // 서술격 조사 '이다'의 해요체
  이에요: ['이에요', '예요'], 예요: ['이에요', '예요'],
};
function want(pt: string, fin: Final): string {
  const [jong, none] = PAIRS[pt];
  if (pt === '로' || pt === '으로') return fin === 'other' ? '으로' : '로';
  return fin === 'none' ? none : jong;
}

/**
 * 오탐: 조사까지 합쳐서 단어의 일부인 것. 앞말 끝(한글)과 조사를 합친 꼴이 이 목록으로 끝나면 조사로 보지 않는다.
 * 실제 출력에서 확인한 것만 넣는다.
 */
const NOT_PARTICLE = /(있는|없는|않는|앉는|맞는|받는|같은|높은|낮은|많은|적은|작은|좋은|남은|넣은|담은|얻은|읽는|찾는|먹는|씻는|입는|걷는|묻는|닫는|늘어나는|이는가|는가|은가|인가|한가|큰가|남는|마을|골라|이은|찍는|뽑는|잇는|추이|증가|단가|평가|원가|정가|추가|물가|초과|경로|등산로|산책로|도로|통로|나이|사이|차이|길이|높이|넓이|깊이|올라|따라|달라|모아|이나|만나|모두|하나|어느|가장|부터는|에서는|에는|까지는|으로는|로는|보다는|와는|과는|에게는|만큼은|씩은|각각은|하은|서연이|민준이|도윤이|하은이)$/;

export type Kind = 'error' | 'fp' | 'unknown';
export interface Finding {
  kind: Kind;
  /** 앞말(조사 바로 앞 덩어리) */
  word: string;
  particle: string;
  /** 규칙상 맞는 조사(판단 불가면 null) */
  correct: string | null;
  /** 끝소리를 정한 근거 */
  basis: string;
}

/** 앞말의 끝소리. 괄호·따옴표는 그 앞(또는 안) 말로 정한다. */
function finalOf(word: string): { fin: Final | null; basis: string } {
  let w = word;
  // 닫는 따옴표: 따옴표 안 말의 끝
  w = w.replace(/['"’”]+$/, '');
  // 닫는 괄호: 괄호 앞 말에 맞춘다(괄호 안은 덧붙인 설명)
  while (w.endsWith(')')) {
    let depth = 0;
    let i = w.length - 1;
    for (; i >= 0; i--) {
      if (w[i] === ')') depth++;
      if (w[i] === '(' && --depth === 0) break;
    }
    // 괄호 앞에 말이 없으면 괄호 자체가 앞말이다(예: 순서쌍 "(1, 3)과") → 괄호 안 끝으로 정한다
    w = i <= 0 ? w.slice(1, -1).trim() : w.slice(0, i);
    if (!w) return { fin: null, basis: '빈 괄호' };
  }
  w = w.replace(/['"’‘“”]+$/, '');
  const last = w.slice(-1);
  if (!last) return { fin: null, basis: '앞말 없음' };
  const h = hangulFinal(last);
  if (h) return { fin: h, basis: `한글 '${last}'` };
  if (/%p$/.test(w)) return { fin: 'none', basis: '%p(퍼센트포인트)' };
  if (last === '%') return { fin: 'none', basis: '%(퍼센트)' };
  // 분수 a/b는 "b분의 a"로 읽으므로 분자로 정한다(분자가 문자면 그 글자)
  const frac = w.match(/([A-Za-z]|\d[\d,.]*)\/[\d,.]+$/);
  if (frac) return { fin: /\d/.test(frac[1]) ? numberFinal(frac[1]) : letterFinal(frac[1]), basis: `분수(분자 ${frac[1]})` };
  if (/\d/.test(last)) return { fin: numberFinal(w.match(/\d[\d,.]*$/)![0]), basis: `숫자 ${last}` };
  if (last === '!') {
    // 계승 n!은 "n 팩토리얼"로 읽는다
    if (/\d!$/.test(w)) return { fin: 'none', basis: '계승(팩토리얼)' };
    return { fin: null, basis: `기호 '${last}'` };
  }
  const letters = w.match(/[A-Za-z]+$/);
  if (letters) {
    const L = letters[0];
    const before = w.slice(0, -L.length);
    if (L in UNIT_FINAL && /\d$/.test(before)) return { fin: UNIT_FINAL[L], basis: `단위 ${L}` };
    if (L.length === 1) return { fin: letterFinal(L), basis: `영문자 ${L}` };
    if (L in UNIT_FINAL) return { fin: UNIT_FINAL[L], basis: `단위 ${L}` };
    // 대문자 약어(TF 등)는 글자 하나씩 읽으므로 마지막 글자로 정한다
    if (/^[A-Z]{2,4}$/.test(L)) return { fin: letterFinal(L.slice(-1)), basis: `영문 약어 ${L}(글자 단위로 읽음)` };
    return { fin: null, basis: `영문 '${L}'` };
  }
  return { fin: null, basis: `기호 '${last}'` };
}

const PARTICLE_RE = /((?:\([^()]*\)|\S)+?)(이에요|예요|으로|이라|이나|을|를|은|는|이|가|과|와|로|라|나)(?=$|[\s.,?!:;·…\]])/g;

/** 문자열 하나에서 조사 의심 지점을 찾는다. 맞는 조사는 결과에 넣지 않는다. */
export function scanText(s: string): Finding[] {
  const out: Finding[] = [];
  for (const m of s.matchAll(PARTICLE_RE)) {
    const word = m[1];
    const pt = m[2];
    // 앞말 안에 문장부호로 끊긴 앞부분이 있으면 마지막 덩어리만 본다(예: "A,B는")
    const { fin, basis } = finalOf(word);
    const lastCh = word.replace(/['"’”)]+$/, '').slice(-1);
    const hangulOnly = !!hangulFinal(lastCh) && !/[)'"’”]$/.test(word);
    if (fin === null) {
      out.push({ kind: 'unknown', word, particle: pt, correct: null, basis });
      continue;
    }
    const w = want(pt, fin);
    if (w === pt) continue;
    // 순한글 앞말은 조사가 아니라 단어의 일부일 수 있다
    if (hangulOnly && NOT_PARTICLE.test(word.replace(/^.*[^가-힣]/, '') + pt)) {
      out.push({ kind: 'fp', word, particle: pt, correct: w, basis });
      continue;
    }
    // 순한글 앞말인데 숫자·영문·괄호와 무관하고 목록에도 없으면 그래도 오류로 올린다(사람이 확인)
    out.push({ kind: 'error', word, particle: pt, correct: w, basis });
  }
  return out;
}

// ---------- 문제에서 화면·해설 문자열 모으기 ----------
function chartStrings(c: ChartSpec): string[] {
  if (c.type === 'scatter') return [c.title ?? '', c.xLabel, c.yLabel];
  if (c.type === 'pie') return [c.title ?? '', c.unit ?? '', ...c.labels];
  return [c.title ?? '', c.unit, ...c.labels];
}
function figureStrings(f: Figure): string[] {
  if (f.kind === 'chart') return chartStrings(f.spec);
  const t = f.table;
  return [t.caption ?? '', t.unit ?? '', ...t.head, ...t.rows.flat().map(String)];
}
export function problemStrings(p: Problem): { where: string; s: string }[] {
  return [
    { where: '문제', s: p.text },
    ...(p.figure ? figureStrings(p.figure).map((s) => ({ where: '자료', s })) : []),
    ...p.choices.flatMap((c) => [{ where: '보기', s: c.label }, ...(c.chart ? chartStrings(c.chart).map((s) => ({ where: '보기 그래프', s })) : [])]),
    ...p.steps.map((s) => ({ where: '해설', s })),
  ].filter((x) => x.s);
}

/** 묶는 열쇠: 한글 단위가 끝소리를 정하면 숫자를 N으로, 숫자가 정하면 끝자리만 남긴다(…3으로) */
const keyWord = (f: Finding) => (f.basis.startsWith('한글') ? f.word.replace(/\d[\d,.]*/g, 'N') : f.word.replace(/\d[\d,.]*(?=\d)/g, '…'));

function scanTemplates(templates: Template[], seeds: number) {
  const byTpl = new Map<string, Map<string, { kind: Kind; key: string; basis: string; count: number; example: string }>>();
  let problems = 0;
  let failed = 0;
  for (const tpl of templates) {
    const agg = new Map<string, { kind: Kind; key: string; basis: string; count: number; example: string }>();
    byTpl.set(tpl.id, agg);
    for (let seed = 0; seed < seeds; seed++) {
      let p: Problem;
      try {
        p = makeProblem(tpl, new Rng(seed));
      } catch {
        failed++;
        continue;
      }
      problems++;
      for (const { where, s } of problemStrings(p)) {
        for (const f of scanText(s)) {
          const key = `${keyWord(f)}${f.particle} → ${f.correct ?? '?'}`;
          const id = `${f.kind}|${where}|${key}`;
          const e = agg.get(id);
          if (e) e.count++;
          else agg.set(id, { kind: f.kind, key: `[${where}] ${key}`, basis: f.basis, count: 1, example: `${s.slice(0, 140)} (시드 ${seed})` });
        }
      }
    }
  }
  return { byTpl, problems, failed };
}

function selfTest() {
  const wrong = [
    '전체 일의 양을 최소공배수 40로 두면', // 사십 → 으로
    '6명이 앉는 방법은 4으로 나눠요.', // 사 → 로
    '청소년 입장권을 y장라 하면', // 장 → 이라
    '사과을 샀다.', // 과 → 를
    '7를 더한다.', // 칠 → 을
    '수지(수입 − 지출)을 나타낸', // 수지 → 를
    '소금 30g를 넣었다.', // 그램 → 을
    '시속 4km으로 걸었다.', // 킬로미터 → 로
    '중앙값은 13가 된다.', // 십삼 → 이
    '20%은 크다.', // 퍼센트 → 는
    '확률은 3/8가 된다.', // 팔분의 삼 → 이
    'B은 A과 같다.', // 비 → 는, 에이 → 와
  ];
  const right = [
    '전체 일의 양을 최소공배수 40으로 두면',
    '6명이 앉는 방법은 4로 나눠요.',
    '청소년 입장권을 y장이라 하면',
    '7을 더하고 2를 뺀다. 8로 나누고 3으로 곱한다. 10으로 나눈다. 100은 크다.',
    '수지(수입 − 지출)를 나타낸',
    '소금 30g을 넣었다. 시속 4km로 걸었다. 물 2L를 더했다.',
    '20%는 크다. 5%p가 늘었다. 확률은 3/8이 된다.',
    'B는 A와 같다. L은 크다. M이 있다. 직원 x명과 y명이 있다.',
    '두 사람이 같은 길을 걷는다. 증가율은 몇 %인가? 산책로로 갔다.',
  ];
  const fails: string[] = [];
  const counts = wrong.map((s) => scanText(s).filter((f) => f.kind === 'error').length);
  wrong.forEach((s, i) => counts[i] === 0 && fails.push(`잡지 못함: ${s}`));
  for (const s of right) {
    const errs = scanText(s).filter((f) => f.kind !== 'fp');
    if (errs.length) fails.push(`맞는 문장을 잡음: ${s} → ${errs.map((e) => `${e.word}${e.particle}(${e.kind})`).join(', ')}`);
  }
  // 숫자 끝소리 단위 시험
  const nf: [string, Final][] = [
    ['0', 'other'], ['1', 'rieul'], ['2', 'none'], ['3', 'other'], ['4', 'none'], ['5', 'none'], ['6', 'other'],
    ['7', 'rieul'], ['8', 'rieul'], ['9', 'none'], ['10', 'other'], ['20', 'other'], ['100', 'other'], ['1,000', 'other'],
    ['10000', 'other'], ['11', 'rieul'], ['2.5', 'none'], ['13', 'other'],
  ];
  for (const [n, f] of nf) if (numberFinal(n) !== f) fails.push(`숫자 끝소리 ${n}: ${numberFinal(n)} (기대 ${f})`);
  // 템플릿이 쓰는 조사 도우미(server/templates/common.ts) 단위 시험
  const helper: [string, string][] = [
    // (으)로: 삼·육·영·십·백·천·만은 "으로", 일·칠·팔(ㄹ)과 이·사·오·구는 "로"
    [euro('3'), '3으로'], [euro('6'), '6으로'], [euro('0'), '0으로'], [euro('10'), '10으로'], [euro('20'), '20으로'],
    [euro('100'), '100으로'], [euro('1,000'), '1,000으로'], [euro('10000'), '10000으로'], [euro('40'), '40으로'],
    [euro('1'), '1로'], [euro('7'), '7로'], [euro('8'), '8로'], [euro('2'), '2로'], [euro('4'), '4로'], [euro('5'), '5로'], [euro('9'), '9로'],
    [euro('2.5'), '2.5로'], [euro('지점'), '지점으로'], [euro('시험장'), '시험장으로'], [euro('회사'), '회사로'], [euro('서울'), '서울로'],
    [euro('L'), 'L로'], [euro('M'), 'M으로'],
    // 을/를, 은/는, 이/가, 과/와
    [eulReul('3'), '3을'], [eulReul('2'), '2를'], [eulReul('7'), '7을'], [eunNeun('10'), '10은'], [eunNeun('4'), '4는'],
    [iGa('32개'), '32개가'], [iGa('32건'), '32건이'], [iGa('5'), '5가'], [iGa('8'), '8이'], [gwaWa('6'), '6과'], [gwaWa('9'), '9와'],
    [eulReul('A'), 'A를'], [eunNeun('B'), 'B는'], [gwaWa('A 사원'), 'A 사원과'],
    // 분수는 분자로: 3/8 = 팔분의 삼
    [iGa('3/8'), '3/8이'], [iGa('1/2'), '1/2이'], [eulReul('5/36'), '5/36를'], [ieyo('18/72'), '18/72이에요'], [ieyo('d/30'), 'd/30예요'],
    // (이)라, 이에요/예요
    [iRa('y장'), 'y장이라'], [iRa('y건'), 'y건이라'], [iRa('y개'), 'y개라'], [iRa('y자루'), 'y자루라'], [iRa('1'), '1이라'],
    [ieyo('8장'), '8장이에요'], [ieyo('18개'), '18개예요'], [ieyo('130'), '130이에요'], [ieyo('125'), '125예요'], [ieyo('90/1800'), '90/1800이에요'],
  ];
  for (const [got, exp] of helper) if (got !== exp) fails.push(`조사 도우미: ${got} (기대 ${exp})`);
  // 도우미 결과를 검사기도 맞다고 보는가
  for (const [, exp] of helper) if (scanText(exp).some((f) => f.kind === 'error')) fails.push(`검사기와 도우미가 다르게 판단: ${exp}`);
  console.log(`검사기 시험: 틀린 문장 ${wrong.length}개 중 ${counts.filter((c) => c > 0).length}개 잡음, 맞는 문장 ${right.length}개 통과 확인, 숫자 끝소리 ${nf.length}개, 조사 도우미 ${helper.length}개`);
  if (fails.length) {
    fails.forEach((f) => console.error('FAIL ' + f));
    process.exit(1);
  }
}

const KIND_NAME: Record<Kind, string> = { error: '오류', fp: '오탐', unknown: '판단 불가' };

if (process.argv.includes('--self-test')) selfTest();
else {
  const si = process.argv.indexOf('--seeds');
  const seeds = si >= 0 ? Number(process.argv[si + 1]) : 3000;
  // 기본값은 기본 템플릿만(main과 같음). --advanced는 심화만, --all은 둘 다
  const templates = process.argv.includes('--all') ? [...TEMPLATES, ...ADVANCED_TEMPLATES] : process.argv.includes('--advanced') ? ADVANCED_TEMPLATES : TEMPLATES;
  const t0 = Date.now();
  const { byTpl, problems, failed } = scanTemplates(templates, seeds);
  const total: Record<Kind, number> = { error: 0, fp: 0, unknown: 0 };
  for (const [id, agg] of byTpl) {
    const items = [...agg.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count);
    if (!items.length) continue;
    console.log(`\n## ${id}`);
    for (const k of ['error', 'unknown', 'fp'] as Kind[]) {
      const list = items.filter((x) => x.kind === k);
      if (!list.length) continue;
      console.log(`  ${KIND_NAME[k]}`);
      for (const x of list) {
        total[k] += x.count;
        console.log(`    ${x.key}  ×${x.count}  (${x.basis})  예: ${x.example}`);
      }
    }
  }
  console.log(
    `\n템플릿 ${templates.length}개 × 시드 ${seeds}개: 문제 ${problems}개(생성 실패 ${failed}), 오류 ${total.error}건, 판단 불가 ${total.unknown}건, 오탐 ${total.fp}건, ${((Date.now() - t0) / 1000).toFixed(1)}초`,
  );
  if (total.error) process.exit(1);
}
