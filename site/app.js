import { generateVideo } from './video.js';

// ====== CONFIG ======
const PASSWORD = 'RA160826';
const FILE_PREFIX = 'amanda-e-rafael';
const GALLERY = 'gallery';
// ====================

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const sess = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
};

const ICON_HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.7 7.8 3.6 4.5 6.9 4.5c2 0 3.5 1.1 5.1 3 1.6-1.9 3.1-3 5.1-3 3.3 0 5.2 3.3 4.1 6.6-1.7 4.8-9.2 9.4-9.2 9.4Z"/></svg>';
const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>';

let photos = [];                       // ids ("0001", ...)
let favs = new Set(store.get('ar-favs', []));
let filter = 'all';

const thumbUrl = id => `${GALLERY}/thumbs/${id}.webp`;
const webUrl = id => `${GALLERY}/web/${id}.jpg`;

/* ---------- modal ---------- */
function modal(text, buttons) {
  return new Promise(resolve => {
    $('#modal-text').textContent = text;
    const box = $('#modal-btns');
    box.innerHTML = '';
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.className = 'btn' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      el.onclick = () => { $('#modal').hidden = true; resolve(b.value); };
      box.appendChild(el);
    });
    $('#modal').hidden = false;
    box.querySelector('.primary, .btn')?.focus();
  });
}

/* ---------- capa / senha ---------- */
const norm = s => s.trim().toUpperCase().replace(/\s+/g, '');

async function enter() {
  $('#cover').hidden = true;
  $('#gallery').hidden = false;
  window.scrollTo(0, 0);
  await loadPhotos();
}

$('#pw-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (norm($('#pw').value) === PASSWORD) {
    sess.set('ar-ok', '1');
    $('#pw-error').textContent = '';
    await enter();
    await modal('Favorite as suas fotos preferidas depois gere um video para postar nas redes!', [{ label: 'OK', value: true, primary: true }]);
  } else {
    $('#pw-error').textContent = 'Senha incorreta. Confira o convite e tente de novo.';
    const f = $('#pw-form');
    f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    $('#pw').select();
  }
});

/* ---------- galeria ---------- */
async function loadPhotos() {
  try {
    const res = await fetch(`${GALLERY}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error();
    photos = (await res.json()).photos || [];
  } catch { photos = []; }
  // limpa favoritas que não existem mais
  favs = new Set([...favs].filter(id => photos.includes(id)));
  renderGrid();
}

function visibleList() { return filter === 'fav' ? photos.filter(id => favs.has(id)) : photos; }

function renderGrid() {
  const list = visibleList();
  const grid = $('#grid');
  const frag = document.createDocumentFragment();
  for (const id of list) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.id = id;
    cell.innerHTML = `<img src="${thumbUrl(id)}" alt="Foto ${+id}" loading="lazy" decoding="async">
      <div class="acts">
        <button class="round fav" data-act="fav" aria-label="Favoritar">${ICON_HEART}</button>
        <button class="round" data-act="dl" aria-label="Baixar foto">${ICON_DL}</button>
      </div>`;
    cell.querySelector('.fav').classList.toggle('faved', favs.has(id));
    const img = cell.querySelector('img');
    img.onload = () => img.classList.add('ok');
    img.onerror = () => img.classList.add('ok');
    frag.appendChild(cell);
  }
  grid.replaceChildren(frag);

  const empty = $('#empty');
  if (!photos.length) {
    empty.hidden = false;
    empty.textContent = 'Ainda não há fotos por aqui. Volte em breve! 💛';
  } else if (!list.length) {
    empty.hidden = false;
    empty.textContent = 'Nenhuma favorita ainda. Toque no ♥ das fotos que você mais gostou!';
  } else empty.hidden = true;
  updateCounts();
}

function updateCounts() {
  $('#count-all').textContent = photos.length;
  $('#count-fav').textContent = favs.size;
  const b = $('#fab-badge');
  b.hidden = favs.size === 0;
  b.textContent = favs.size;
}

function toggleFav(id) {
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  store.set('ar-favs', [...favs]);
  const cell = $(`.cell[data-id="${id}"]`);
  if (cell) cell.querySelector('.fav').classList.toggle('faved', favs.has(id));
  updateCounts();
}

function download(id) {
  const a = document.createElement('a');
  a.href = webUrl(id);
  a.download = `${FILE_PREFIX}-${id}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

$('#grid').addEventListener('click', e => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const id = cell.dataset.id;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'fav') {
    toggleFav(id);
    if (filter === 'fav') renderGrid();
  } else if (act === 'dl') download(id);
  else openLightbox(id);
});

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  filter = t.dataset.filter;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  renderGrid();
  window.scrollTo({ top: 0 });
}));

/* ---------- lightbox ---------- */
let lbList = [], lbIdx = 0;
const lb = $('#lightbox'), lbImg = $('#lb-img');
$('#lb-fav').innerHTML = ICON_HEART;
$('#lb-dl').innerHTML = ICON_DL;

function openLightbox(id) {
  lbList = visibleList();
  lbIdx = Math.max(0, lbList.indexOf(id));
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
  showLb();
}
function showLb() {
  const id = lbList[lbIdx];
  lbImg.src = thumbUrl(id);               // placeholder rápido
  const full = new Image();
  full.onload = () => { if (lbList[lbIdx] === id) lbImg.src = full.src; };
  full.src = webUrl(id);
  $('#lb-pos').textContent = `${lbIdx + 1} / ${lbList.length}`;
  $('#lb-fav').classList.toggle('faved', favs.has(id));
  for (const d of [-1, 1]) { const n = lbList[lbIdx + d]; if (n) new Image().src = webUrl(n); }
}
function stepLb(d) {
  const n = lbIdx + d;
  if (n < 0 || n >= lbList.length) return;
  lbIdx = n; showLb();
}
function closeLb() {
  lb.hidden = true;
  document.body.style.overflow = '';
  if (filter === 'fav') renderGrid();
}
$('#lb-close').onclick = closeLb;
$('#lb-prev').onclick = () => stepLb(-1);
$('#lb-next').onclick = () => stepLb(1);
$('#lb-fav').onclick = () => { const id = lbList[lbIdx]; toggleFav(id); $('#lb-fav').classList.toggle('faved', favs.has(id)); };
$('#lb-dl').onclick = () => download(lbList[lbIdx]);
document.addEventListener('keydown', e => {
  if (lb.hidden) return;
  if (e.key === 'Escape') closeLb();
  if (e.key === 'ArrowLeft') stepLb(-1);
  if (e.key === 'ArrowRight') stepLb(1);
});
let tx = 0, ty = 0;
lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
lb.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) stepLb(dx < 0 ? 1 : -1);
  else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLb();
}, { passive: true });

/* ---------- gerar vídeo ---------- */
const vs = $('#vsheet');
const views = { config: $('#v-config'), progress: $('#v-progress'), done: $('#v-done') };
const showView = k => Object.entries(views).forEach(([n, el]) => { el.hidden = n !== k; });
let bgId = null, speed = 2.5, abortCtl = null, videoUrl = null, videoFile = null;

$('#fab').addEventListener('click', async () => {
  if (!favs.size) {
    await modal('Você ainda não favoritou nenhuma foto. Toque no ♥ das que mais gostou!', [{ label: 'OK', value: true, primary: true }]);
    return;
  }
  const ok = await modal('Gerar video com as favoritas?', [
    { label: 'Agora não', value: false },
    { label: 'Sim', value: true, primary: true },
  ]);
  if (ok) openVideoSheet();
});

function openVideoSheet() {
  const favList = photos.filter(id => favs.has(id));
  const ordered = [...favList, ...photos.filter(id => !favs.has(id))];
  if (!bgId || !photos.includes(bgId)) bgId = favList[0];
  const grid = $('#bg-grid');
  const frag = document.createDocumentFragment();
  for (const id of ordered) {
    const d = document.createElement('div');
    d.className = 'bg-item' + (favs.has(id) ? ' fav' : '') + (id === bgId ? ' on' : '');
    d.dataset.id = id;
    d.innerHTML = `<img src="${thumbUrl(id)}" alt="" loading="lazy" decoding="async">`;
    frag.appendChild(d);
  }
  grid.replaceChildren(frag);
  setPreview();
  updateInfo();
  showView('config');
  vs.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#v-config .v-body').scrollTop = 0;
}

function setPreview() { $('#vprev').style.backgroundImage = `url("${thumbUrl(bgId)}")`; }
function updateInfo() {
  const n = favs.size, secs = Math.round(n * speed);
  const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
  let t = `${n} foto${n > 1 ? 's' : ''} · duração ≈ ${mm}:${ss}`;
  if (secs > 90) t += ' — passa de 90s; para Reels/Stories prefira menos fotos ou o modo Rápido.';
  $('#v-info').textContent = t;
}

$('#bg-grid').addEventListener('click', e => {
  const it = e.target.closest('.bg-item');
  if (!it) return;
  bgId = it.dataset.id;
  $('#bg-grid .on')?.classList.remove('on');
  it.classList.add('on');
  setPreview();
});
$('#speed').addEventListener('click', e => {
  const c = e.target.closest('.chip');
  if (!c) return;
  speed = +c.dataset.s;
  document.querySelectorAll('#speed .chip').forEach(x => x.classList.toggle('on', x === c));
  updateInfo();
});

function closeSheet() {
  abortCtl?.abort();
  vs.hidden = true;
  document.body.style.overflow = '';
  const v = $('#v-video');
  v.pause(); v.removeAttribute('src'); v.load();
  if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
}
$('#v-cancel').onclick = closeSheet;
$('#v-close').onclick = closeSheet;
$('#v-again').onclick = () => { $('#v-video').pause(); showView('config'); };
$('#v-abort').onclick = () => abortCtl?.abort();

$('#v-go').onclick = async () => {
  const urls = photos.filter(id => favs.has(id)).map(webUrl);
  abortCtl = new AbortController();
  showView('progress');
  setProgress(0);
  try {
    const { blob, ext } = await generateVideo({
      photoUrls: urls, bgUrl: webUrl(bgId), secondsPerPhoto: speed,
      onProgress: setProgress, signal: abortCtl.signal,
    });
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(blob);
    const name = `${FILE_PREFIX}-video.${ext}`;
    videoFile = new File([blob], name, { type: blob.type });
    const v = $('#v-video');
    v.src = videoUrl; v.play().catch(() => {});
    const a = $('#v-download');
    a.href = videoUrl; a.download = name;
    $('#v-share').hidden = !(navigator.canShare && navigator.canShare({ files: [videoFile] }));
    showView('done');
  } catch (err) {
    if (err?.name === 'AbortError') { if (!vs.hidden) showView('config'); return; }
    console.error(err);
    showView('config');
    modal(err?.message?.includes('suporta') ? err.message : 'Não consegui gerar o vídeo neste aparelho. Tente de novo ou use o Chrome/Safari atualizados.', [{ label: 'OK', value: true, primary: true }]);
  }
};
function setProgress(p) {
  const pct = Math.round(p * 100);
  $('#bar-fill').style.width = pct + '%';
  $('#v-pct').textContent = pct + '%';
}
$('#v-share').onclick = async () => {
  try { await navigator.share({ files: [videoFile], title: 'Amanda & Rafael' }); } catch {}
};

/* ---------- init ---------- */
if (sess.get('ar-ok') === '1') enter(); else $('#pw').focus({ preventScroll: true });
