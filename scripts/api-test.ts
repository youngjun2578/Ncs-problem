/**
 * 서버 API 테스트: 핸들러를 직접 호출한다(네트워크 불필요).
 *   npx tsx scripts/api-test.ts      (실패하면 exit 1)
 *
 *  - 비밀 값이 없거나 짧으면 명확한 오류로 실패하는지
 *  - 세션 응답에 정답·해설·정답 위치 힌트가 없는지
 *  - 변조·만료·다른 키·미래 시각·다른 버전 토큰, 잘못된 개수·범위의 답과 시간이 거부되는지
 *  - 클라이언트가 보낸 점수·정답 여부를 쓰지 않는지
 *  - 답·토큰이 로그에 남지 않는지
 *  - 이용권 서버 스위치(MONETIZATION_ENABLED) 모드에 따라 응답 기준이 다르다
 *      꺼짐 모드: 채점 응답은 전체(gated 필드 없음)
 *      켜짐 모드: 로그인 없는 요청은 무료 응답(gated: true, 영역별 상세 없음, 해설 1·2번만). 이 테스트는 로그인 토큰을 보내지 않는다
 *    두 모드 모두 이 파일 하나로 검사한다: MONETIZATION_ENABLED=true npx tsx scripts/api-test.ts
 *  - 심화(level): 없으면 이전과 같음, 심화일 때만 토큰에 l, 본문 level로 채점을 바꿀 수 없음, 서버 스위치 꺼짐이면 오류, 위조 토큰 거부
 */
import { createHmac } from 'node:crypto';
import { handleReport, handleSession } from '../server/handlers.js';
import { generationSeed, issueToken, nowSec, TOKEN_TTL_SEC, verifyToken } from '../server/token.js';
import { composeReportResponse, generateQuestions, QUESTION_COUNT, score, toPublicQuestion } from '../server/diagnosis.js';
import { monetizationEnabled } from '../server/config.js';
import { ADVANCED_TARGET_SEC } from '../server/advanced/constants.js';
import { MISTAKES } from '../server/engine/mistakes.js';
import type { ReportResponse, SessionResponse } from '../shared/api.js';

/** 이용권 서버 스위치 모드. 켜짐이면 로그인 없는 채점 응답은 무료 범위다 */
const MON = monetizationEnabled();
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
  if (MON) ok(JSON.stringify(Object.keys(rep)) === JSON.stringify(['gated', 'meta', 'summary', 'areaDetails', 'explanations']) && rep.gated === true, '[이용권 켜짐] 응답 구역 gated(true)·meta·summary·areaDetails·explanations');
  else ok(JSON.stringify(Object.keys(rep)) === JSON.stringify(['meta', 'summary', 'areaDetails', 'explanations']), '응답 구역 meta·summary·areaDetails·explanations');
  ok(rep.meta.correct === 12 && rep.meta.total === 12 && rep.meta.totalSec === 120, `전부 정답 채점 ${JSON.stringify(rep.meta)}`);
  if (MON) ok(rep.summary.length === 4 && rep.areaDetails.length === 0 && rep.explanations.length === 2, '[이용권 켜짐] 무료 구역 크기 4·0·2(요약 전체, 상세 없음, 해설 1·2번)');
  else ok(rep.summary.length === 4 && rep.areaDetails.length === 4 && rep.explanations.length === 12, '구역 크기 4·4·12');

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

  // 7. 심화(level)
  {
    const decode = (tok: string) => JSON.parse(Buffer.from(tok.split('.')[0], 'base64url').toString('utf8'));
    const signRaw = (bodyObj: unknown) => {
      const b = Buffer.from(JSON.stringify(bodyObj)).toString('base64url');
      return `${b}.${createHmac('sha256', SECRET).update(b).digest('base64url')}`;
    };
    const sessionWith = (body: unknown) =>
      handleSession(new Request('http://localhost/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }));
    const answersOf = (tok: string, level: 'basic' | 'advanced') => {
      const v = verifyToken(SECRET, tok);
      if (!v.ok) throw new Error('토큰 검증 실패');
      return generateQuestions(generationSeed(SECRET, v.body.s, level), level).map((q) => q.answerIndex);
    };
    delete process.env.ADVANCED_LEVEL_ENABLED;

    // 7-1. level이 없는 요청은 이전과 같다(본문 없음·빈 객체·JSON 아님·basic)
    for (const [name, body] of [['본문 없음', undefined], ['빈 객체', {}], ['JSON 아님', 'not json'], ['level basic', { level: 'basic' }], ['다른 키만', { foo: 1 }]] as const) {
      const r = await sessionWith(body);
      const j = (await r.json()) as SessionResponse;
      const tb = decode(j.token);
      const want = generateQuestions(generationSeed(SECRET, tb.s)).map(toPublicQuestion);
      ok(r.status === 200 && JSON.stringify(Object.keys(tb)) === JSON.stringify(['v', 's', 'iat']), `심화: ${name} → 200, 토큰 본문 {v,s,iat}만 (${Object.keys(tb)})`);
      ok(JSON.stringify(j.questions) === JSON.stringify(want), `심화: ${name} → 기본 문항과 같음`);
    }

    // 7-2. 잘못된 level 값은 400
    for (const [name, body] of [['모르는 문자열', { level: 'hard' }], ['숫자', { level: 1 }], ['null', { level: null }], ['배열', { level: ['advanced'] }], ['대문자', { level: 'ADVANCED' }]] as const) {
      const got = await errCode(await sessionWith(body));
      ok(got === '400:bad_request', `심화: level ${name} → ${got} (기대 400:bad_request)`);
    }

    // 7-3. 서버 스위치 꺼짐: 심화 요청은 오류(조용히 기본으로 바꾸지 않음)
    const offRes = await sessionWith({ level: 'advanced' });
    const offBody = (await offRes.clone().json()) as { error?: string; questions?: unknown };
    ok(offRes.status === 403 && offBody.error === 'level_unavailable' && !offBody.questions, `심화: 스위치 꺼짐 + advanced → 403 level_unavailable (${offRes.status})`);

    // 7-4. 스위치 켜짐: 심화 토큰에만 l:"adv", 생성 시드도 따로
    process.env.ADVANCED_LEVEL_ENABLED = 'true';
    const advRes = await sessionWith({ level: 'advanced' });
    const adv = (await advRes.json()) as SessionResponse;
    const advBody = decode(adv.token);
    ok(advRes.status === 200 && advBody.l === 'adv' && JSON.stringify(Object.keys(advBody)) === JSON.stringify(['v', 's', 'iat', 'l']), `심화: 켜짐 + advanced → 토큰 {v,s,iat,l:"adv"} (${JSON.stringify(Object.keys(advBody))})`);
    ok(adv.questions.length === QUESTION_COUNT, `심화: 12문항 (${adv.questions.length})`);
    ok(JSON.stringify(adv.questions) === JSON.stringify(generateQuestions(generationSeed(SECRET, advBody.s, 'advanced'), 'advanced').map(toPublicQuestion)), '심화: 심화 시드(gen:v1:adv)로 만든 문항');
    ok(JSON.stringify(adv.questions) !== JSON.stringify(generateQuestions(generationSeed(SECRET, advBody.s)).map(toPublicQuestion)), '심화: 같은 공개 시드의 기본 문항과 다름');
    ok(generationSeed(SECRET, 123, 'advanced') !== generationSeed(SECRET, 123), '심화: 생성 시드 이름표가 다름');
    const basicOn = (await (await sessionWith({})).json()) as SessionResponse;
    ok(!('l' in decode(basicOn.token)), '심화: 켜져 있어도 level 없는 요청은 기본 토큰');
    const advPub = JSON.stringify(adv);
    for (const word of ['answerIndex', 'mistakeTag', 'steps', 'templateId', 'difficulty', 'adv.']) ok(!advPub.includes(word), `심화: 세션 응답에 ${word} 없음`);

    // 7-5. 심화 채점: 토큰의 level로만. 본문의 level은 무시
    const advAns = answersOf(adv.token, 'advanced');
    const advRep = await post(handleReport, { token: adv.token, answers: advAns, secs: secs12(), level: 'basic' });
    const advJson = (await advRep.json()) as ReportResponse;
    ok(advRep.status === 200 && advJson.meta.level === 'advanced' && advJson.meta.correct === QUESTION_COUNT, `심화: 심화 토큰 + 본문 level basic → 심화로 채점 (${advJson.meta.level}, ${advJson.meta.correct})`);
    ok(advJson.areaDetails.every((a) => a.targetSec === ADVANCED_TARGET_SEC[a.areaId as keyof typeof ADVANCED_TARGET_SEC]), '심화: 권장 시간은 심화용 상수');
    const advQs = generateQuestions(generationSeed(SECRET, advBody.s, 'advanced'), 'advanced');
    if (MON)
      ok(JSON.stringify(advJson) === JSON.stringify(composeReportResponse(score(advQs, advAns, secs12(), 'advanced'), 'free')) && advJson.gated === true && advJson.explanations.length === 2, '[이용권 켜짐] 심화: 응답 = 심화 채점 결과의 무료 범위(기본과 같은 규칙)');
    else ok(JSON.stringify(advJson) === JSON.stringify(composeReportResponse(score(advQs, advAns, secs12(), 'advanced'))), '심화: 응답 = 심화 채점 결과 그대로');
    const basicAns = answersOf(basicOn.token, 'basic');
    const basicRep = await post(handleReport, { token: basicOn.token, answers: basicAns, secs: secs12(), level: 'advanced' });
    const basicJson = (await basicRep.json()) as ReportResponse;
    ok(basicRep.status === 200 && !('level' in basicJson.meta) && basicJson.meta.correct === QUESTION_COUNT, '심화: 기본 토큰 + 본문 level advanced → 기본으로 채점, meta.level 없음');

    // 7-6. 위조·조작 토큰
    const [b64, sigPart] = basicOn.token.split('.');
    const tampered = Buffer.from(JSON.stringify({ ...decode(basicOn.token), l: 'adv' })).toString('base64url') + '.' + sigPart;
    ok((await errCode(await post(handleReport, { token: tampered, answers: basicAns, secs: secs12() }))) === '401:invalid_token', '심화: 기본 토큰에 l 붙이기(서명 그대로) → 401');
    const strippedBody = Buffer.from(JSON.stringify({ v: advBody.v, s: advBody.s, iat: advBody.iat })).toString('base64url');
    ok((await errCode(await post(handleReport, { token: `${strippedBody}.${adv.token.split('.')[1]}`, answers: advAns, secs: secs12() }))) === '401:invalid_token', '심화: 심화 토큰에서 l 빼기 → 401');
    ok((await errCode(await post(handleReport, { token: signRaw({ ...advBody, l: 'xyz' }), answers: advAns, secs: secs12() }))) === '401:invalid_token', '심화: 서명은 맞지만 l 값이 모름 → 401');
    ok(b64.length > 0, '심화: 기본 토큰 형식 유지');

    // 7-7. 스위치를 끈 뒤 남아 있는 심화 토큰으로 채점 → 오류
    delete process.env.ADVANCED_LEVEL_ENABLED;
    ok((await errCode(await post(handleReport, { token: adv.token, answers: advAns, secs: secs12() }))) === '403:level_unavailable', '심화: 스위치 꺼짐 + 심화 토큰 채점 → 403');
    // 기본 토큰은 스위치와 관계없이 그대로
    ok((await post(handleReport, { token: basicOn.token, answers: basicAns, secs: secs12() })).status === 200, '심화: 스위치 꺼짐 + 기본 토큰 → 200');
    const legacy = issueToken(SECRET, 777, nowSec());
    ok(JSON.stringify(Object.keys(decode(legacy))) === JSON.stringify(['v', 's', 'iat']) && verifyToken(SECRET, legacy).ok, '심화: level 없이 발급한 기본 토큰은 이전 형식 그대로 유효');
  }

  // 6. 로그에 답·토큰이 없는지
  const joined = logs.join('\n');
  ok(!joined.includes(session.token) && !joined.includes(sig), '로그에 토큰 없음');
  ok(!joined.includes(JSON.stringify(answers)) && !/answers|secs/.test(joined), '로그에 답·시간 없음');

  print(`\nAPI 테스트 (이용권 서버 스위치 ${MON ? '켜짐' : '꺼짐'} 모드): 통과 ${passed}, 실패 ${failed}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  print('테스트 실행 오류: ' + (e instanceof Error ? e.stack : String(e)));
  process.exit(1);
});
