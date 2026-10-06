/**
 * 브라우저와 서버(api/)가 주고받는 데이터 모양.
 * 타입만 있으므로 브라우저 번들에는 아무것도 들어가지 않는다.
 */
import type { ChartSpec, Figure } from './charts/types.js';

export type AreaId = 'arith' | 'stats' | 'chartRead' | 'chartMake';
export type Level = 'stable' | 'improve' | 'focus';

/** 풀이 화면에 보이는 보기. 정답 여부나 실수 유형은 담지 않는다. */
export interface PublicChoice {
  label: string;
  chart?: ChartSpec;
}

/** 풀이 화면에 보이는 문항. 정답·해설·유형 이름은 담지 않는다. */
export interface PublicQuestion {
  area: AreaId;
  areaName: string;
  text: string;
  figure?: Figure;
  choices: PublicChoice[];
}

/** POST /api/session 응답 */
/** 진단 수준. basic이 이전부터 있던 진단, advanced는 심화(서버 스위치가 켜졌을 때만). */
export type DiagnosisLevel = 'basic' | 'advanced';

/** POST /api/session 요청 본문(선택). 없거나 level이 없으면 기본. */
export interface SessionRequest {
  level?: DiagnosisLevel;
}

export interface SessionResponse {
  token: string;
  /** 토큰 만료 시각 (ISO 8601) */
  expiresAt: string;
  questions: PublicQuestion[];
}

/** POST /api/report 요청 */
export interface ReportRequest {
  token: string;
  /** 문항별로 고른 보기 번호 (0부터) */
  answers: number[];
  /** 문항별 풀이 시간(초) */
  secs: number[];
}

/** 영역별 요약 표 한 줄 */
export interface SummaryRow {
  areaId: AreaId;
  name: string;
  correct: number;
  total: number;
  /** 정답률(%) 정수 */
  ratePct: number;
  /** 문항당 평균 풀이 시간(초) */
  avgSec: number;
  level: Level;
  levelLabel: string;
}

export interface PatternView {
  tag: string;
  count: number;
  text: string;
}

/** 영역별 상세 (요약 표에서 펼치는 내용) */
export interface AreaDetail {
  areaId: AreaId;
  description: string;
  correct: number;
  total: number;
  ratePct: number;
  avgSec: number;
  targetSec: number;
  weakSubtypes: string[];
  levelReason: string;
  patterns: PatternView[];
}

/** 문항별 해설 */
export interface Explanation {
  areaName: string;
  subtype: string;
  text: string;
  figure?: Figure;
  choices: PublicChoice[];
  picked: number;
  answerIndex: number;
  isCorrect: boolean;
  /** 오답일 때 고른 보기가 나오는 실수 유형 */
  pickedMistakeTag: string | null;
  steps: string[];
}

/**
 * POST /api/report 응답: 머리말 정보 + 세 구역.
 * gated: 서버 기능 스위치(MONETIZATION_ENABLED)가 켜져 있을 때만 들어간다.
 *   true면 무료 응답(영역별 상세 없음, 해설은 1·2번만), false면 이용권 응답(전체).
 *   스위치가 꺼져 있으면 이 필드가 없고 응답은 전체다.
 */
export interface ReportResponse {
  gated?: boolean;
  meta: {
    total: number;
    correct: number;
    totalSec: number;
    perArea: number;
    /** 심화일 때만 "advanced". 기본 응답에는 이 필드가 없다(이전과 같음). */
    level?: 'advanced';
  };
  summary: SummaryRow[];
  areaDetails: AreaDetail[];
  explanations: Explanation[];
}

export type ApiErrorCode =
  | 'bad_request'
  | 'invalid_token'
  | 'token_expired'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'server_misconfigured'
  | 'not_found'
  | 'level_unavailable'
  | 'auth_invalid'
  | 'service_unavailable'
  | 'internal';

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}
