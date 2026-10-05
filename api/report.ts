/** Vercel 함수: POST /api/report — 토큰·답·시간을 받아 서버에서 채점하고 리포트를 돌려준다 */
import { apiError, handleReport } from '../server/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handleReport(request);
}

export function GET(): Response {
  return apiError('method_not_allowed');
}
