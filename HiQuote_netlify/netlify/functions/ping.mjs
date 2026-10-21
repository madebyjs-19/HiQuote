// 웹 버전 감지용: 이미지 검색 기능은 있고, 저장·메일은 브라우저가 처리
export default async () => Response.json({ ok: true, mode: 'netlify' });
export const config = { path: '/api/ping' };
