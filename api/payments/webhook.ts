/** Vercel 함수: POST /api/payments/webhook — 결제사 알림(서명 검증). 결제 스위치가 꺼져 있으면 404 */
import { handlePaymentWebhook } from '../../server/payments/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handlePaymentWebhook(request);
}

export function GET(request: Request): Promise<Response> {
  return handlePaymentWebhook(request);
}
