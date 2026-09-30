// The Indie Short Fest write-up as a page-flip viewer (page thread, scene/BRIEFCASE2.md "Contract for the page thread").
// Three newsprint pages (frames/clipping_p1..3.jpg, 4:5) laid out like sheets on a desk: the sheet you are reading on the
// right, the ones you have read turned over onto a pile at the left. A click (or ->) turns the sheet over with a real 3D
// flip about its left edge, lit as it turns (a moving shade on the sheet, a shadow cast onto the one beneath), with the
// generated newsprint sound (pagesnd.js). Page 3 is the link: its URL box and the whole page open the article in a new tab.
// window.article = { init({ small }), open(), close(), flip(dir), get page(), get isOpen(), get turning() }
(() => {
'use strict';
const N = 3, FLIP_S = 0.85;
const A = { root: null, book: null, pages: [], page: 0, turning: null, small: false, url: '', box: null, raf: 0, meta: null, built: false, onClose: null };
const easeInOut = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const CSS = `
#artpanel { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: rgba(13, 11, 9, 0.8); padding: 0; overflow: hidden; }
#artpanel[hidden] { display: none; }
.art-stage { position: relative; width: 100%; height: 100%; display: grid; place-items: center; }
.art-book { position: relative; perspective: 2400px; perspective-origin: 50% 50%; transform-style: preserve-3d; }
.art-page { position: absolute; top: 0; left: var(--x); width: var(--pw); height: var(--ph); transform-origin: 0% 50%; transform-style: preserve-3d; will-change: transform; cursor: pointer; }
.art-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; background: #ece5d3; box-shadow: 0 2px 6px rgba(0,0,0,0.35), 0 18px 40px rgba(0,0,0,0.35); }
.art-face img { display: block; width: 100%; height: 100%; object-fit: cover; }
.art-face::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: var(--shade, 0); background: linear-gradient(to right, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.55) 100%); }
.art-back { transform: rotateY(180deg); background: #e8e1cf; }
.art-back::before { content: ''; position: absolute; inset: 0; background-image: var(--img); background-size: cover; transform: scaleX(-1); opacity: 0.06; filter: blur(0.6px) contrast(1.3); }
.art-back::after { background: linear-gradient(to left, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.55) 100%); }
.art-page.flat { transition: none; }
.art-under { position: absolute; top: 0; left: var(--x); width: var(--pw); height: var(--ph); pointer-events: none; opacity: 0; background: linear-gradient(to right, rgba(0,0,0,0.55), rgba(0,0,0,0.0) 55%); }
.art-grain { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.018) 0 1px, transparent 1px 3px); mix-blend-mode: multiply; }
.art-bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; padding: 14px max(16px, 2.2vw) calc(env(safe-area-inset-bottom, 0px) + 16px);
           font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #b7ab95; }
.art-bar .btn { min-height: 36px; padding: 8px 12px; }
.art-bar .art-n { min-width: 8ch; text-align: center; }
.art-close { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 14px); right: max(16px, 2.2vw); }
.art-mast { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 22px); left: max(16px, 2.2vw); font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #b7ab95; }
.art-hint { position: absolute; left: 50%; bottom: -34px; transform: translateX(-50%); white-space: nowrap; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #b7ab95; opacity: 0.85; }
.art-desk { position: absolute; top: 0; left: 0; width: var(--pw); height: var(--ph); display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: 0 8% 0 4%; box-sizing: border-box; color: #b7ab95; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; line-height: 1.7; z-index: 0; }
.art-desk b { display: block; font-family: 'Newsreader', 'Iowan Old Style', Georgia, serif; font-weight: 400; font-size: clamp(22px, 2.4vw, 34px); letter-spacing: 0; text-transform: none; line-height: 1.15; color: #efe6d4; margin-bottom: 8px; }
.art-desk i { font-family: 'Newsreader', Georgia, serif; font-style: italic; text-transform: none; letter-spacing: 0; font-size: 15px; color: #efe6d4; }
.art-book.one .art-desk { display: none; }
@media (max-width: 640px) { .art-mast { display: none; } .art-bar { gap: 6px; } }
`;
function build() {
  if (A.built) return; A.built = true;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'artpanel'; root.className = 'panel art'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Indie Short Fest write-up');
  root.innerHTML = `<div class="art-mast">Indie Short Fest · Published July 12, 2026</div>
    <button class="btn art-close" type="button" data-close>Close · Esc</button>
    <div class="art-stage"><div class="art-book"><div class="art-desk"><span>From the salesman\u2019s case</span><b>\u201cVery Prosperous Men\u201d named Best Short</b><i>Indie Short Fest, festival news \u00b7 published July 12, 2026</i><span class="art-desk-n"></span></div><div class="art-under"></div><div class="art-hint"></div></div></div>
    <div class="art-bar"><button class="btn art-prev" type="button" aria-label="Previous page">‹ Back</button><span class="art-n">page 1 of 3</span><button class="btn art-next" type="button" aria-label="Next page">Turn ›</button><a class="btn art-link" target="_blank" rel="noopener">Read it online ↗</a></div>`;
  document.body.appendChild(root); A.root = root; A.book = root.querySelector('.art-book');
  const base = A.small ? 'frames/m/' : 'frames/';
  for (let i = 0; i < N; i++) {
    const pg = document.createElement('div'); pg.className = 'art-page'; pg.dataset.i = i; pg.style.zIndex = String(N - i);
    pg.innerHTML = `<div class="art-face art-front"><img alt="${i === 2 ? 'Read the full write-up online' : 'Indie Short Fest write-up, page ' + (i + 1)}" decoding="async"><div class="art-grain"></div></div><div class="art-face art-back"></div>`;
    pg.querySelector('img').src = `${base}clipping_p${i + 1}.jpg`; pg.style.setProperty('--img', `url(${base}clipping_p${i + 1}.jpg)`);
    A.book.insertBefore(pg, A.book.querySelector('.art-hint')); A.pages.push({ el: pg, theta: 0 });
    pg.addEventListener('click', (e) => { e.stopPropagation(); onPage(i, e); });
  }
  root.addEventListener('click', e => { if (e.target === root || e.target.closest('[data-close]')) window.article.close(); });
  root.querySelector('.art-prev').addEventListener('click', () => window.article.flip(-1));
  root.querySelector('.art-next').addEventListener('click', () => window.article.flip(1));
  root.querySelector('.art-link').href = A.url || '#';
  addEventListener('keydown', e => { if (A.root.hidden || e.target.closest('input,textarea')) return; if (e.key === 'ArrowRight') window.article.flip(1); if (e.key === 'ArrowLeft') window.article.flip(-1); });
  addEventListener('resize', layout);
}
function layout() {
  if (!A.root || A.root.hidden) return;
  const vw = innerWidth, vh = innerHeight, two = vw >= 760;                     // room for the pile at the left on a desktop
  const ph = Math.min(vh * 0.8, (vw - 32) / (two ? 2.02 : 1) / 0.8), pw = ph * 0.8;
  A.book.style.width = (two ? 2 * pw + 0.02 * pw : pw) + 'px'; A.book.style.height = ph + 'px';
  A.book.style.setProperty('--pw', pw + 'px'); A.book.style.setProperty('--ph', ph + 'px'); A.book.style.setProperty('--x', (two ? pw + 0.02 * pw : 0) + 'px');
  A.two = two; A.book.classList.toggle('one', !two);
}
function setPage(i, theta) {
  const p = A.pages[i]; p.theta = theta; const el = p.el;
  el.style.transform = `rotateY(${-theta}deg)`;
  const s = Math.sin(theta * Math.PI / 180);
  el.querySelector('.art-front').style.setProperty('--shade', (theta < 90 ? 0.75 * s : 0).toFixed(3));
  el.querySelector('.art-back').style.setProperty('--shade', (theta >= 90 ? 0.6 * s : 0).toFixed(3));
  // flipped sheets pile up at the left, each a little askew; the sheet being read lies square
  if (theta >= 179.5) { const k = A.two ? i : 0; el.style.transform = `rotateY(-180deg) translate(${-(4 + 3 * k)}px, ${2 * k}px) rotate(${(k % 2 ? 1 : -1) * (1.2 + 0.8 * k)}deg)`; }
  el.style.zIndex = String(theta >= 90 ? 10 + i : N - i);
}
function onPage(i, e) {
  if (A.turning) return;
  const p = A.pages[i];
  if (p.theta >= 179) { window.article.flip(-1); return; }           // a sheet on the pile: turn it back
  if (i === N - 1) {                                                  // page 3: the whole page is the link (and its URL box)
    if (A.url) window.open(A.url, '_blank', 'noopener'); return;
  }
  window.article.flip(1);
}
function updateBar() {
  const n = A.root.querySelector('.art-n'); n.textContent = `page ${A.page + 1} of ${N}`;
  A.root.querySelector('.art-prev').disabled = A.page === 0; A.root.querySelector('.art-next').disabled = A.page === N - 1;
  const hint = A.page === N - 1 ? 'Tap the page to open the article' : 'Click the page to turn it';
  A.root.querySelector('.art-hint').textContent = A.two ? '' : hint; A.root.querySelector('.art-desk-n').textContent = `Page ${A.page + 1} of ${N} \u00b7 ${hint}`;
  const lastPage = A.pages[N - 1].el; lastPage.style.cursor = A.page === N - 1 ? 'pointer' : '';
}
function animate() {
  A.raf = 0; if (!A.turning) return;
  const tr = A.turning, k = Math.min(1, (performance.now() / 1000 - tr.t0) / FLIP_S), e = easeInOut(k);
  const theta = tr.dir > 0 ? 180 * e : 180 * (1 - e);
  setPage(tr.i, theta);
  const under = A.root.querySelector('.art-under'); under.style.opacity = (0.9 * Math.sin(theta * Math.PI / 180) * (theta < 90 ? 1 : 0.5)).toFixed(3);
  under.style.width = `calc(var(--pw) * ${Math.max(0.15, Math.cos(theta * Math.PI / 180)).toFixed(3)})`;
  if (k >= 1) { setPage(tr.i, tr.dir > 0 ? 180 : 0); A.page = tr.dir > 0 ? tr.i + 1 : tr.i; A.turning = null; under.style.opacity = 0; updateBar(); return; }
  A.raf = requestAnimationFrame(animate);
}
window.article = {
  get page() { return A.page; },
  get isOpen() { return !!A.root && !A.root.hidden; },
  get turning() { return !!A.turning; },
  init(meta) {
    A.meta = meta || {}; A.small = !!A.meta.small;
    return fetch('frames/clipping_pages.json').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => { A.url = j.url || ''; A.box = j.p3_url_box || null; build(); return true; });
  },
  open() {
    if (!A.built) build();
    A.root.hidden = false; layout(); A.page = 0; A.turning = null;
    A.pages.forEach((p, i) => setPage(i, 0)); updateBar();
    const c = A.root.querySelector('[data-close]'); if (c) c.focus();
  },
  /** QA: hold sheet i at an angle (degrees) without animating */
  pose(i, deg) { if (!A.root) return false; A.turning = null; setPage(i, deg); const under = A.root.querySelector('.art-under'); under.style.opacity = (0.9 * Math.sin(deg * Math.PI / 180) * (deg < 90 ? 1 : 0.5)).toFixed(3); under.style.width = `calc(var(--pw) * ${Math.max(0.15, Math.cos(deg * Math.PI / 180)).toFixed(3)})`; return true; },
  close() { if (!A.root) return; A.root.hidden = true; if (A.raf) cancelAnimationFrame(A.raf); A.raf = 0; A.turning = null; },
  flip(dir) {
    if (!A.root || A.root.hidden || A.turning) return false;
    const i = dir > 0 ? A.page : A.page - 1; if (i < 0 || i >= N - 1) return false;
    A.turning = { i, dir, t0: performance.now() / 1000 };
    if (window.pageSnd) window.pageSnd.sheet(0, FLIP_S);
    A.raf = requestAnimationFrame(animate); return true;
  },
};
})();
