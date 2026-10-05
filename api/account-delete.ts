/** Vercel 함수: POST /api/account-delete — 로그인한 본인의 이용권 정보와 계정 삭제 */
import { handleAccountDelete } from '../server/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handleAccountDelete(request);
}

/** 스위치가 꺼져 있으면 404, 켜져 있으면 405(처리 함수가 판단) */
export function GET(request: Request): Promise<Response> {
  return handleAccountDelete(request);
}
