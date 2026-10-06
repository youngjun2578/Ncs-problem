/**
 * 해설 문구 점검(개발용). build에는 연결하지 않는다.
 *   npx tsx scripts/explain-scan.ts              기본 템플릿마다 시드 3,000개로 해설을 만들어 의심 지점을 찾는다(있으면 exit 1)
 *   npx tsx scripts/explain-scan.ts --seeds 500  시드 수 바꾸기
 *   npx tsx scripts/explain-scan.ts --advanced   심화 템플릿만
 *   npx tsx scripts/explain-scan.ts --all        기본과 심화
 *   npx tsx scripts/explain-scan.ts --self-test  검사기 자체 시험
 *
 * 찾는 것
 *  - 같은 값 되풀이: 등호 양쪽이 똑같은 식("5/36 = 5/36")
 *  - 약분하지 않은 결과 분수: 계산의 결과로 적은 분수("… = 48/432")가 약분되는데 같은 줄에서 기약분수로 고쳐 적지 않은 경우.
 *    "3/6 × 2/5"처럼 개수를 그대로 쓴 입력 분수, 퍼센트를 나타내는 x/100(·x/10·x/1000)은 뺀다
 *  - 시간 단위 섞임: "하루(한 시간)"처럼 단위를 괄호로 겹쳐 쓴 표현, 또는 문제는 '시간'을 묻는데 해설이 '하루·일수·날'로 말하는 경우(반대도)
 */
import { TEMPLATES } from '../server/registry.js';
import { ADVANCED_TEMPLATES } from '../server/advanced/registry.js';
import { Rng } from '../server/engine/rng.js';
import { makeProblem } from '../server/engine/set.js';
import type { Template } from '../server/engine/types.js';

const arg = (k: string) => process.argv.includes(k);
const SEEDS = Number(process.argv[process.argv.indexOf('--seeds') + 1] ?? 3000) || 3000;

export type Kind = '같은 값 되풀이' | '약분하지 않은 분수' | '시간 단위 섞임';

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const EXPR = /[\d,./+−×÷^()\s]*/;

/** 해설 한 줄과(필요하면) 문제 문장에서 의심 지점을 찾는다. 결과는 [종류, 줄임 표기] */
export function scanLine(step: string, text = ''): [Kind, string][] {
  const out: [Kind, string][] = [];
  // 같은 값 되풀이: 이웃한 등호 양쪽의 끝 식과 첫 식이 같으면
  const segs = step.split(/\s=\s/);
  for (let k = 0; k + 1 < segs.length; k++) {
    const L = segs[k].match(new RegExp(EXPR.source + '$'))![0].trim().replace(/^\(+|\)+$/g, '');
    const R = segs[k + 1].match(new RegExp('^' + EXPR.source))![0].trim().replace(/,$/, '').replace(/^\(+|\)+$/g, '');
    if (/\d/.test(L) && L === R) out.push(['같은 값 되풀이', `${L} = ${R}`]);
  }
  // 약분하지 않은 분수
  // "= a/b" 뒤에 다른 연산이 이어지지 않는 분수(식의 결과)만 본다
  for (const m of step.matchAll(/=\s*(\d+)\/(\d+)(?![\d./])(?!\s*[+−×÷^])/g)) {
    const n = Number(m[1]), d = Number(m[2]);
    if ([10, 100, 1000].includes(d) || d === 0 || gcd(n, d) === 1) continue;
    const g = gcd(n, d);
    const red = d / g === 1 ? `${n / g}` : `${n / g}/${d / g}`;
    // 같은 줄 뒤쪽에 기약분수(또는 그 값)가 나오면 약분 과정을 보여 준 것으로 본다
    const after = step.slice((m.index ?? 0) + m[0].length);
    if (new RegExp(`=\\s*${red.replace('/', '\\/')}(?![\\d/])`).test(after)) continue;
    out.push(['약분하지 않은 분수', `${m[1]}/${m[2]}${d >= 100 ? ' (분모 100 이상)' : ''}`]);
  }
  // 시간 단위 섞임
  if (/(하루|한 시간|일|시간|분)\((하루|한 시간|일|시간|분)\)/.test(step)) out.push(['시간 단위 섞임', step.match(/\S*\((하루|한 시간|일|시간|분)\)/)![0]]);
  const asksHours = /시간이 걸|몇 시간/.test(text) && !/일이 걸|며칠/.test(text);
  const asksDays = /일이 걸|며칠/.test(text) && !/시간이 걸|몇 시간/.test(text);
  if (asksHours && /하루|일수|걸리는 날/.test(step)) out.push(['시간 단위 섞임', '문제는 시간, 해설은 하루·일수·날']);
  if (asksDays && /한 시간|시간당/.test(step)) out.push(['시간 단위 섞임', '문제는 일, 해설은 한 시간']);
  return out;
}

function selfTest() {
  const cases: [string, string, Kind[]][] = [
    ['확률 = 5/36 = 5/36', '', ['같은 값 되풀이']],
    ['(조합으로 보면 3C2 ÷ 6C2 = 3/15 = 1/5)', '', []],
    ['(조합으로 보면 3C2 ÷ 7C2 = 3/21 = 3/21)', '', ['같은 값 되풀이', '약분하지 않은 분수']],
    ['1/12 + 1/36 = 48/432이에요.', '', ['약분하지 않은 분수']],
    ['1/12 + 1/36 = 48/432 = 1/9이에요.', '', []],
    ['첫 번째가 빨간 공일 확률 3/6, 되돌려 놓지 않으므로 두 번째는 2/5', '', []],
    ['확률 = 1 − 20/84 = 16/21', '', []],
    ['남은 일 = 36/270', '', ['약분하지 않은 분수']],
    ['초속 1000/3600m = 초속 1/3.6m', '', []],
    ['정가 = 12,000원 × 160/100 = 19,200원', '', []],
    ['모두 뒷면일 확률 = (1/2)^3 = 1/8', '', []],
    ['더할 수 있는 것은 하루(한 시간) 동안 하는 일의 양이에요.', '', ['시간 단위 섞임']],
    ['걸리는 날 = 1 ÷ 1/9 = 9시간', '두 관을 동시에 열면 몇 시간이 걸리는가?', ['시간 단위 섞임']],
    ['걸리는 시간 = 1 ÷ 1/9 = 9시간', '두 관을 동시에 열면 몇 시간이 걸리는가?', []],
    ['120 − 60 = 60', '', []],
  ];
  let bad = 0;
  for (const [step, text, want] of cases) {
    const got = [...new Set(scanLine(step, text).map((x) => x[0]))].sort();
    if (got.join() !== [...want].sort().join()) {
      bad++;
      console.error(`FAIL "${step}" → ${got.join(', ') || '없음'} (기대 ${want.join(', ') || '없음'})`);
    }
  }
  console.log(`검사기 시험: ${cases.length}건 중 실패 ${bad}건`);
  process.exit(bad ? 1 : 0);
}

function scan(name: string, list: Template[]) {
  let total = 0;
  const byKind: Record<Kind, number> = { '같은 값 되풀이': 0, '약분하지 않은 분수': 0, '시간 단위 섞임': 0 };
  for (const t of list) {
    const agg = new Map<string, { n: number; ex: string }>();
    for (let s = 0; s < SEEDS; s++) {
      let p;
      try {
        p = makeProblem(t, new Rng(s));
      } catch {
        continue;
      }
      p.steps.forEach((st, i) => {
        for (const [kind, what] of scanLine(st, p.text)) {
          const key = `${kind} | 해설 ${i + 1}번째 줄 | ${what.replace(/\d+/g, 'N')}`;
          const e = agg.get(key);
          if (e) e.n++;
          else agg.set(key, { n: 1, ex: `${st} (시드 ${s})` });
          byKind[kind]++;
        }
      });
    }
    for (const [k, v] of agg) {
      total += v.n;
      console.log(`[${name}] ${t.id} ${k} ×${v.n}\n    예: ${v.ex}`);
    }
  }
  console.log(`[${name}] 템플릿 ${list.length}개 × 시드 ${SEEDS}개: 합계 ${total}건 (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  return total;
}

if (arg('--self-test')) selfTest();
let found = 0;
if (!arg('--advanced')) found += scan('기본', TEMPLATES);
if (arg('--advanced') || arg('--all')) found += scan('심화', ADVANCED_TEMPLATES);
if (found) process.exit(1);
