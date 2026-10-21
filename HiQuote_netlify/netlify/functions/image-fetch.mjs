// 외부 이미지 프록시 (브라우저 CORS 제한 우회용). 이미지 응답만, 최대 8MB
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX = 8 * 1024 * 1024;
const bad = (msg, status = 400) => Response.json({ error: msg }, { status });

export default async (req) => {
  let target;
  try { target = new URL(new URL(req.url).searchParams.get('url') || ''); } catch { return bad('잘못된 이미지 주소'); }
  if (!/^https?:$/.test(target.protocol)) return bad('잘못된 이미지 주소');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.)/.test(target.hostname)) return bad('허용되지 않는 주소', 403);
  try {
    const r = await fetch(target, { headers: { 'User-Agent': UA, Referer: 'https://search.naver.com/' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return bad('이미지가 아닙니다', 502);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX) return bad('이미지가 너무 큽니다', 413);
    return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } });
  } catch (e) {
    return bad('이미지를 가져오지 못했습니다: ' + e.message, 502);
  }
};
export const config = { path: '/api/image-fetch' };
