/** Vercel 함수: POST /api/account-delete — 로그인한 본인의 이용권 정보와 계정 삭제 */
import { apiError, handleAccountDelete } from '../server/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handleAccountDelete(request);
}

export function GET(): Response {
  return apiError('method_not_allowed');
}
