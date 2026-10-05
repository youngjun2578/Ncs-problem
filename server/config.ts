/** 서버 기능 스위치. "true"일 때만 로그인·이용권에 따라 응답을 자른다. */
export function monetizationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.MONETIZATION_ENABLED === 'true';
}
