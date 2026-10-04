/** 사이트 공개 정보 (.env의 VITE_* 값) */
export const SITE = {
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL ?? 'contact@example.com',
  lastUpdated: import.meta.env.VITE_LAST_UPDATED ?? '',
};
