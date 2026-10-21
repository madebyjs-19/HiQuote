// 모델명 → 제품 이미지 후보 URL 목록
// 1) 네이버 쇼핑 검색 API (환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 있을 때)
// 2) 네이버 통합검색 쇼핑 썸네일  3) Bing 이미지
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = (url, headers = {}) => fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...headers }, signal: AbortSignal.timeout(8000) });
const decodeHtml = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"');

export default async (req) => {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return Response.json({ urls: [] });
  const urls = [];
  const { NAVER_CLIENT_ID: id, NAVER_CLIENT_SECRET: secret } = process.env;
  if (id && secret) {
    try {
      const r = await get('https://openapi.naver.com/v1/search/shop.json?display=10&query=' + encodeURIComponent(q),
        { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret });
      if (r.ok) urls.push(...((await r.json()).items || []).map(i => i.image).filter(Boolean));
    } catch (e) { console.error('naver api', e.message); }
  }
  try {
    const html = await (await get('https://search.naver.com/search.naver?where=nexearch&query=' + encodeURIComponent(q))).text();
    urls.push(...(html.match(/https:\/\/shopping-phinf\.pstatic\.net\/main_[\w/.-]+?\.(?:jpg|jpeg|png)/g) || []));
  } catch (e) { console.error('naver web', e.message); }
  if (urls.length < 3) {
    try {
      const html = await (await get('https://www.bing.com/images/search?setlang=ko&q=' + encodeURIComponent(q + ' 제품'))).text();
      for (const m of html.matchAll(/murl&quot;:&quot;(.*?)&quot;/g)) urls.push(decodeHtml(m[1]));
    } catch (e) { console.error('bing', e.message); }
  }
  return Response.json({ urls: [...new Set(urls)].slice(0, 12) }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
};
export const config = { path: '/api/image-search' };
