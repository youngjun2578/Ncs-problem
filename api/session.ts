/** Vercel 함수: POST /api/session — 새 진단 세트(문제만)와 세션 토큰 */
import { apiError, handleSession } from '../server/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handleSession(request);
}

export function GET(): Response {
  return apiError('method_not_allowed');
}
