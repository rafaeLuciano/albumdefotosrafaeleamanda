// Geração de vídeo 100% no navegador (sem áudio), formato Stories 1080x1920.
// Caminho principal: WebCodecs (H.264) + mp4-muxer -> .mp4 rápido e compatível com Instagram.
// Fallback: MediaRecorder (tempo real) quando o navegador não tem encoder H.264.
import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs';

export const VIDEO = {
  W: 1080, H: 1920, FPS: 30,
  title: 'Amanda & Rafael',
  date: '16.08.2026',
  // retângulo central onde as fotos "tocam" (ajuste aqui se quiser maior/menor)
  rectW: 0.80,   // largura = 80% do vídeo
  rectH: 600,    // altura em px
  rectRadius: 56,
  fade: 0.5,     // segundos de transição entre fotos
  zoom: 0.06,    // zoom suave (Ken Burns)
  bitrate: 6_000_000,
};

const FONT = '"Bricolage Grotesque", system-ui, sans-serif';

async function loadBitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao carregar ' + url);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function coverRect(iw, ih, w, h, zoom = 1, focusY = 0.35) {
  const base = Math.max(w / iw, h / ih) * zoom;
  const sw = w / base, sh = h / base;
  return [(iw - sw) * 0.5, (ih - sh) * focusY, sw, sh];
}

const ease = t => t * t * (3 - 2 * t);

export async function generateVideo({ photoUrls, bgUrl, secondsPerPhoto = 2.5, onProgress = () => {}, signal }) {
  const { W, H, FPS } = VIDEO;
  const n = photoUrls.length;
  const per = secondsPerPhoto;
  const total = n * per;
  const totalFrames = Math.round(total * FPS);
  const aborted = () => { if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError'); };

  try { await Promise.all([document.fonts.load(`700 100px ${FONT}`), document.fonts.load(`500 50px ${FONT}`)]); } catch {}

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });

  // --- fundo pré-renderizado (foto escolhida + escurecimento + título) ---
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = W; bgCanvas.height = H;
  {
    const b = bgCanvas.getContext('2d');
    const bmp = await loadBitmap(bgUrl);
    const [sx, sy, sw, sh] = coverRect(bmp.width, bmp.height, W, H, 1, 0.3);
    b.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
    bmp.close();
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(8,6,2,.58)'); g.addColorStop(.45, 'rgba(8,6,2,.30)'); g.addColorStop(1, 'rgba(8,6,2,.62)');
    b.fillStyle = g; b.fillRect(0, 0, W, H);

    b.save();
    b.fillStyle = '#dffff5'; b.textAlign = 'center'; b.textBaseline = 'alphabetic';
    b.shadowColor = 'rgba(0,0,0,.45)'; b.shadowBlur = 24; b.shadowOffsetY = 4;
    let size = 112;
    b.font = `700 ${size}px ${FONT}`;
    const maxW = W * 0.88;
    const tw = b.measureText(VIDEO.title).width;
    if (tw > maxW) { size = Math.floor(size * maxW / tw); b.font = `700 ${size}px ${FONT}`; }
    b.translate(W / 2, 270); b.rotate(-3 * Math.PI / 180);
    b.fillText(VIDEO.title, 0, 0);
    b.restore();

    b.save();
    b.fillStyle = '#dffff5'; b.textAlign = 'center';
    b.shadowColor = 'rgba(0,0,0,.45)'; b.shadowBlur = 20;
    b.font = `500 58px ${FONT}`;
    b.fillText(VIDEO.date, W / 2, 365);
    b.restore();
  }

  const rw = Math.round(W * VIDEO.rectW), rh = VIDEO.rectH;
  const rx = Math.round((W - rw) / 2), ry = Math.round((H - rh) / 2);

  // --- cache de fotos (só a atual e a próxima ficam na memória) ---
  const cache = new Map();
  const getBmp = async i => {
    if (!cache.has(i)) cache.set(i, loadBitmap(photoUrls[i]));
    return cache.get(i);
  };
  const prune = cur => {
    for (const [k, v] of cache) if (k < cur) { v.then(b => b.close()).catch(() => {}); cache.delete(k); }
  };

  function drawSlide(bmp, p, alpha) {
    const z = 1 + VIDEO.zoom * ease(Math.min(1, Math.max(0, p)));
    const [sx, sy, sw, sh] = coverRect(bmp.width, bmp.height, rw, rh, z, 0.35);
    ctx.globalAlpha = alpha;
    ctx.drawImage(bmp, sx, sy, sw, sh, rx, ry, rw, rh);
    ctx.globalAlpha = 1;
  }

  async function renderFrame(t) {
    const cur = Math.min(n - 1, Math.floor(t / per));
    const local = t - cur * per;
    ctx.drawImage(bgCanvas, 0, 0);

    // sombra + base do retângulo
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 18;
    roundedRect(ctx, rx, ry, rw, rh, VIDEO.rectRadius);
    ctx.fillStyle = '#e0fffd'; ctx.fill();
    ctx.restore();

    ctx.save();
    roundedRect(ctx, rx, ry, rw, rh, VIDEO.rectRadius);
    ctx.clip();
    const bmp = await getBmp(cur);
    drawSlide(bmp, (local + VIDEO.fade) / (per + VIDEO.fade), 1);
    if (cur + 1 < n) {
      const nextBmp = await getBmp(cur + 1);
      const fs = per - VIDEO.fade;
      if (local > fs) drawSlide(nextBmp, (local - fs) / (per + VIDEO.fade), ease((local - fs) / VIDEO.fade));
    }
    ctx.restore();
    prune(cur);
  }

  const canH264 = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  let codec = null;
  if (canH264) {
    for (const c of ['avc1.640028', 'avc1.4d0028', 'avc1.42E028']) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: VIDEO.bitrate, framerate: FPS });
        if (s.supported) { codec = c; break; }
      } catch {}
    }
  }

  try {
    if (codec) return await encodeWebCodecs();
    return await encodeRecorder();
  } finally {
    for (const v of cache.values()) v.then(b => b.close()).catch(() => {});
    cache.clear();
  }

  // ---------- WebCodecs + MP4 (rápido, mais rápido que tempo real) ----------
  async function encodeWebCodecs() {
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encErr = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { encErr = e; },
    });
    encoder.configure({ codec, width: W, height: H, bitrate: VIDEO.bitrate, framerate: FPS });
    try {
      for (let i = 0; i < totalFrames; i++) {
        aborted();
        if (encErr) throw encErr;
        await renderFrame(i / FPS);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
        encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
        frame.close();
        while (encoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 2));
        if (i % 6 === 0) { onProgress(i / totalFrames); await new Promise(r => setTimeout(r)); }
      }
      await encoder.flush();
      if (encErr) throw encErr;
      muxer.finalize();
      onProgress(1);
      return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
    } finally {
      try { encoder.close(); } catch {}
    }
  }

  // ---------- Fallback: MediaRecorder em tempo real ----------
  async function encodeRecorder() {
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) throw new Error('Seu navegador não suporta geração de vídeo. Tente o Chrome ou o Safari atualizados.');
    const mimes = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = mimes.find(m => MediaRecorder.isTypeSupported(m));
    const stream = canvas.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO.bitrate });
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const stopped = new Promise(r => { rec.onstop = r; });
    await renderFrame(0);
    rec.start(1000);
    const t0 = performance.now();
    try {
      while (true) {
        aborted();
        const t = (performance.now() - t0) / 1000;
        if (t >= total) break;
        await renderFrame(t);
        onProgress(t / total);
        await new Promise(r => requestAnimationFrame(r));
      }
    } finally {
      if (rec.state !== 'inactive') rec.stop();
      stream.getTracks().forEach(tr => tr.stop());
    }
    await stopped;
    onProgress(1);
    const type = (mime || 'video/webm').split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
  }
}
