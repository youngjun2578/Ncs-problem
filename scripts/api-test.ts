/**
 * 서버 API 테스트: 핸들러를 직접 호출한다(네트워크 불필요).
 *   npx tsx scripts/api-test.ts      (실패하면 exit 1)
 *
 *  - 비밀 값이 없거나 짧으면 명확한 오류로 실패하는지
 *  - 세션 응답에 정답·해설·정답 위치 힌트가 없는지
 *  - 변조·만료·다른 키·미래 시각·다른 버전 토큰, 잘못된 개수·범위의 답과 시간이 거부되는지
 *  - 클라이언트가 보낸 점수·정답 여부를 쓰지 않는지
 *  - 답·토큰이 로그에 남지 않는지
 */
import { createHmac } from 'node:crypto';
import { handleReport, handleSession } from '../server/handlers.js';
import { generationSeed, issueToken, nowSec, TOKEN_TTL_SEC, verifyToken } from '../server/token.js';
import { generateQuestions, QUESTION_COUNT } from '../server/diagnosis.js';
import { MISTAKES } from '../server/engine/mistakes.js';
import type { ReportResponse, SessionResponse } from '../shared/api.js';

const SECRET = 'test-secret-0123456789-abcdefghijklmnop';
const OTHER = 'other-secret-0123456789-abcdefghijklmnop';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log('FAIL ' + msg);
  }
};

// 로그 가로채기: 답·토큰이 찍히는지 본다
const logs: string[] = [];
for (const k of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
    if (k !== 'error') orig(...a);
  };
}
const print = (s: string) => process.stdout.write(s + '\n');

const post = (h: (r: Request) => Promise<Response>, body: unknown, init: RequestInit = {}) =>
  h(
    new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    }),
  );

async function errCode(r: Response) {
  const j = (await r.json()) as { error?: string };
  return `${r.status}:${j.error}`;
}

/** 서버만 아는 정답 (테스트에서는 키를 알고 있으므로 계산할 수 있다) */
function answersFor(token: string) {
  const v = verifyToken(SECRET, token);
  if (!v.ok) throw new Error('토큰 검증 실패');
  return generateQuestions(generationSeed(SECRET, v.body.s)).map((q) => q.answerIndex);
}

const secs12 = (s = 10) => Array(QUESTION_COUNT).fill(s);

async function main() {
  // 1. 비밀 값 없음 / 짧음
  delete process.env.REPORT_TOKEN_SECRET;
  ok((await errCode(await post(handleSession, {}))) === '500:server_misconfigured', '비밀 값 없으면 세션 500 server_misconfigured');
  ok((await errCode(await post(handleReport, { token: 'x', answers: [], secs: [] }))) === '500:server_misconfigured', '비밀 값 없으면 채점 500');
  process.env.REPORT_TOKEN_SECRET = 'short';
  ok((await errCode(await post(handleSession, {}))) === '500:server_misconfigured', '짧은 비밀 값이면 500');
  const misMsg = ((await (await post(handleSession, {})).json()) as { message: string }).message;
  ok(misMsg.includes('REPORT_TOKEN_SECRET'), `오류 메시지에 원인 표시 (${misMsg})`);
  process.env.REPORT_TOKEN_SECRET = SECRET;

  // 2. 세션 응답
  const sr = await post(handleSession, {});
  ok(sr.status === 200, '세션 200');
  ok(sr.headers.get('cache-control') === 'no-store', '세션 응답 no-store');
  const raw = await sr.text();
  const session = JSON.parse(raw) as SessionResponse;
  ok(JSON.stringify(Object.keys(session).sort()) === JSON.stringify(['expiresAt', 'questions', 'token']), `세션 최상위 키 ${Object.keys(session)}`);
  ok(session.questions.length === QUESTION_COUNT, '세션 문항 12개');
  const allowedQ = new Set(['area', 'areaName', 'text', 'figure', 'choices']);
  const allowedC = new Set(['label', 'chart']);
  ok(session.questions.every((q) => Object.keys(q).every((k) => allowedQ.has(k))), '문항 키는 area·areaName·text·figure·choices만');
  ok(session.questions.every((q) => q.choices.length === 5 && q.choices.every((c) => Object.keys(c).every((k) => allowedC.has(k)))), '보기 키는 label·chart만, 5개');
  ok(session.questions.every((q) => new Set(q.choices.map((c) => Object.keys(c).sort().join())).size === 1), '한 문항 안의 보기는 모두 같은 키 구성(정답만 다른 모양 없음)');
  for (const word of ['answer', 'Answer', 'mistake', 'steps', 'subtype', 'templateId', 'fillers', 'difficulty', 'correct', 'explanation'])
    ok(!raw.includes(word), `세션 응답에 "${word}" 없음`);
  for (const [tag, text] of Object.entries(MISTAKES)) ok(!raw.includes(text), `세션 응답에 실수 설명 없음 (${tag})`);
  const realQs = generateQuestions(generationSeed(SECRET, verifyToken(SECRET, session.token).ok ? (verifyToken(SECRET, session.token) as any).body.s : 0));
  ok(realQs.every((q, i) => q.text === session.questions[i].text), '세션 문항 = 토큰 시드로 다시 만든 문항');
  ok(realQs.every((q) => q.steps.every((s) => !raw.includes(s))), '세션 응답에 해설 문장 없음');
  const body = JSON.parse(Buffer.from(session.token.split('.')[0], 'base64url').toString());
  ok(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['iat', 's', 'v']), `토큰 본문 키 v·s·iat (${Object.keys(body)})`);
  ok(Math.abs(Date.parse(session.expiresAt) / 1000 - (body.iat + TOKEN_TTL_SEC)) < 1, 'expiresAt = 발급 + 6시간');
  ok(generateQuestions(body.s)[0].text !== session.questions[0].text || generateQuestions(body.s)[1].text !== session.questions[1].text, '토큰의 공개 시드로는 같은 문항이 나오지 않음(키 필요)');

  // 정답 위치 분포: 세션 여러 개에서 정답 번호가 한쪽으로 쏠리지 않는다
  const dist = [0, 0, 0, 0, 0];
  for (let i = 0; i < 60; i++) {
    const s = (await (await post(handleSession, {})).json()) as SessionResponse;
    answersFor(s.token).forEach((a) => dist[a]++);
  }
  ok(dist.every((n) => n > 60 * 12 * 0.1), `정답 위치 분포 고름 ${dist}`);

  // 3. 정상 채점
  const answers = answersFor(session.token);
  const good = await post(handleReport, { token: session.token, answers, secs: secs12() });
  ok(good.status === 200, '정상 채점 200');
  const rep = (await good.json()) as ReportResponse;
  ok(JSON.stringify(Object.keys(rep)) === JSON.stringify(['meta', 'summary', 'areaDetails', 'explanations']), '응답 구역 meta·summary·areaDetails·explanations');
  ok(rep.meta.correct === 12 && rep.meta.total === 12 && rep.meta.totalSec === 120, `전부 정답 채점 ${JSON.stringify(rep.meta)}`);
  ok(rep.summary.length === 4 && rep.areaDetails.length === 4 && rep.explanations.length === 12, '구역 크기 4·4·12');

  // 클라이언트가 보낸 점수·정답 여부는 무시
  const wrongAnswers = answers.map((a) => (a + 1) % 5);
  const cheat = await post(handleReport, { token: session.token, answers: wrongAnswers, secs: secs12(), score: 12, correct: 12, isCorrect: Array(12).fill(true) });
  const cheatRep = (await cheat.json()) as ReportResponse;
  ok(cheat.status === 200 && cheatRep.meta.correct === 0, '클라이언트가 보낸 score·isCorrect 무시 (0점)');

  // 4. 토큰 검증
  const [b64, sig] = session.token.split('.');
  const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
  const tamperedBody = Buffer.from(JSON.stringify({ ...body, s: (body.s + 1) >>> 0 })).toString('base64url');
  const cases: [string, string, string][] = [
    ['본문 변조(시드 바꿈)', `${tamperedBody}.${sig}`, '401:invalid_token'],
    ['서명 한 글자 변조', `${b64}.${flip(sig, 5)}`, '401:invalid_token'],
    ['서명 없음', `${b64}.`, '401:invalid_token'],
    ['점 없음', b64, '401:invalid_token'],
    ['빈 문자열', '', '401:invalid_token'],
    ['다른 키로 서명', issueToken(OTHER, body.s, body.iat), '401:invalid_token'],
    ['만료(6시간+1초 전 발급)', issueToken(SECRET, body.s, nowSec() - TOKEN_TTL_SEC - 1), '401:token_expired'],
    ['미래 발급 시각', issueToken(SECRET, body.s, nowSec() + 3600), '401:invalid_token'],
    ['너무 긴 토큰', 'a'.repeat(600) + '.' + sig, '401:invalid_token'],
  ];
  const v2 = Buffer.from(JSON.stringify({ v: 2, s: body.s, iat: body.iat })).toString('base64url');
  cases.push(['다른 버전(v2) 정상 서명', `${v2}.${createHmac('sha256', SECRET).update(v2).digest('base64url')}`, '401:invalid_token']);
  for (const [name, token, want] of cases) {
    const got = await errCode(await post(handleReport, { token, answers, secs: secs12() }));
    ok(got === want, `토큰 ${name} → ${got} (기대 ${want})`);
  }
  // 6시간 경계 안쪽은 통과 (풀이 시간 합이 경과 시간 안이어야 함)
  const near = await post(handleReport, { token: issueToken(SECRET, body.s, nowSec() - TOKEN_TTL_SEC + 5), answers, secs: secs12() });
  ok(near.status === 200, `만료 직전 토큰은 통과 (${near.status})`);

  // 5. 입력 검증
  const bad: [string, unknown, string][] = [
    ['답 11개', { token: session.token, answers: answers.slice(0, 11), secs: secs12() }, '400:bad_request'],
    ['답 13개', { token: session.token, answers: [...answers, 0], secs: secs12() }, '400:bad_request'],
    ['시간 11개', { token: session.token, answers, secs: secs12().slice(0, 11) }, '400:bad_request'],
    ['답 5 (범위 밖)', { token: session.token, answers: [5, ...answers.slice(1)], secs: secs12() }, '400:bad_request'],
    ['답 -1', { token: session.token, answers: [-1, ...answers.slice(1)], secs: secs12() }, '400:bad_request'],
    ['답 1.5', { token: session.token, answers: [1.5, ...answers.slice(1)], secs: secs12() }, '400:bad_request'],
    ['답 문자열', { token: session.token, answers: ['1', ...answers.slice(1)], secs: secs12() }, '400:bad_request'],
    ['답 null', { token: session.token, answers: [null, ...answers.slice(1)], secs: secs12() }, '400:bad_request'],
    ['시간 음수', { token: session.token, answers, secs: [-1, ...secs12().slice(1)] }, '400:bad_request'],
    ['시간 null(NaN)', { token: session.token, answers, secs: [null, ...secs12().slice(1)] }, '400:bad_request'],
    ['시간 문자열', { token: session.token, answers, secs: ['10', ...secs12().slice(1)] }, '400:bad_request'],
    ['시간 6시간 초과', { token: session.token, answers, secs: [TOKEN_TTL_SEC + 1, ...secs12(0).slice(1)] }, '400:bad_request'],
    ['시간 합이 경과 시간보다 김', { token: session.token, answers, secs: secs12(1000) }, '400:bad_request'],
    ['token 없음', { answers, secs: secs12() }, '400:bad_request'],
    ['배열 본문', [1, 2, 3], '400:bad_request'],
    ['JSON 아님', 'not json', '400:bad_request'],
  ];
  for (const [name, b, want] of bad) {
    const got = await errCode(await post(handleReport, b));
    ok(got === want, `입력 ${name} → ${got} (기대 ${want})`);
  }
  const big = await post(handleReport, JSON.stringify({ token: session.token, answers, secs: secs12(), pad: 'x'.repeat(9000) }));
  ok((await errCode(big)) === '413:payload_too_large', '본문 8KB 초과 → 413');
  const getRes = await handleReport(new Request('http://localhost/api/report', { method: 'GET' }));
  ok((await errCode(getRes)) === '405:method_not_allowed', 'GET → 405');
  const getSes = await handleSession(new Request('http://localhost/api/session', { method: 'GET' }));
  ok((await errCode(getSes)) === '405:method_not_allowed', '세션 GET → 405');

  // 6. 로그에 답·토큰이 없는지
  const joined = logs.join('\n');
  ok(!joined.includes(session.token) && !joined.includes(sig), '로그에 토큰 없음');
  ok(!joined.includes(JSON.stringify(answers)) && !/answers|secs/.test(joined), '로그에 답·시간 없음');

  print(`\nAPI 테스트: 통과 ${passed}, 실패 ${failed}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  print('테스트 실행 오류: ' + (e instanceof Error ? e.stack : String(e)));
  process.exit(1);
});
