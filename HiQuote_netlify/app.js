/* HiQuote - 롯데하이마트 정왕역점 견적서 생성기 */
(() => {
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const MIN_ROWS = 8;           // 품목표 기본 줄 수 (양식 그대로)
const ROWS_BUDGET_MM = 8 * 6.4; // 품목표 본문 높이 예산
const PX_PER_MM = 96 / 25.4;

/* ---------------- 공통 유틸 ---------------- */
const fmt = n => (n === '' || n == null || isNaN(n)) ? '' : Math.round(n).toLocaleString('ko-KR');
const num = v => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return isNaN(n) ? 0 : n; };
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, days) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days); return isoDate(d); };
const krDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${y}년 ${m}월 ${d}일`; };
const mdDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${m}/${d}`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
const uid = () => Math.random().toString(36).slice(2, 9);

function toast(msg, err = false, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = '', ms);
}

/* ---------------- 저장소: 로컬 서버 우선, 없으면 브라우저 저장 ---------------- */
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('브라우저 저장공간이 부족합니다', true); } },
};
// 웹 배포(Netlify 등)·서버 없는 실행용 브라우저 저장소: IndexedDB (용량 넉넉, 이미지 포함 견적 수백 건 저장 가능)
const IDB = {
  _db: null,
  open() {
    return this._db ||= new Promise((res, rej) => {
      const rq = indexedDB.open('quote-app', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction('kv', mode); const r = fn(t.objectStore('kv')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); });
  },
  get(k) { return this.tx('readonly', st => st.get(k)); },
  set(k, v) { return this.tx('readwrite', st => st.put(v, k)); },
};
let localQuotes = {};   // 브라우저 저장 모드의 견적 (IndexedDB 'quotes' 와 동기화)
const persistLocal = () => IDB.set('quotes', localQuotes).catch(e => toast('브라우저 저장 실패: ' + e.message, true));

const DEFAULT_SETTINGS = {
  smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_user: '', from_name: '롯데하이마트 정왕역점 김준수',
  consultant_name: '김 준 수 팀장', consultant_tel: '031-433-5366', consultant_cell: '010-4786-8675', validity_days: 30,
  biz_no: '104-81-16860', biz_name: '(주)롯데하이마트', biz_ceo: '김 종 윤', biz_addr: '경기도 시흥시 정왕신길로 193', biz_type: '소매·서비스', biz_item: '가전제품외',
  mail_subject: '[롯데하이마트 정왕역점] 견적서 송부 - {client} ({no})',
  mail_body: '안녕하세요, {client} 담당자님.\n롯데하이마트 정왕역점 김준수입니다.\n\n요청하신 견적서를 첨부와 같이 송부드립니다.\n· 견적번호: {no}\n· 총액(VAT포함): {total}원\n· 유효기간: {valid}까지\n\n검토 후 문의사항 있으시면 편하게 연락 주십시오.\n감사합니다.\n\n롯데하이마트(주) 정왕역점 김준수\nTel 031-433-5366 / Cell 010-4786-8675',
};

const api = {
  server: false,        // 로컬 파이썬 서버(저장·메일·PDF보관 전부)
  imageSearch: false,   // 웹 이미지 검색 가능 여부 (로컬 서버 또는 Netlify Functions)
  async init() {
    if (location.protocol.startsWith('http')) {
      try {
        const r = await fetch('/api/ping');
        const j = r.ok ? await r.json() : {};
        this.imageSearch = !!j.ok;
        this.server = !!j.ok && j.mode !== 'netlify';
      } catch { /* 정적 호스팅 */ }
    }
    if (!this.server) {
      try {
        localQuotes = (await IDB.get('quotes')) || {};
        const legacy = LS.get('qt_quotes', null);   // 이전 localStorage 데이터 이전
        if (legacy) { Object.assign(localQuotes, legacy); await persistLocal(); localStorage.removeItem('qt_quotes'); }
      } catch { localQuotes = LS.get('qt_quotes', {}); }
    }
  },
  async call(method, url, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || r.statusText);
    return j;
  },
  _maxLocal(dateKey) {
    const counter = LS.get('qt_counter', {});
    let last = counter[dateKey] || 0;
    Object.keys(localQuotes).forEach(no => { if (no.startsWith(dateKey + '-')) last = Math.max(last, +no.slice(9)); });
    return last;
  },
  async peekNo(date) {
    const key = date.replace(/-/g, '');
    if (this.server) return (await this.call('GET', '/api/next?date=' + key)).no;
    return `${key}-${pad4(this._maxLocal(key) + 1)}`;
  },
  async save(q) {
    if (this.server) return this.call('POST', '/api/quotes', q);
    if (!q.no) {
      const key = q.date.replace(/-/g, ''), n = this._maxLocal(key) + 1;
      const c = LS.get('qt_counter', {}); c[key] = n; LS.set('qt_counter', c);
      q.no = `${key}-${pad4(n)}`;
    }
    localQuotes[q.no] = q; await persistLocal();
    return q;
  },
  async list() {
    if (this.server) return this.call('GET', '/api/quotes');
    return Object.values(localQuotes).sort((a, b) => b.no.localeCompare(a.no)).map(q => ({
      no: q.no, date: q.date, client: q.client.name, items: q.items.length,
      models: q.items.map(i => i.model).filter(Boolean).join(', '), total: q.total, updatedAt: q.updatedAt,
    }));
  },
  async get(no) {
    if (this.server) return this.call('GET', '/api/quotes/' + no);
    return localQuotes[no];
  },
  async remove(no) {
    if (this.server) return this.call('DELETE', '/api/quotes/' + no);
    delete localQuotes[no]; await persistLocal();
  },
  async settings() {
    if (this.server) return { ...DEFAULT_SETTINGS, ...(await this.call('GET', '/api/settings')) };
    return { ...DEFAULT_SETTINGS, ...LS.get('qt_settings', {}) };
  },
  async saveSettings(s) {
    if (this.server) return this.call('POST', '/api/settings', s);
    const { smtp_pass, ...rest } = s; LS.set('qt_settings', rest);
  },
};
const pad4 = n => String(n).padStart(4, '0');

/* ---------------- 상태 ---------------- */
let settings = { ...DEFAULT_SETTINGS };
let Q = null;           // 현재 견적
let dirty = true;       // 저장 이후 변경 여부
let peekedNo = '';      // 저장 전 미리보기용 예정 번호

const SAMPLE_SPECS = `화면 크기: 214 cm (85형)
해상도: 3,840 × 2,160 (4K UHD)
패널: Crystal UHD
주사율: 60 Hz (Motion Xcelerator)
HDR: HDR10+, HLG
프로세서: Crystal Processor 4K
스마트 기능: Tizen OS (Samsung Smart TV)
음향: 20 W (2.0ch) / Q-Symphony 지원
연결단자: HDMI × 3, USB × 2, LAN, Wi-Fi, Bluetooth
크기(스탠드포함): 1,902.2 × 1,162.6 × 359.0 mm (가로×세로×깊이)
무게: 약 38.9 kg (스탠드 포함)
구성품: TV 본체, 리모컨, 스탠드, 전원 케이블 등`;

const newItem = (o = {}) => ({ id: uid(), cat: '', model: '', qty: 1, price: 0, disc: 0, note: '', specs: '', oneLine: '', image: '', ...o });

function blankQuote(sample = false) {
  const today = isoDate(new Date());
  return {
    no: '', date: today, validUntil: addDays(today, +settings.validity_days || 30), vatIncluded: true,
    client: sample ? { name: '경기과학기술대학교', tel: '031-496-4615', fax: '', email: '20265001@gtec.ac.kr' } : { name: '', tel: '', fax: '', email: '' },
    consultant: { name: settings.consultant_name, tel: settings.consultant_tel, cell: settings.consultant_cell },
    items: [sample
      ? newItem({ cat: 'TV', model: 'KU85UH8000FXKR', qty: 4, price: 2940000, disc: 2530000, note: '삼성 UHD 85인치', specs: SAMPLE_SPECS })
      : newItem()],
    total: 0, createdAt: '', updatedAt: '',
  };
}

/* ---------------- 계산 (엑셀 함수와 동일 로직) ----------------
   F 공급단가 = 수량 × (할인단가 || 판매기준가)
   VAT 포함:  G 공급가액 = ROUND(F/1.1) · H 세액 = F − G
   VAT 별도:  G 공급가액 = F            · H 세액 = ROUND(G×0.1)
   I 합계금액 = G + H ,  총액 = Σ I                                    */
function calcItem(it, vatIncl = Q.vatIncluded) {
  const unit = num(it.disc) || num(it.price);
  const qty = num(it.qty);
  if (!qty || !unit) return { F: '', G: '', H: '', I: '' };
  const F = qty * unit;
  const G = vatIncl ? Math.round(F / 1.1) : F;
  const H = vatIncl ? F - G : Math.round(G * 0.1);
  return { F, G, H, I: G + H };
}
function calcTotals() {
  const t = { F: 0, G: 0, H: 0, I: 0 };
  Q.items.forEach(it => { const c = calcItem(it); if (c.F !== '') for (const k in t) t[k] += c[k]; });
  return t;
}
const filledItems = () => Q.items.filter(it => it.model || it.cat || num(it.qty) * (num(it.disc) || num(it.price)));

function parseSpecs(text) {
  return String(text || '').split(/\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^([^:\t：]+?)\s*[:\t：]\s*(.+)$/);
    return m ? { k: m[1].trim(), v: m[2].trim() } : { k: '', v: l };
  });
}
const oneLineSpec = it => it.oneLine?.trim() || parseSpecs(it.specs).map(s => s.v).join(' / ');

/* ---------------- 입력 패널 ---------------- */
const bindings = [
  ['#fDate', () => Q.date, v => { Q.date = v; Q.validUntil = addDays(v, +settings.validity_days || 30); $('#fValid').value = Q.validUntil; refreshNo(); }],
  ['#fValid', () => Q.validUntil, v => Q.validUntil = v],
  ['#fClient', () => Q.client.name, v => Q.client.name = v],
  ['#fTel', () => Q.client.tel, v => Q.client.tel = v],
  ['#fFax', () => Q.client.fax, v => Q.client.fax = v],
  ['#fEmail', () => Q.client.email, v => Q.client.email = v],
  ['#fCName', () => Q.consultant.name, v => Q.consultant.name = v],
  ['#fCTel', () => Q.consultant.tel, v => Q.consultant.tel = v],
  ['#fCCell', () => Q.consultant.cell, v => Q.consultant.cell = v],
];
function fillForm() {
  bindings.forEach(([sel, get]) => $(sel).value = get() || '');
  $('#fVatIncl').checked = !!Q.vatIncluded;
  renderItemCards();
}
function setupForm() {
  bindings.forEach(([sel, , set]) => $(sel).addEventListener('input', e => { set(e.target.value); changed(); }));
  $('#fVatIncl').addEventListener('change', e => { Q.vatIncluded = e.target.checked; changed(); });
  $('#btnAddItem').addEventListener('click', () => { Q.items.push(newItem()); renderItemCards(); changed(); $$('.item').at(-1).scrollIntoView({ behavior: 'smooth', block: 'center' }); });
}

function renderItemCards() {
  const box = $('#items');
  box.innerHTML = '';
  Q.items.forEach((it, idx) => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div class="ihead"><span>품목 ${idx + 1}</span><span class="tools">
        <button class="ghost" data-act="up" title="위로">↑</button><button class="ghost" data-act="down" title="아래로">↓</button>
        <button class="ghost" data-act="del" title="삭제">삭제</button></span></div>
      <div class="g">
        <label>품목<input data-k="cat" value="${esc(it.cat)}" placeholder="TV"></label>
        <label>모델명<input data-k="model" value="${esc(it.model)}"></label>
        <label>수량<input data-k="qty" class="num" inputmode="numeric" value="${fmt(it.qty)}"></label>
      </div>
      <div class="g2">
        <label>판매기준가(개당)<input data-k="price" class="num" inputmode="numeric" value="${fmt(it.price) || ''}"></label>
        <label>대량 할인단가<input data-k="disc" class="num" inputmode="numeric" value="${fmt(it.disc) || ''}"></label>
      </div>
      <div class="calc"></div>
      <label>비고<input data-k="note" value="${esc(it.note)}"></label>
      <div class="single-only">
        <div class="drop" tabindex="0">${dropHtml(it)}</div>
        <input type="file" accept="image/*" hidden>
      </div>
      <label>상세 스펙 <span class="hint">한 줄에 "항목: 내용" (엑셀 2열 복사·붙여넣기 가능)</span><textarea data-k="specs" rows="4">${esc(it.specs)}</textarea></label>
      <label class="multi-only">1줄 스펙 <span class="hint">비우면 상세 스펙에서 자동 생성</span><input data-k="oneLine" value="${esc(it.oneLine)}"></label>`;
    box.appendChild(el);

    $$('input[data-k], textarea[data-k]', el).forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      if (inp.classList.contains('num')) {
        const caretDigits = inp.value.slice(0, inp.selectionStart).replace(/\D/g, '').length;
        const n = num(inp.value);
        it[k] = n;
        inp.value = inp.value.replace(/\D/g, '') === '' ? '' : fmt(n);
        let pos = 0, seen = 0;
        while (pos < inp.value.length && seen < caretDigits) { if (/\d/.test(inp.value[pos])) seen++; pos++; }
        inp.setSelectionRange(pos, pos);
      } else it[k] = inp.value;
      changed();
    }));
    el.addEventListener('click', e => {
      const act = e.target.dataset?.act; if (!act) return;
      e.preventDefault();
      if (act === 'del') { if (Q.items.length === 1) { Q.items[0] = newItem(); } else Q.items.splice(idx, 1); }
      if (act === 'up' && idx > 0) [Q.items[idx - 1], Q.items[idx]] = [Q.items[idx], Q.items[idx - 1]];
      if (act === 'down' && idx < Q.items.length - 1) [Q.items[idx + 1], Q.items[idx]] = [Q.items[idx], Q.items[idx + 1]];
      if (act === 'websearch' || act === 'nextimg') { autoImage(it, { next: act === 'nextimg', force: true }); return; }
      if (act === 'rmimg') { it.image = ''; it.imageAuto = false; it.imageQuery = it.model; }
      renderItemCards(); changed();
    });
    const drop = $('.drop', el), file = $('input[type=file]', el);
    const take = async f => { if (!f || !f.type.startsWith('image/')) return; it.image = await processImage(f); it.imageAuto = false; renderItemCards(); changed(); };
    drop.addEventListener('click', e => { if (!e.target.dataset.act) file.click(); });
    file.addEventListener('change', () => take(file.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
    drop.addEventListener('paste', e => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); take(f); } });
  });
  updateItemCalcs();
}

function updateItemCalcs() {
  const multi = filledItems().length > 1;
  $$('.item').forEach((el, i) => {
    const it = Q.items[i], c = calcItem(it);
    $('.calc', el).innerHTML = c.F === ''
      ? '수량·단가를 입력하면 자동 계산됩니다'
      : `공급단가 <b>${fmt(c.F)}</b> · 공급가액 <b>${fmt(c.G)}</b> · 세액 <b>${fmt(c.H)}</b> · 합계 <b>${fmt(c.I)}</b>`;
    $('.single-only', el).style.display = multi ? 'none' : '';
    $('.multi-only', el).style.display = multi ? '' : 'none';
  });
}

function dropHtml(it) {
  const status = it._searching ? '<span class="src">웹에서 제품 이미지 검색 중…</span>'
    : it._searchMsg ? `<span class="src" style="color:#b31f14">${esc(it._searchMsg)}</span>`
    : it.imageAuto && it.image ? '<span class="src">웹 검색으로 자동 삽입됨</span>' : '';
  return `${it.image ? `<img src="${it.image}">` : ''}${status}
    <span>${it.image ? '직접 교체: ' : '모델 이미지: '}클릭 · 드래그 · Ctrl/⌘+V</span>
    <span class="imgtools">
      <button type="button" class="ghost" data-act="websearch">웹 이미지 검색</button>
      ${it.imageCandidates?.length > 1 ? '<button type="button" class="ghost" data-act="nextimg">다른 이미지 ▶</button>' : ''}
      ${it.image ? '<button type="button" class="ghost" data-act="rmimg">삭제</button>' : ''}
    </span>`;
}
function refreshDrop(it) {
  const el = $$('.item')[Q.items.indexOf(it)];
  if (el) $('.drop', el).innerHTML = dropHtml(it);
}

// 이미지 가공: 흰 여백 자동 제거(트림) → 최대 1200px → JPEG. 견적서 이미지 칸에 꽉 차게 맞추기 위함
function processImage(blob, max = 1200) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const c0 = document.createElement('canvas'); c0.width = w; c0.height = h;
      const x0 = c0.getContext('2d'); x0.fillStyle = '#fff'; x0.fillRect(0, 0, w, h); x0.drawImage(img, 0, 0);
      const d = x0.getImageData(0, 0, w, h).data;
      let top = h, left = w, right = -1, bottom = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i] < 238 || d[i + 1] < 238 || d[i + 2] < 238) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
      }
      if (right < 0) { left = 0; top = 0; right = w - 1; bottom = h - 1; }
      const cw = right - left + 1, ch = bottom - top + 1, padPx = Math.round(Math.max(cw, ch) * 0.03);
      const s = Math.min(1.6, max / Math.max(cw + padPx * 2, ch + padPx * 2));
      const c = document.createElement('canvas');
      c.width = Math.round((cw + padPx * 2) * s); c.height = Math.round((ch + padPx * 2) * s);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c0, left, top, cw, ch, padPx * s, padPx * s, cw * s, ch * s);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => rej(new Error('이미지를 읽을 수 없습니다'));
    img.src = URL.createObjectURL(blob);
  });
}

// 모델명으로 웹 이미지 검색 → 첫 번째로 열리는 이미지를 자동 삽입 (직접 넣은 이미지는 건드리지 않음)
async function autoImage(it, { next = false, force = false } = {}) {
  const model = (it.model || '').trim();
  if (!api.imageSearch || model.length < 4 || it._searching) {
    if (force && !api.imageSearch) toast('이 실행 환경에서는 웹 이미지 검색을 쓸 수 없습니다 — 이미지를 직접 넣어주세요', true);
    return;
  }
  if (!force && it.image && (!it.imageAuto || it.imageQuery === model)) return;
  if (!force && it._failedQuery === model) return;
  it._searching = true; it._searchMsg = ''; refreshDrop(it);
  try {
    if (it.imageQuery !== model || !it.imageCandidates?.length || (force && !next)) {
      let r = await api.call('GET', '/api/image-search?q=' + encodeURIComponent(model));
      if (!r.urls.length && it.cat) r = await api.call('GET', '/api/image-search?q=' + encodeURIComponent(`${it.cat} ${model}`));
      it.imageCandidates = r.urls; it.imageIdx = -1; it.imageQuery = model;
    }
    const list = it.imageCandidates || [];
    for (let k = 1; k <= list.length; k++) {
      const idx = ((it.imageIdx ?? -1) + k) % list.length;
      try {
        const resp = await fetch('/api/image-fetch?url=' + encodeURIComponent(list[idx]));
        if (!resp.ok) continue;
        it.image = await processImage(await resp.blob());
        it.imageAuto = true; it.imageIdx = idx; it._failedQuery = '';
        dirty = true; updateStatus(); renderPreview();
        return;
      } catch { /* 다음 후보 */ }
    }
    it._failedQuery = model; it._searchMsg = '이미지를 찾지 못했습니다 — 직접 넣어주세요';
  } catch (e) {
    it._failedQuery = model; it._searchMsg = '검색 실패: ' + e.message;
  } finally {
    it._searching = false; refreshDrop(it);
  }
}
let autoImgTimer;
function scheduleAutoImage() {
  clearTimeout(autoImgTimer);
  autoImgTimer = setTimeout(() => { const items = filledItems(); if (items.length === 1) autoImage(items[0]); }, 900);
}

/* ---------------- A4 미리보기 렌더 ---------------- */
function renderPreview() {
  const set = (id, v) => $('#' + id).textContent = v ?? '';
  set('pNo', Q.no || peekedNo);
  set('pDate', krDate(Q.date));
  set('pClient', Q.client.name);
  set('pTel', Q.client.tel); set('pFax', Q.client.fax); set('pEmail', Q.client.email);
  set('pCName', Q.consultant.name); set('pCTel', Q.consultant.tel); set('pCCell', Q.consultant.cell);
  set('pValid', Q.validUntil ? mdDate(Q.validUntil) : '');
  set('bNo', settings.biz_no); set('bName', settings.biz_name); set('bCeo', settings.biz_ceo);
  set('bAddr', settings.biz_addr); set('bType', settings.biz_type); set('bItem', settings.biz_item);

  const items = filledItems();
  const t = calcTotals();
  Q.total = t.I;
  set('pTotal', fmt(t.I) || '0');
  set('sF', fmt(t.F)); set('sG', fmt(t.G)); set('sH', fmt(t.H)); set('sI', fmt(t.I));

  // 품목표: 기본 8줄 유지, 초과 시 줄 높이를 줄여 전체 높이 유지
  const rows = Math.max(MIN_ROWS, items.length);
  const rowH = Math.max(4.2, Math.min(6.4, ROWS_BUDGET_MM / rows));
  const tbl = $('#pItems');
  tbl.style.setProperty('--row-h', rowH + 'mm');
  tbl.style.setProperty('--row-fs', Math.min(8.3, rowH * 1.3).toFixed(1) + 'pt');
  let html = '';
  for (let r = 0; r < rows; r++) {
    const it = items[r];
    if (!it) { html += '<tr>' + '<td></td>'.repeat(10) + '</tr>'; continue; }
    const c = calcItem(it);
    html += `<tr><td class="c">${esc(it.cat)}</td><td class="c">${esc(it.model)}</td><td class="c">${fmt(it.qty)}</td>
      <td>${fmt(it.price) || ''}</td><td>${fmt(it.disc) || ''}</td><td>${fmt(c.F)}</td><td>${fmt(c.G)}</td><td>${fmt(c.H)}</td><td>${fmt(c.I)}</td>
      <td class="l">${esc(it.note)}</td></tr>`;
  }
  tbl.tBodies[0].innerHTML = html;

  // 스펙 영역: 1품목 → 이미지+상세표 / 2품목 이상 → 품목당 1줄
  const body = $('#pSpecBody');
  body.className = 'specBody';
  if (items.length <= 1) {
    const it = items[0] || Q.items[0];
    const specs = parseSpecs(it?.specs);
    $('#pSpecTitle').textContent = `${it?.model || '모델'} 주요 스펙`;
    $('#stMode').textContent = '단일품목 · 이미지';
    if (!specs.length && !it?.image) { body.classList.add('empty'); body.innerHTML = '<span class="ph-text">상세 스펙을 입력하세요</span>'; }
    else body.innerHTML = `
      <div class="img">${it.image ? `<img src="${it.image}">` : '<div class="ph">모델 이미지</div>'}</div>
      <table><tbody>${specs.map(s => `<tr><th>${esc(s.k)}</th><td>${esc(s.v)}</td></tr>`).join('')}</tbody></table>`;
  } else {
    $('#pSpecTitle').textContent = '품목별 주요 스펙';
    $('#stMode').textContent = `${items.length}품목 · 1줄 스펙`;
    body.innerHTML = `<table class="multi"><colgroup><col style="width:5%"><col style="width:10%"><col style="width:19%"><col></colgroup>
      <thead><tr><th>No</th><th>품목</th><th>모델명</th><th>주요 스펙</th></tr></thead>
      <tbody>${items.map((it, i) => `<tr><td class="c">${i + 1}</td><td class="c">${esc(it.cat)}</td><td class="c"><b>${esc(it.model)}</b></td><td class="one" data-full="${esc(oneLineSpec(it))}"></td></tr>`).join('')}</tbody></table>`;
  }
  fitSpec();
}

// 스펙표: 남는 높이는 행이 자동으로 늘어나 채우고(table height 100%), 넘치면 글자 크기를 줄여 A4 한 장 유지
function fitSpec() {
  const body = $('#pSpecBody'), table = $('table', body);
  if (!table) return;
  const multi = table.classList.contains('multi');
  const avail = () => body.clientHeight - 2 * 2 * PX_PER_MM;
  let fs = multi ? Math.min(10, 8.3 + Math.max(0, 6 - $$('tbody tr', table).length) * 0.35) : 8.3;
  const apply = () => { body.style.setProperty('--spec-fs', fs.toFixed(2) + 'pt'); if (multi) fitOneLines(table, fs); };
  apply();
  table.style.height = 'auto'; table.style.alignSelf = 'flex-start';  // 자연 높이로 측정
  while (table.offsetHeight > avail() && fs > 5.2) { fs -= 0.3; apply(); }
  table.style.height = ''; table.style.alignSelf = '';
}
function fitOneLines(table, baseFs) {
  // 모든 행을 같은 글자 크기로 맞추고(최대 2.5pt 축소), 그래도 넘치는 행만 말줄임
  const tds = $$('td.one', table), minFs = Math.max(5.5, baseFs - 2.5);
  let fs = baseFs;
  const setAll = () => tds.forEach(td => { td.textContent = td.dataset.full; td.style.fontSize = fs + 'pt'; });
  setAll();
  while (tds.some(td => td.scrollWidth > td.clientWidth) && fs > minFs) { fs -= 0.25; setAll(); }
  tds.forEach(td => {
    const full = td.dataset.full;
    if (td.scrollWidth <= td.clientWidth) return;
    let lo = 0, hi = full.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; td.textContent = full.slice(0, mid) + '…'; td.scrollWidth > td.clientWidth ? hi = mid - 1 : lo = mid; }
    td.textContent = full.slice(0, lo).trimEnd() + '…';
  });
}
function fitZoom() {
  const wrap = $('#previewWrap'), zoom = $('#zoom'), page = $('#page');
  const w = page.offsetWidth, h = page.offsetHeight;
  const s = Math.min(1.25, (wrap.clientWidth - 32) / w);
  zoom.style.transform = `scale(${s})`;
  zoom.style.width = w * s + 'px';
  zoom.style.height = h * s + 'px';
  zoom.style.transformOrigin = 'top left';
}

/* ---------------- 상태 변경 / 번호 ---------------- */
let renderQueued = false;
function changed(markDirty = true) {
  if (markDirty) dirty = true;
  updateStatus();
  scheduleAutoImage();
  updateItemCalcs();
  if (!renderQueued) { renderQueued = true; setTimeout(() => { renderQueued = false; renderPreview(); }, 0); }
}
function updateStatus() {
  $('#stNo').textContent = Q.no || `${peekedNo} (예정)`;
  const st = $('#stState');
  st.textContent = !Q.no ? '미저장' : dirty ? '수정됨' : '저장됨';
  st.className = 'badge' + (Q.no && !dirty ? ' ok' : '');
}
async function refreshNo() {
  if (Q.no) return;
  try { peekedNo = await api.peekNo(Q.date); } catch { peekedNo = Q.date.replace(/-/g, '') + '-????'; }
  updateStatus(); renderPreview();
}

function loadQuote(q) {
  Q = JSON.parse(JSON.stringify(q, (k, v) => k.startsWith('_') ? undefined : v)); Q.items.forEach(it => it.id ||= uid());
  dirty = !q.no;
  fillForm(); refreshNo(); changed(!q.no);
}

/* ---------------- 저장 ---------------- */
async function saveQuote(silent = false) {
  const now = new Date().toISOString();
  Q.createdAt ||= now; Q.updatedAt = now;
  Q.total = calcTotals().I;
  const wasNew = !Q.no;
  const saved = await api.save(JSON.parse(JSON.stringify(Q, (k, v) => k.startsWith('_') ? undefined : v)));
  Q.no = saved.no; dirty = false;
  updateStatus(); renderPreview();
  if (!silent) toast(wasNew ? `저장 완료 · 견적번호 ${Q.no} 발급` : `저장 완료 · ${Q.no}`);
  return Q;
}
async function ensureSaved() {
  if (!filledItems().length) throw new Error('품목을 1개 이상 입력하세요');
  if (!Q.no || dirty) await saveQuote(true);
}

/* ---------------- PDF ---------------- */
async function makePdf() {
  await document.fonts?.ready;
  renderPreview();
  const page = $('#page');
  const canvas = await html2canvas(page, {
    scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false,
    scrollX: 0, scrollY: 0, windowWidth: page.scrollWidth + 100,
    onclone: doc => {
      const z = doc.getElementById('zoom'); z.style.transform = 'none'; z.style.width = ''; z.style.height = '';
      doc.getElementById('page').style.boxShadow = 'none';
      doc.querySelectorAll('.ph').forEach(e => e.style.visibility = 'hidden');
    },
  });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
  pdf.setProperties({ title: `견적서 ${Q.no}`, author: '롯데하이마트 정왕역점', subject: Q.client.name });
  const filename = `견적서_${Q.no}_${safeName(Q.client.name) || '고객'}.pdf`;
  const dataUri = pdf.output('datauristring');
  return { pdf, filename, base64: dataUri.slice(dataUri.indexOf(',') + 1) };
}
function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function doPdf() {
  await ensureSaved();
  const { pdf, filename, base64 } = await makePdf();
  download(pdf.output('blob'), filename);
  if (api.server) {
    const r = await api.call('POST', '/api/pdf', { no: Q.no, client: Q.client.name, pdf: base64 });
    toast(`PDF 생성 완료 · ${r.file} 에도 보관`);
  } else toast('PDF 생성 완료');
}

/* ---------------- 이메일 ---------------- */
const fillTpl = s => s.replace(/\{client\}/g, Q.client.name || '고객').replace(/\{no\}/g, Q.no)
  .replace(/\{total\}/g, fmt(Q.total)).replace(/\{valid\}/g, Q.validUntil ? krDate(Q.validUntil) : '');
async function openMail() {
  await ensureSaved();
  $('#mTo').value = Q.client.email || '';
  $('#mCc').value = '';
  $('#mSubject').value = fillTpl(settings.mail_subject);
  $('#mBody').value = fillTpl(settings.mail_body);
  $('#mAttach').textContent = `첨부: 견적서_${Q.no}_${safeName(Q.client.name) || '고객'}.pdf` +
    (api.server ? '' : '  ※ 웹 버전: [발송]을 누르면 PDF가 내려받아지고 메일 앱이 열립니다. 받은 PDF를 첨부해 보내주세요.');
  $('#dlgMail').showModal();
}
async function sendMail() {
  const { pdf, filename, base64 } = await makePdf();
  const msg = { to: $('#mTo').value, cc: $('#mCc').value, subject: $('#mSubject').value, body: $('#mBody').value };
  if (!msg.to.trim()) throw new Error('받는 사람을 입력하세요');
  if (api.server) {
    await api.call('POST', '/api/email', { ...msg, filename, pdf: base64 });
    $('#dlgMail').close();
    toast(`메일 발송 완료 → ${msg.to}`);
  } else {
    download(pdf.output('blob'), filename);
    location.href = `mailto:${encodeURIComponent(msg.to)}?cc=${encodeURIComponent(msg.cc)}&subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`;
    $('#dlgMail').close();
  }
}

/* ---------------- 저장 목록 ---------------- */
let listCache = [];
async function openList() {
  listCache = await api.list();
  renderList();
  $('#dlgList').showModal();
  $('#listSearch').focus();
}
function renderList() {
  const q = $('#listSearch').value.trim().toLowerCase();
  const rows = listCache.filter(r => !q || [r.no, r.client, r.models].join(' ').toLowerCase().includes(q));
  $('#listBody').innerHTML = rows.length ? rows.map(r => `<tr class="${r.no === Q.no ? 'cur' : ''}">
    <td><b>${esc(r.no)}</b></td><td>${esc(r.date)}</td><td>${esc(r.client)}</td><td class="m" title="${esc(r.models)}">${esc(r.models)}</td>
    <td class="r">${fmt(r.total)}</td>
    <td class="btns"><button data-open="${r.no}">열기</button> <button class="ghost" data-copy="${r.no}">복제</button> <button class="ghost" data-del="${r.no}">삭제</button></td></tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:#888;padding:30px">저장된 견적이 없습니다</td></tr>';
}
async function listAction(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.open || b.dataset.copy) {
    if (dirty && filledItems().length && !confirm('현재 견적에 저장하지 않은 변경이 있습니다. 계속할까요?')) return;
    const q = await api.get(b.dataset.open || b.dataset.copy);
    $('#dlgList').close();
    if (b.dataset.copy) loadQuote(asCopy(q)); else loadQuote(q);
    toast(b.dataset.copy ? '복제됨 · 저장 시 새 번호 발급' : `${q.no} 불러옴`);
  }
  if (b.dataset.del) {
    if (!confirm(`${b.dataset.del} 견적을 삭제할까요? (번호는 재사용되지 않습니다)`)) return;
    await api.remove(b.dataset.del);
    if (Q.no === b.dataset.del) { Q.no = ''; dirty = true; refreshNo(); }
    listCache = await api.list(); renderList();
  }
}
async function exportBackup() {
  const nos = (await api.list()).map(r => r.no);
  const quotes = await Promise.all(nos.map(no => api.get(no)));
  const data = { app: 'quote-app', exportedAt: new Date().toISOString(), counter: LS.get('qt_counter', {}), settings: LS.get('qt_settings', {}), quotes };
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `견적백업_${isoDate(new Date())}.json`);
  toast(`견적 ${quotes.length}건 백업 완료`);
}
async function importBackup(file) {
  if (!file) return;
  const data = JSON.parse(await file.text());
  if (data.app !== 'quote-app' || !Array.isArray(data.quotes)) throw new Error('견적 백업 파일이 아닙니다');
  for (const q of data.quotes) await api.save(q);     // 번호 그대로 복원
  const c = LS.get('qt_counter', {});
  for (const [k, v] of Object.entries(data.counter || {})) c[k] = Math.max(c[k] || 0, v);
  LS.set('qt_counter', c);
  if (!api.server && data.settings && Object.keys(data.settings).length) { LS.set('qt_settings', { ...LS.get('qt_settings', {}), ...data.settings }); settings = await api.settings(); }
  listCache = await api.list(); renderList(); refreshNo();
  toast(`견적 ${data.quotes.length}건 가져오기 완료`);
}
function asCopy(q) {
  const today = isoDate(new Date());
  return { ...JSON.parse(JSON.stringify(q)), no: '', date: today, validUntil: addDays(today, +settings.validity_days || 30), createdAt: '', updatedAt: '' };
}

/* ---------------- 설정 ---------------- */
const SET_MAP = { sHost: 'smtp_host', sPort: 'smtp_port', sUser: 'smtp_user', sFrom: 'from_name', sCName: 'consultant_name',
  sCTel: 'consultant_tel', sCCell: 'consultant_cell', sDays: 'validity_days', sSubj: 'mail_subject', sBody: 'mail_body',
  sBizNo: 'biz_no', sBizName: 'biz_name', sBizCeo: 'biz_ceo', sBizAddr: 'biz_addr', sBizType: 'biz_type', sBizItem: 'biz_item', sNvId: 'naver_client_id' };
function openSettings() {
  for (const [id, k] of Object.entries(SET_MAP)) $('#' + id).value = settings[k] ?? '';
  $('#sPass').value = '';
  $('#sPass').placeholder = settings.has_pass ? '저장됨 (변경 시에만 입력)' : '앱 비밀번호 입력';
  $('#sNvSecret').value = '';
  $('#sNvSecret').placeholder = settings.has_naver ? '저장됨 (변경 시에만 입력)' : '선택 사항';
  $('#setSmtp').hidden = $('#setNaver').hidden = !api.server;   // 웹 버전에선 메일 앱 사용 · 검색은 서버 함수가 처리
  $('#dlgSettings').showModal();
}
async function saveSettings() {
  const s = {};
  for (const [id, k] of Object.entries(SET_MAP)) s[k] = $('#' + id).value;
  s.smtp_pass = $('#sPass').value;
  s.naver_client_secret = $('#sNvSecret').value;
  await api.saveSettings(s);
  settings = await api.settings();
  $('#dlgSettings').close();
  renderPreview();
  toast('설정 저장 완료');
}

async function uploadStamp(file) {
  if (!file) return;
  const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  if (api.server) await api.call('POST', '/api/stamp', { png: dataUrl.split(',')[1] });
  else await IDB.set('stamp', dataUrl);
  setStampSrc(api.server ? 'assets/stamp.png?v=' + Date.now() : dataUrl);
  toast('직인 이미지 교체 완료');
}
function setStampSrc(src) { $('#pStamp').src = src; $('#sStampPrev').src = src; }

/* ---------------- 엑셀 (함수 포함, A4 1페이지) ---------------- */
async function imgToBase64(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
}
async function doExcel() {
  await ensureSaved();
  const wb = new ExcelJS.Workbook();
  wb.creator = '롯데하이마트 정왕역점';
  const ws = wb.addWorksheet('견적서', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0, footer: 0 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [7, 17, 5.5, 11, 11, 12, 12, 10.5, 12, 15].map(width => ({ width }));
  const thin = { style: 'thin', color: { argb: 'FF666666' } }, med = { style: 'medium', color: { argb: 'FF222222' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const font = (o = {}) => ({ name: '맑은 고딕', size: 9, ...o });
  const center = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const right = { vertical: 'middle', horizontal: 'right' };
  const black = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  const gray = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F3F5' } };
  const blue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFE4EC' } };
  const won = '#,##0;-#,##0;""';
  const cell = (ref, v, st = {}) => { const c = ws.getCell(ref); c.value = v; Object.assign(c, st); return c; };
  const merge = (rng, v, st = {}) => { ws.mergeCells(rng); return cell(rng.split(':')[0], v, st); };
  const borderRange = (r1, c1, r2, c2, b = box) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = b; };

  ws.getRow(1).height = 18;
  cell('A1', `NO. ${Q.no}`, { font: font({ bold: true }) });
  merge('A2:F3', '견   적   서', { font: font({ size: 20, bold: true, underline: true }), alignment: center });
  merge('A5:F5', krDate(Q.date), { font: font({ size: 11, bold: true }), alignment: center, border: { bottom: med } });
  cell('A6', '수신:', { font: font({ size: 10.5, bold: true }), border: { bottom: med } });
  merge('B6:F6', Q.client.name, { font: font({ size: 11.5, bold: true }), alignment: center, border: { bottom: med } });
  merge('A7:A9', '고객님\n연락처', { font: font({ bold: true }), alignment: center });
  [['TEL', Q.client.tel], ['FAX', Q.client.fax], ['E-MAIL', Q.client.email]].forEach(([k, v], i) => {
    cell(`B${7 + i}`, k, { font: font(), alignment: center });
    merge(`C${7 + i}:F${7 + i}`, v, { font: font(), alignment: { vertical: 'middle', indent: 1 } });
  });
  borderRange(7, 1, 9, 6);
  merge('A10:F10', '아래와 같이 견적합니다', { font: font({ size: 11, bold: true }), alignment: center });
  merge('A11:B11', '전문상담원', { font: font({ size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } }), fill: black, alignment: center });
  merge('C11:F11', Q.consultant.name, { font: font({ size: 11, bold: true }), alignment: center });
  cell('A12', 'TEL', { font: font(), alignment: center });
  cell('B12', Q.consultant.tel, { font: font(), alignment: center });
  merge('C12:F12', Q.consultant.cell, { font: font(), alignment: center });
  borderRange(11, 1, 12, 6);
  [11, 12].forEach(r => ws.getRow(r).height = 20);

  // 품목표
  const H = 14, items = filledItems(), rows = Math.max(MIN_ROWS, items.length), R1 = H + 1, R2 = H + rows;
  ['품목', '모델명', '수량', '판매기준가(개당)', '대량 할인단가', '공급 단가', '공급가액', '세액', '합계금액', '비고'].forEach((t, i) =>
    cell(ws.getCell(H, i + 1).address, t, { font: font({ bold: true, size: i === 3 || i === 4 ? 7.5 : 9 }), alignment: center, fill: gray, border: box }));
  ws.getRow(H).height = 22;
  for (let r = R1; r <= R2; r++) {
    const it = items[r - R1];
    ws.getRow(r).height = 19;
    if (it) {
      cell(`A${r}`, it.cat); cell(`B${r}`, it.model); cell(`C${r}`, num(it.qty) || null);
      cell(`D${r}`, num(it.price) || null); cell(`E${r}`, num(it.disc) || null); cell(`J${r}`, it.note);
    }
    const c = calcItem(it || {});
    // 함수 미리 세팅 (빈 줄에도 입력하면 자동 계산)
    cell(`F${r}`, { formula: `IF(OR(C${r}="",AND(D${r}="",E${r}="")),"",C${r}*IF(E${r}="",D${r},E${r}))`, result: c.F === '' ? '' : c.F });
    cell(`G${r}`, { formula: Q.vatIncluded ? `IF(F${r}="","",ROUND(F${r}/1.1,0))` : `IF(F${r}="","",F${r})`, result: c.G === '' ? '' : c.G });
    cell(`H${r}`, { formula: Q.vatIncluded ? `IF(F${r}="","",F${r}-G${r})` : `IF(G${r}="","",ROUND(G${r}*0.1,0))`, result: c.H === '' ? '' : c.H });
    cell(`I${r}`, { formula: `IF(G${r}="","",G${r}+H${r})`, result: c.I === '' ? '' : c.I });
    for (let col = 1; col <= 10; col++) {
      const x = ws.getCell(r, col);
      x.border = box; x.font = font({ size: col === 10 ? 8 : 9 });
      x.alignment = col <= 3 ? center : col === 10 ? { vertical: 'middle', shrinkToFit: true } : right;
      if (col >= 3 && col <= 9) x.numFmt = won;
    }
  }
  borderRange(H, 1, R2, 10);

  const t = calcTotals();
  // 총액 박스 (합계 행 참조)
  const SR = R2 + 2 + 16 + 1; // 합계 행 위치 (스펙 영역 16행 뒤)
  merge('G11:H11', '총액(VAT포함)', { font: font({ bold: true, color: { argb: 'FFFFFFFF' } }), fill: black, alignment: center });
  merge('I11:J11', { formula: `I${SR}`, result: t.I }, { font: font({ size: 14, bold: true, color: { argb: 'FFD4141B' } }), alignment: center, numFmt: '"₩ "#,##0' });
  borderRange(11, 7, 11, 10);

  // 스펙 영역
  const S0 = R2 + 2, SPEC_ROWS = 16;
  cell(`A${S0}`, `■ ${items.length > 1 ? '품목별 주요 스펙' : (items[0]?.model || '') + ' 주요 스펙'}`, { font: font({ size: 10.5, bold: true }) });
  if (items.length <= 1) {
    const specs = parseSpecs(items[0]?.specs).slice(0, SPEC_ROWS - 1);
    const rh = Math.max(15, Math.min(28, (SPEC_ROWS - 1) * 16 / Math.max(specs.length, 1)));
    specs.forEach((s, i) => {
      const r = S0 + 1 + i; ws.getRow(r).height = rh;
      merge(`F${r}:G${r}`, s.k, { font: font({ bold: true }), fill: blue, alignment: center });
      merge(`H${r}:J${r}`, s.v, { font: font(), alignment: { vertical: 'middle', indent: 1, shrinkToFit: true } });
      borderRange(r, 6, r, 10, { top: thin, bottom: thin, left: thin, right: thin });
    });
    if (items[0]?.image) {
      const id = wb.addImage({ base64: items[0].image, extension: 'jpeg' });
      const totalH = specs.length * rh || 200;
      ws.addImage(id, { tl: { col: 0.2, row: S0 + 0.1 }, ext: { width: 5 * 64 * 1.05, height: Math.min(totalH * 1.25, 5 * 64 * 1.05 * 0.62) } });
    }
  } else {
    const rh = Math.max(15, Math.min(30, (SPEC_ROWS - 1) * 16 / items.length));
    cell(`A${S0 + 1}`, 'No', { font: font({ bold: true }), fill: blue, alignment: center });
    cell(`B${S0 + 1}`, '품목', { font: font({ bold: true }), fill: blue, alignment: center });
    merge(`C${S0 + 1}:D${S0 + 1}`, '모델명', { font: font({ bold: true }), fill: blue, alignment: center });
    merge(`E${S0 + 1}:J${S0 + 1}`, '주요 스펙', { font: font({ bold: true }), fill: blue, alignment: center });
    items.slice(0, SPEC_ROWS - 2).forEach((it, i) => {
      const r = S0 + 2 + i; ws.getRow(r).height = rh;
      cell(`A${r}`, i + 1, { font: font(), alignment: center });
      cell(`B${r}`, it.cat, { font: font(), alignment: center });
      merge(`C${r}:D${r}`, it.model, { font: font({ bold: true }), alignment: center });
      merge(`E${r}:J${r}`, oneLineSpec(it), { font: font(), alignment: { vertical: 'middle', indent: 1, shrinkToFit: true } });
    });
    borderRange(S0 + 1, 1, S0 + 1 + Math.min(items.length, SPEC_ROWS - 2), 10);
  }

  // 합계 행 + 유효기간 + 명함
  cell(`E${SR}`, '합계', { font: font({ size: 10, bold: true }), fill: gray, alignment: center });
  ['F', 'G', 'H', 'I'].forEach(col => cell(`${col}${SR}`, { formula: `SUM(${col}${R1}:${col}${R2})`, result: t[col] }, { font: font({ bold: true }), alignment: right, numFmt: won }));
  borderRange(SR, 5, SR, 10, { top: med, bottom: med, left: thin, right: thin });
  ws.getRow(SR).height = 26;
  merge(`E${SR + 1}:J${SR + 4}`, `해당 견적의 유효기간은 ${mdDate(Q.validUntil)}까지 입니다.`, {
    font: font({ size: 12.5, bold: true }), alignment: center, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FA' } } });
  ws.getCell(`E${SR + 1}`).value = { richText: [
    { text: '해당 견적의 유효기간은 ', font: font({ size: 12.5, bold: true }) },
    { text: mdDate(Q.validUntil), font: font({ size: 12.5, bold: true, color: { argb: 'FFD4141B' } }) },
    { text: '까지 입니다.', font: font({ size: 12.5, bold: true }) }] };
  for (let r = SR + 1; r <= SR + 4; r++) ws.getRow(r).height = 22;

  // 공급자 정보 (셀로 직접 작성) + 직인
  merge('G4:G9', '공\n급\n자', { font: font({ bold: true }), alignment: center });
  merge('H4:H5', '사업자\n고유번호', { font: font({ size: 8 }), alignment: center });
  merge('I4:J5', settings.biz_no, { font: font(), alignment: { vertical: 'middle', horizontal: 'left', indent: 3 } });
  cell('H6', '상    호', { font: font(), alignment: center });
  cell('I6', settings.biz_name, { font: font(), alignment: center });
  cell('J6', settings.biz_ceo, { font: font(), alignment: center });
  merge('H7:H8', '사업자\n주    소', { font: font({ size: 8 }), alignment: center });
  merge('I7:J8', settings.biz_addr, { font: font(), alignment: center });
  cell('H9', '업    태', { font: font(), alignment: center });
  cell('I9', settings.biz_type, { font: font(), alignment: center });
  cell('J9', settings.biz_item, { font: font(), alignment: center });
  borderRange(4, 7, 9, 10);
  const [stamp, card] = await Promise.all([imgToBase64($('#pStamp').src), imgToBase64('assets/business_card.png')]);
  ws.addImage(wb.addImage({ base64: stamp, extension: 'png' }), { tl: { col: 9.3, row: 0.4 }, ext: { width: 78, height: 79 } });
  ws.addImage(wb.addImage({ base64: card, extension: 'png' }), { tl: { col: 0.1, row: SR - 1 + 0.15 }, ext: { width: 272, height: 152 } });
  ws.pageSetup.printArea = `A1:J${SR + 4}`;

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `견적서_${Q.no}_${safeName(Q.client.name) || '고객'}.xlsx`);
  toast('엑셀 생성 완료 (계산 함수 포함)');
}

/* ---------------- 버튼 연결 ---------------- */
function busy(btn, fn) {
  return async () => {
    btn.disabled = true;
    try { await fn(); } catch (e) { console.error(e); toast(e.message || String(e), true, 5000); }
    finally { btn.disabled = false; }
  };
}
function wire() {
  const on = (id, fn) => $(id).addEventListener('click', busy($(id), fn));
  on('#btnSave', () => { if (!filledItems().length) throw new Error('품목을 1개 이상 입력하세요'); return saveQuote(); });
  on('#btnPdf', doPdf);
  on('#btnMail', openMail);
  on('#btnXlsx', doExcel);
  on('#btnPrint', async () => { renderPreview(); window.print(); });
  on('#btnList', openList);
  on('#btnSettings', openSettings);
  on('#btnNew', async () => {
    if (dirty && filledItems().length && !confirm('저장하지 않은 변경이 있습니다. 새 견적을 시작할까요?')) return;
    loadQuote(blankQuote());
  });
  on('#btnDup', async () => { if (!filledItems().length) return; loadQuote(asCopy(Q)); toast('복제됨 · 저장 시 새 번호 발급'); });
  on('#mSend', sendMail);
  on('#sSave', saveSettings);
  $('#listSearch').addEventListener('input', renderList);
  $('#btnBackup').addEventListener('click', () => exportBackup().catch(e => toast(e.message, true)));
  $('#btnRestore').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', e => importBackup(e.target.files[0]).catch(err => toast(err.message, true)).finally(() => e.target.value = ''));
  $('#sStamp').addEventListener('change', e => uploadStamp(e.target.files[0]).catch(err => toast(err.message, true)));
  $('#listBody').addEventListener('click', e => listAction(e).catch(err => toast(err.message, true)));
  $$('dialog .close').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  window.addEventListener('resize', fitZoom);
  window.addEventListener('beforeunload', e => { if (dirty && Q.no) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); $('#btnSave').click(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') { e.preventDefault(); $('#btnPrint').click(); }
  });
}

/* ---------------- 시작 ---------------- */
(async function start() {
  await api.init();
  try { settings = await api.settings(); } catch { /* 기본값 사용 */ }
  setupForm(); wire();
  if (!api.server) { const st = await IDB.get('stamp').catch(() => ''); if (st) setStampSrc(st); }
  const first = !LS.get('qt_seen', false);
  LS.set('qt_seen', true);
  loadQuote(blankQuote(first));   // 첫 실행 시 양식 예시 데이터로 시작
  fitZoom();
  if (!api.server) toast('웹 버전: 견적은 이 브라우저에 저장됩니다. [저장 목록 → 백업 내보내기]로 주기적으로 백업하세요.', false, 6000);
})();
})();
