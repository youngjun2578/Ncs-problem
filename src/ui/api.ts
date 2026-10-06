import type { ApiError, ApiErrorCode, ReportRequest, ReportResponse, SessionResponse } from '../../shared/api';

const TIMEOUT_MS = 15000;

/** 서버 요청 실패. code가 없으면 네트워크 문제(연결 실패·시간 초과)다. */
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode | null,
  ) {
    super(message);
  }
  /** 같은 요청을 다시 보내도 소용없는 경우: 토큰이 틀렸거나 만료됨 */
  get needsNewSession() {
    return this.code === 'invalid_token' || this.code === 'token_expired';
  }
}

async function post<T>(path: string, body: unknown, bearer?: string | null): Promise<T> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: bearer ? { 'content-type': 'application/json', authorization: `Bearer ${bearer}` } : { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
      cache: 'no-store',
    });
  } catch {
    throw new ApiFailure('서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.', null);
  } finally {
    window.clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 아래에서 처리
  }
  if (!res.ok) {
    const err = data as Partial<ApiError> | null;
    throw new ApiFailure(err?.message ?? `서버 응답 오류 (${res.status})`, err?.error ?? 'internal');
  }
  if (data === null) throw new ApiFailure('서버 응답을 읽지 못했습니다.', 'internal');
  return data as T;
}

export const startSession = () => post<SessionResponse>('/api/session', {});

/** 심화 세션 요청(심화 화면 스위치가 켜진 빌드에서만 쓴다) */
export const startAdvancedSession = () => post<SessionResponse>('/api/session', { level: 'advanced' });

/** bearer: 로그인 토큰(기능 스위치가 켜진 빌드에서 로그인한 경우만). 이용권 판단은 서버가 한다. */
export const requestReport = (req: ReportRequest, bearer?: string | null) => post<ReportResponse>('/api/report', req, bearer);
