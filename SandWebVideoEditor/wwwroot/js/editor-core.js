(function (root) {
  'use strict';

  const MIN_CLIP = 0.2;
  const FPS = 30;
  const IMAGE_SECONDS = 5;
  const MAX_IMAGE_SECONDS = 3600;
  const TRANSITIONS = ['fade', 'fadeblack', 'dissolve', 'wipeleft', 'wiperight', 'slideleft', 'slideright', 'circleopen', 'pixelize'];
  const EFFECTS = ['none', 'grayscale', 'sepia', 'bright', 'blur', 'negate'];
  const POSITIONS = ['top', 'center', 'bottom'];

  const uuid = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  const dur = (it) => Math.max(MIN_CLIP, Number(it.duration) || MIN_CLIP);
  const itemEnd = (it) => it.timelineStartTime + dur(it);
  const dropPrivate = (k, v) => (typeof k === 'string' && k.startsWith('_') ? undefined : v);

  function layoutVideoTrack(items) {
    const vids = items.filter(i => i.type === 0)
      .sort((a, b) => (a._dragKey ?? a.timelineStartTime) - (b._dragKey ?? b.timelineStartTime));
    let prev = null, prevDur = 0, prevTrIn = 0, cursor = 0;
    for (const it of vids) {
      const d = dur(it);
      it._trOut = 0;
      let trIn = 0;
      if (prev && TRANSITIONS.includes(it.transition)) {
        const room = Math.min(d, prevDur - prevTrIn) - 0.05;
        const t = Math.min(Math.max(it.transitionDuration ?? 1, 0), Math.max(0, room));
        if (t >= 0.05) { trIn = t; prev._trOut = t; }
      }
      it.timelineStartTime = prev ? cursor - trIn : 0;
      it._trIn = trIn;
      cursor = it.timelineStartTime + d;
      prev = it; prevDur = d; prevTrIn = trIn;
    }
    return cursor;
  }

  function timelineEnd(items) {
    layoutVideoTrack(items);
    return items.reduce((m, i) => (i.type === 1 && i.isMuted ? m : Math.max(m, itemEnd(i))), 0);
  }

  function fadeFactor(it, t) {
    let f = 1;
    const start = it.timelineStartTime, end = itemEnd(it);
    if (it._trIn > 0 && t < start + it._trIn) f *= Math.max(0, (t - start) / it._trIn);
    if (it._trOut > 0 && t > end - it._trOut) f *= Math.max(0, (end - t) / it._trOut);
    return f;
  }

  function clampVolume(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 1;
  }

  function clampToAsset(item, asset) {
    if (asset && asset.isImage) {
      item.duration = Math.min(MAX_IMAGE_SECONDS, item.duration);
    } else if (asset && asset.duration > 0 && item.type !== 2) {
      const room = asset.duration - (item.startTime || 0);
      if (room > MIN_CLIP) item.duration = Math.min(item.duration, room);
    }
    item.duration = Math.max(MIN_CLIP, item.duration);
    return item;
  }

  function newItemFromAsset(asset, type, timelineStartTime) {
    const image = !!asset.isImage && type === 0;
    const it = {
      id: uuid(), type,
      assetId: asset.id, mediaUrl: asset.url,
      timelineStartTime, startTime: 0, duration: image ? IMAGE_SECONDS : (asset.duration || 5),
    };
    if (image) it.isImage = true;
    else Object.assign(it, { volume: 1.0, isMuted: false });
    if (type === 0) Object.assign(it, { effect: 'none', transition: '', transitionDuration: 1.0 });
    return it;
  }

  function newTitleItem(timelineStartTime) {
    return {
      id: uuid(), type: 2, assetId: null, mediaUrl: '',
      timelineStartTime, startTime: 0, duration: 5,
      text: 'Novo título', fontSize: 36, fontColor: 'white', textPosition: 'center',
    };
  }

  function detachAudio(items, videoItemId, hasAudio = true) {
    const v = items.find(i => i.id === videoItemId);
    if (!v || v.type !== 0) throw new Error('Selecione um clipe de vídeo.');
    if (v.isImage) throw new Error('Imagens não têm áudio.');
    if (!hasAudio) throw new Error('Esse vídeo não tem faixa de áudio.');
    if (v.isMuted) throw new Error('O áudio desse clipe já foi separado/silenciado.');
    v.isMuted = true;
    const a = {
      id: uuid(), type: 1, assetId: v.assetId, mediaUrl: v.mediaUrl,
      timelineStartTime: v.timelineStartTime, startTime: v.startTime, duration: v.duration,
      volume: v.volume ?? 1.0, isMuted: false,
    };
    items.push(a);
    return a;
  }

  function cloneItem(item, timelineStartTime) {
    const c = JSON.parse(JSON.stringify(item, dropPrivate));
    c.id = uuid();
    if (timelineStartTime != null) c.timelineStartTime = Math.max(0, timelineStartTime);
    return c;
  }

  const SPLIT_MSG = {
    none: 'Selecione um clipe na timeline para dividir.',
    outside: 'Posicione o cursor sobre o clipe selecionado para dividi-lo.',
    short: 'Cada parte precisa ter pelo menos ' + MIN_CLIP.toString().replace('.', ',') + ' s.',
    transition: 'O cursor está dentro de uma transição. Mova-o um pouco para dentro do clipe.',
  };
  const round6 = (x) => Math.round(x * 1e6) / 1e6;

  function splitCheck(items, id, t) {
    const it = items.find(i => i.id === id);
    if (!it) return { ok: false, reason: 'none', message: SPLIT_MSG.none };
    const start = it.timelineStartTime, total = dur(it);
    if (!(t > start && t < start + total)) return { ok: false, reason: 'outside', message: SPLIT_MSG.outside };

    const grid = it.type === 0 ? 1 / FPS : 0.001;
    const offset = round6(Math.round((t - start) / grid) * grid);
    if (offset < MIN_CLIP || total - offset < MIN_CLIP) return { ok: false, reason: 'short', message: SPLIT_MSG.short };

    if (it.type === 0 && (offset < (it._trIn || 0) + 0.05 || total - offset < (it._trOut || 0) + 0.05))
      return { ok: false, reason: 'transition', message: SPLIT_MSG.transition };
    return { ok: true, reason: '', message: '', at: round6(start + offset), offset };
  }

  function splitItem(items, id, t) {
    layoutVideoTrack(items);
    const chk = splitCheck(items, id, t);
    if (!chk.ok) throw new Error(chk.message);
    const a = items.find(i => i.id === id);
    const total = dur(a);
    const b = cloneItem(a, chk.at);
    if (!a.isImage && a.type !== 2) b.startTime = round6((a.startTime || 0) + chk.offset);
    b.duration = round6(total - chk.offset);
    a.duration = chk.offset;
    if (b.type === 0) { b.transition = ''; }
    items.splice(items.indexOf(a) + 1, 0, b);
    return { first: a, second: b, at: chk.at };
  }

  function snapshot(project) {
    return JSON.stringify({ projectName: project.projectName, items: project.items }, dropPrivate);
  }

  function createHistory(getSnapshot, applySnapshot, limit = 100) {
    let stack = [getSnapshot()], idx = 0;
    return {
      commit() {
        const s = getSnapshot();
        if (s === stack[idx]) return false;
        stack = stack.slice(0, idx + 1);
        stack.push(s);
        if (stack.length > limit) stack.shift();
        idx = stack.length - 1;
        return true;
      },
      undo() { if (idx <= 0) return false; idx--; applySnapshot(stack[idx]); return true; },
      redo() { if (idx >= stack.length - 1) return false; idx++; applySnapshot(stack[idx]); return true; },
      reset() { stack = [getSnapshot()]; idx = 0; },
      get canUndo() { return idx > 0; },
      get canRedo() { return idx < stack.length - 1; },
    };
  }

  function serializeProject(project) {
    return JSON.stringify({ version: 1, projectName: project.projectName, items: project.items }, dropPrivate, 2);
  }

  function parseProject(input, getAsset) {
    let raw = input;

    if (typeof input === 'string') {
      try { raw = JSON.parse(input); } catch { throw new Error('Arquivo de projeto inválido.'); }
    }

    if (!raw || !Array.isArray(raw.items)) throw new Error('Arquivo de projeto inválido.');

    const num = (v, d, min = -Infinity, max = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
    const items = [];
    let missing = 0;
    for (const r of raw.items.slice(0, 500)) {
      if (!r || ![0, 1, 2].includes(r.type)) continue;
      const it = {
        id: typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : uuid(),
        type: r.type,
        assetId: null, mediaUrl: '',
        timelineStartTime: num(r.timelineStartTime, 0, 0),
        startTime: num(r.startTime, 0, 0),
        duration: num(r.duration, 5, MIN_CLIP),
      };
      if (r.type !== 2) { it.volume = clampVolume(r.volume ?? 1); it.isMuted = r.isMuted === true; }
      if (r.type === 2) {
        it.text = typeof r.text === 'string' ? r.text.slice(0, 500) : '';
        it.fontSize = num(r.fontSize, 36, 10, 200);
        it.fontColor = typeof r.fontColor === 'string' ? r.fontColor.slice(0, 16) : 'white';
        it.textPosition = POSITIONS.includes(r.textPosition) ? r.textPosition : 'center';
      } else {
        const asset = getAsset(r.assetId);
        if (!asset) { missing++; continue; }
        if ((asset.isImage && r.type !== 0) || (asset.isAudioOnly && r.type === 0)) { missing++; continue; }
        it.assetId = asset.id;
        it.mediaUrl = asset.url;
        if (asset.isImage) { it.isImage = true; delete it.volume; delete it.isMuted; }
        clampToAsset(it, asset);
        if (r.type === 0) {
          it.effect = EFFECTS.includes(r.effect) ? r.effect : 'none';
          it.transition = TRANSITIONS.includes(r.transition) ? r.transition : '';
          it.transitionDuration = num(r.transitionDuration, 1, 0.2, 5);
        }
      }
      items.push(it);
    }
    return { project: { projectName: String(raw.projectName || 'Projeto').slice(0, 80), items }, missing };
  }

  function fmtTime(t) {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60), s = t - m * 60;
    return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0');
  }

  function newSessionId() {
    const b = new Uint8Array(16);
    globalThis.crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  const SESSION_ID_RE = /^[0-9a-f]{32}$/;
  const MAX_PACKAGE_MEDIA = 500;
  const MAX_PACKAGE_HEADER = 20 * 1024 * 1024;
  const PKG_MAGIC = 'SVPROJ1\n';

  async function buildPackage(project, getMedia, onProgress = () => {}) {
    const ids = [...new Set(project.items.filter(i => i.type !== 2 && i.assetId).map(i => i.assetId))];
    const media = [], blobs = [];
    for (let n = 0; n < ids.length; n++) {
      onProgress(n, ids.length);
      const m = await getMedia(ids[n]);
      if (!m || !m.blob) continue;
      media.push({ id: ids[n], name: m.name, size: m.blob.size });
      blobs.push(m.blob);
    }
    const header = new TextEncoder().encode(
      JSON.stringify({ version: 2, projectName: project.projectName, items: project.items, media }, dropPrivate));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, header.length, true);
    return new Blob([PKG_MAGIC, len, header, ...blobs], { type: 'application/octet-stream' });
  }

  async function readPackage(file) {
    const head = new Uint8Array(await file.slice(0, PKG_MAGIC.length + 4).arrayBuffer());
    if (head.length < PKG_MAGIC.length + 4) return null;
    for (let i = 0; i < PKG_MAGIC.length; i++) if (head[i] !== PKG_MAGIC.charCodeAt(i)) return null;

    const bad = () => new Error('Arquivo de projeto inválido ou incompleto.');
    const headerLen = new DataView(head.buffer).getUint32(PKG_MAGIC.length, true);
    const bodyStart = PKG_MAGIC.length + 4;
    if (headerLen > MAX_PACKAGE_HEADER || bodyStart + headerLen > file.size) throw bad();

    let header;
    try { header = JSON.parse(new TextDecoder().decode(await file.slice(bodyStart, bodyStart + headerLen).arrayBuffer())); }
    catch { throw bad(); }
    if (!header || !Array.isArray(header.items) || !Array.isArray(header.media) || header.media.length > MAX_PACKAGE_MEDIA) throw bad();

    let offset = bodyStart + headerLen;
    const media = [];
    for (const m of header.media) {
      if (!m || !SESSION_ID_RE.test(m.id) || typeof m.name !== 'string' || !Number.isSafeInteger(m.size) || m.size < 0) throw bad();
      if (offset + m.size > file.size) throw bad();
      media.push({ id: m.id, name: m.name.slice(0, 200), blob: file.slice(offset, offset + m.size) });
      offset += m.size;
    }
    return { header, media };
  }

  async function exportProject(items, { height = 720, onProgress = () => {}, pollMs = 1000, sessionId = '' } = {}) {
    layoutVideoTrack(items);
    const res = await fetch('/Home/RenderVideo', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sand-Session': sessionId },
      body: JSON.stringify({ height, items }, dropPrivate),
    });

    if (!res.ok) throw new Error((await res.text()) || 'Não foi possível iniciar a exportação. Erro: ' + res.status);

    let jobId;
    try { ({ jobId } = await res.json()); } catch { }
    if (!jobId) throw new Error('O servidor não iniciou a exportação. Tente novamente.');

    const LOST = 'O servidor interrompeu a exportação, possívelmente ele pode ter reiniciado por falta de memória. Tente novamente. Se esse erro persistir, exporte uma timeline com menos clipes.';
    let failures = 0;

    for (;;) {
      await new Promise(r => setTimeout(r, pollMs));
      
      let s = null, status = 0;

      try {
        const r = await fetch('/Home/RenderStatus?id=' + encodeURIComponent(jobId));
        status = r.status;
        const body = await r.text();
        try { s = body ? JSON.parse(body) : null; } catch { s = null; }
      } catch { }

      if (status === 404) throw new Error(LOST);

      if (!s || status < 200 || status >= 300 || typeof s.state !== 'string') {
        if (++failures >= 5) throw new Error(LOST);
        continue;
      }

      failures = 0;

      onProgress(s.progress, s.state);
      if (s.state === 'Done') return s.url;
      if (s.state === 'Failed') throw new Error(s.error || 'Falha ao renderizar.');
    }
  }

  const api = {
    MIN_CLIP, FPS, IMAGE_SECONDS, TRANSITIONS, EFFECTS, POSITIONS,
    uuid, dur, itemEnd, layoutVideoTrack, timelineEnd, fadeFactor, clampVolume, clampToAsset,
    newItemFromAsset, newTitleItem, detachAudio, cloneItem, splitCheck, splitItem,
    snapshot, createHistory, serializeProject, parseProject, fmtTime, exportProject,
    newSessionId, buildPackage, readPackage
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EditorCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
