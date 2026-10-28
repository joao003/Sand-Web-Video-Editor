(function () {
  'use strict';

  const C = window.EditorCore;
  const $ = (id) => document.getElementById(id);
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const snap01 = (x) => Math.round(x * 10) / 10;

  const state = {
    project: { projectName: 'Novo Projeto', items: [] },
    selectedId: null,
    media: new Map(),
    clipboard: null,
    pps: 20,
  };

  const SID = C.newSessionId();
  const api = (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers || {}), 'X-Sand-Session': SID}});
  let mediaOps = 0;

  const items = () => state.project.items;
  const byId = (id) => items().find(i => i.id === id);
  const selected = () => byId(state.selectedId);
  const assetOf = (it) => state.media.get(it.assetId);

  const history = C.createHistory(
    () => C.snapshot(state.project),
    (snap) => {
      const o = JSON.parse(snap);
      state.project.projectName = o.projectName;
      state.project.items = o.items;
      if (!byId(state.selectedId)) state.selectedId = null;
      refreshAll();
    });

  function commit() { history.commit(); updateUi(); }

  function edit(fn) { fn(); refreshAll(); commit(); }
  function refreshAll() { C.layoutVideoTrack(items()); renderTimeline(); renderProperties(); preview.refresh(); updateUi(); }

  const preview = new window.EditorPreview.PreviewEngine({
    videosEl: $('stageVideos'),
    titlesEl: $('stageTitles'),
    getItems: items,
    outHeight: 720,
    onTime: onTime,
    onState: (playing) => { $('btnPlay').innerHTML = playing ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pause-fill" viewBox="0 0 16 16">
  <path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5m5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5"/>
</svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-fill" viewBox="0 0 16 16">
  <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393"/>
</svg>`; $('btnPlay').setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir'); wakeControls(); },
  });

  function onTime(t, end) {
    $('timeLabel').textContent = C.fmtTime(t) + ' / ' + C.fmtTime(end);
    const seek = $('seekBar');
    if (!seek.matches(':active')) seek.value = end > 0 ? Math.round((t / end) * 1000) : 0;
    const x = t * state.pps;
    $('playhead').style.left = x + 'px';
    if (preview.playing) {
      const sc = $('timelineScroll');
      if (x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - 40;
      else if (x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 40);
    }
    updateSplitState();
  }

  async function loadMedia() {
    try {
      const list = await (await api('/Home/Media')).json();
      state.media = new Map(list.map(a => [a.id, a]));
    } catch { notify('Não foi possível carregar a coleção de mídias.', 'danger'); }
    renderMediaList();
  }

  function renderMediaList() {
    const box = $('mediaList');
    box.replaceChildren();
    for (const a of state.media.values()) {
      const card = document.createElement('div');
      card.className = 'card p-1 shadow-sm media-card';
      card.style.width = '100px';
      card.dataset.asset = a.id;

      let thumb;
      if (a.thumbUrl) {
        thumb = document.createElement('img');
        thumb.src = a.thumbUrl; thumb.alt = ''; thumb.className = 'card-img-top';
        thumb.style.cssText = 'height:50px;object-fit:cover';
      } else {
        thumb = document.createElement('div');
        thumb.className = 'audio-thumb'; thumb.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-music-note-beamed" viewBox="0 0 16 16">
  <path d="M6 13c0 1.105-1.12 2-2.5 2S1 14.105 1 13s1.12-2 2.5-2 2.5.896 2.5 2m9-2c0 1.105-1.12 2-2.5 2s-2.5-.895-2.5-2 1.12-2 2.5-2 2.5.895 2.5 2"/>
  <path fill-rule="evenodd" d="M14 11V2h1v9zM6 3v10H5V3z"/>
  <path d="M5 2.905a1 1 0 0 1 .9-.995l8-.8a1 1 0 0 1 1.1.995V3L5 4z"/>
</svg>`;
      }

      const body = document.createElement('div');
      body.className = 'card-body p-1 text-center';
      const name = document.createElement('small');
      name.className = 'text-truncate d-block'; name.title = a.originalName; name.textContent = a.originalName;
      const dur = document.createElement('small');
      dur.className = 'text-muted d-block'; dur.innerHTML = a.isImage ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-image" viewBox="0 0 16 16">
  <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/>
  <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1z"/>
</svg> Imagem` : C.fmtTime(a.duration);
      const row = document.createElement('div');
      row.className = 'd-flex gap-1 mt-1';
      const del = document.createElement('button');
      del.className = 'btn btn-sm btn-outline-danger'; del.textContent = '×'; del.title = 'Remover da coleção';
      del.dataset.del = a.id;

      if (a.isAudioOnly) {
        const group = document.createElement('div');
        group.className = 'dropdown flex-grow-1 d-flex';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn btn-sm btn-primary flex-grow-1 dropdown-toggle';
        toggle.textContent = '+'; toggle.title = 'Adicionar à timeline';
        toggle.setAttribute('data-bs-toggle', 'dropdown');
        toggle.setAttribute('data-bs-popper-config', '{"strategy":"fixed"}');
        toggle.setAttribute('aria-expanded', 'false');
        const menu = document.createElement('ul');
        menu.className = 'dropdown-menu';
        menu.setAttribute('data-bs-theme', 'dark');
        for (const [track, label] of [[0, 'Primeira Trilha de Áudio/Música'], [1, 'Segunda Trilha de Áudio/Música']]) {
          const li = document.createElement('li');
          const item = document.createElement('button');
          item.type = 'button'; item.className = 'dropdown-item small'; item.textContent = label;
          item.dataset.addAudio = a.id; item.dataset.track = String(track);
          li.appendChild(item); menu.appendChild(li);
        }
        group.append(toggle, menu);
        row.append(group, del);
      } else {
        const add = document.createElement('button');
        add.className = 'btn btn-sm btn-primary flex-grow-1'; add.textContent = '+'; add.title = 'Adicionar à timeline';
        add.dataset.add = a.id;
        row.append(add, del);
      }

      body.append(name, dur, row);
      card.append(thumb, body);
      box.appendChild(card);
    }
  }

  async function uploadOne(file, restoreId) {
    const fd = new FormData();
    fd.append('file', file);
    if (restoreId) fd.append('restoreId', restoreId);
    const res = await api('/Home/UploadMedia', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await res.text());
    const a = await res.json();
    state.media.set(a.id, a);
    renderMediaList();
    return a;
  }


  async function uploadFiles(files, addToTimeline = false) {
    const status = $('uploadStatus');

    mediaOps++;

    try {
      for (const file of files) {
        status.textContent = 'Enviando ' + file.name + '...';
        try {
          const a = await uploadOne(file);
          if (addToTimeline) addAssetToTimeline(a);
        } catch (err) { notify('Falha ao enviar "' + file.name + '": ' + err.message, 'danger'); }
      }
    } finally { mediaOps--; }

    status.textContent = '';
    $('mediaUpload').value = '';
  }

  async function deleteAsset(id) {
    const used = items().filter(i => i.assetId === id);
    if (used.length && !confirm('Esta mídia é usada em ' + used.length + ' clipe(s) da timeline. Remover tudo?')) return;
    
    mediaOps++;
    
    try {
      const res = await api('/Home/DeleteMedia?id=' + encodeURIComponent(id), { method: 'POST' });
      if (!res.ok && res.status !== 404) { notify('Não foi possível remover a mídia.', 'danger'); return; }
      state.media.delete(id);
    } finally { mediaOps--; }

    renderMediaList();
    if (used.length) edit(() => { state.project.items = items().filter(i => i.assetId !== id); if (!byId(state.selectedId)) state.selectedId = null; });
  }

  function addAssetToTimeline(asset, audioTrack = 0) {
    const type = asset.isAudioOnly ? 1 : 0;
    const same = items().filter(i => i.type === type && (type !== 1 || C.audioTrackOf(i) === audioTrack));
    const start = same.length ? Math.max(...same.map(C.itemEnd)) : 0;
    const it = C.clampToAsset(C.newItemFromAsset(asset, type, start, audioTrack), asset);
    edit(() => { items().push(it); state.selectedId = it.id; });
  }

  function addTitle() {
    const it = C.newTitleItem(snap01(preview.time));
    edit(() => { items().push(it); state.selectedId = it.id; });
  }

  const TRACK_BG = ['bg-success', 'bg-primary', 'bg-black'];
  const bgOf = (it) => (it.type === 1 && C.audioTrackOf(it) === 1 ? 'bg-audio-2' : TRACK_BG[it.type]);
  const trackElOf = (it) => $(it.type === 1 ? (C.audioTrackOf(it) === 1 ? 'trackAudio2' : 'trackAudio') : ['trackVideo', '', 'trackText'][it.type]);


  function itemLabel(it) {
    if (it.type === 2) return '"' + (it.text || '') + '"';
    const a = assetOf(it);
    return (it.isImage ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-image" viewBox="0 0 16 16">
  <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/>
  <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1z"/>
</svg>` : '') + (it.isMuted ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-volume-mute-fill" viewBox="0 0 16 16">
  <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06m7.137 2.096a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0"/>
</svg>` : '') + (a ? a.originalName : '(mídia removida)');
  }

  function renderTimeline() {
    const pps = state.pps;
    const visible = Math.max(60, Math.ceil(preview.end) + 20);
    $('timelineInner').style.width = visible * pps + 'px';

    const ruler = $('ruler');
    ruler.replaceChildren();
    const step = [1, 2, 5, 10, 30, 60, 120].find(s => s * pps >= 60) || 120;
    for (let s = 0; s <= visible; s += step) {
      const tick = document.createElement('span');
      tick.className = 'ruler-tick';
      tick.style.left = s * pps + 'px';
      tick.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      ruler.appendChild(tick);
    }

    ['trackVideo', 'trackAudio', 'trackAudio2', 'trackText'].forEach(id => $(id).replaceChildren());

    for (const it of items()) {
      const clip = document.createElement('div');
      clip.className = 'timeline-item ' + bgOf(it) + (it.id === state.selectedId ? ' selected' : '') + (it.isMuted && it.type !== 2 ? ' is-muted' : '') + (it.isImage ? ' is-image' : '');
      clip.dataset.id = it.id;
      clip.style.left = it.timelineStartTime * pps + 'px';
      clip.style.width = C.dur(it) * pps + 'px';

      if (it.type === 0 && it._trIn > 0) {
        const mark = document.createElement('div');
        mark.className = 'tr-mark';
        mark.style.width = it._trIn * pps + 'px';
        mark.title = 'Transição: ' + it.transition + ' (' + it._trIn.toFixed(1) + ' s)';
        clip.appendChild(mark);
      }

      const label = document.createElement('span');
      label.className = 'text-truncate me-1';
      label.innerHTML = itemLabel(it);
      const close = document.createElement('button');
      close.className = 'btn-close btn-sm' + (it.type === 2 ? '' : ' btn-close-white');
      close.dataset.remove = it.id;
      close.setAttribute('aria-label', 'Remover clipe');
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      clip.append(label, close, handle);
      trackElOf(it).appendChild(clip);
    }
    $('playhead').style.left = preview.time * pps + 'px';
  }

  let drag = null;

  function timeAtMouse(e) {
    const r = $('timelineInner').getBoundingClientRect();
    return Math.max(0, (e.clientX - r.left) / state.pps);
  }

  function onTimelineDown(e) {
    if (e.button !== 0 || e.target.closest('[data-remove]')) return;
    const clipEl = e.target.closest('.timeline-item');

    if (!clipEl) {
      if (!e.target.closest('.ruler')) state.selectedId = null;
      preview.seek(timeAtMouse(e));
      drag = { mode: 'scrub' };
      renderTimeline(); renderProperties();
    } else {
      const it = byId(clipEl.dataset.id);
      state.selectedId = it.id;
      drag = {
        mode: e.target.classList.contains('resize-handle') ? 'resize' : 'move',
        id: it.id, startX: e.clientX, origStart: it.timelineStartTime, origDur: it.duration,
      };
      renderTimeline(); renderProperties();
    }
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  function audioTrackAtY(y, current) {
    const a = $('trackAudio').getBoundingClientRect(), b = $('trackAudio2').getBoundingClientRect();
    if (!a.height || !b.height) return current;
    return y >= (a.bottom + b.top) / 2 ? 1 : 0;
  }


  function onDragMove(e) {
    if (!drag) return;
    if (drag.mode === 'scrub') { preview.seek(timeAtMouse(e)); return; }
    const it = byId(drag.id);
    if (!it) return;
    const dt = (e.clientX - drag.startX) / state.pps;

    if (drag.mode === 'move') {
      if (it.type === 0) it._dragKey = drag.origStart + dt;
      else it.timelineStartTime = Math.max(0, snap01(drag.origStart + dt));
      if (it.type === 1) it.audioTrack = audioTrackAtY(e.clientY, C.audioTrackOf(it));
    } else {
      it.duration = Math.max(C.MIN_CLIP, snap01(drag.origDur + dt));
      C.clampToAsset(it, assetOf(it));
    }
    refreshAll();
  }

  function onDragEnd() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    if (drag && drag.id) { const it = byId(drag.id); if (it) delete it._dragKey; refreshAll(); commit(); }
    drag = null;
  }

  const PANELS = { 0: ['panelVideo', 'panelVolume'], 1: ['panelAudioTrack', 'panelVolume'], 2: ['panelText'] };

  function setVal(id, v) { const el = $(id); if (document.activeElement !== el) el.value = v; }

  function renderProperties() {
    const it = selected();
    $('clipProperties').classList.toggle('d-none', !it);
    $('noSelectionMsg').classList.toggle('d-none', !!it);
    if (!it) return;

    ['panelVideo', 'panelVolume', 'panelText'].forEach(p => $(p).classList.add('d-none'));
    (it.isImage ? ['panelVideo'] : PANELS[it.type]).forEach(p => $(p).classList.remove('d-none'));

    setVal('propTimelineStart', Math.round(it.timelineStartTime * 100) / 100);
    $('propTimelineStart').disabled = it.type === 0;
    setVal('propDuration', Math.round(it.duration * 100) / 100);

    if (it.type === 1) setVal('propAudioTrack', C.audioTrackOf(it));
    if (it.type !== 2 && !it.isImage) {
      setVal('propVolume', it.volume ?? 1);
      $('lblVolume').textContent = Math.round((it.volume ?? 1) * 100) + '%';
      $('propMute').checked = !!it.isMuted;
    }
    if (it.type === 0) {
      setVal('propEffect', it.effect || 'none');
      const first = items().filter(i => i.type === 0).sort((a, b) => a.timelineStartTime - b.timelineStartTime)[0] === it;
      $('propTransition').disabled = first;
      $('propTransitionDur').disabled = first || !it.transition;
      setVal('propTransition', first ? '' : (it.transition || ''));
      setVal('propTransitionDur', it.transitionDuration ?? 1);
      $('lblTransitionDur').textContent = (it.transitionDuration ?? 1).toFixed(1) + ' s';
      $('btnDetach').classList.toggle('d-none', !!it.isImage);
      $('btnDetach').disabled = it.isMuted || !(assetOf(it) && assetOf(it).hasAudio);
    }
    if (it.type === 2) {
      setVal('propText', it.text || '');
      setVal('propFontSize', it.fontSize || 36);
      setVal('propFontColor', it.fontColor || 'white');
      setVal('propTextPos', it.textPosition || 'center');
    }
  }

  function onPropInput(e) {
    const it = selected();
    if (!it) return;
    const v = e.target.value;
    switch (e.target.id) {
      case 'propTimelineStart': if (it.type !== 0) it.timelineStartTime = Math.max(0, num(v, 0)); break;
      case 'propDuration': it.duration = Math.max(C.MIN_CLIP, num(v, it.duration)); C.clampToAsset(it, assetOf(it)); break;
      case 'propAudioTrack': if (it.type === 1) it.audioTrack = v === '1' ? 1 : 0; break;
      case 'propVolume': it.volume = C.clampVolume(v); break;
      case 'propMute': it.isMuted = e.target.checked; break;
      case 'propEffect': it.effect = v; break;
      case 'propTransition': it.transition = v; break;
      case 'propTransitionDur': it.transitionDuration = Math.min(5, Math.max(0.2, num(v, 1))); break;
      case 'propText': it.text = v; break;
      case 'propFontSize': it.fontSize = Math.min(200, Math.max(10, Math.round(num(v, 36)))); break;
      case 'propFontColor': it.fontColor = v; break;
      case 'propTextPos': it.textPosition = v; break;
      default: return;
    }
    refreshAll();
  }

  function detachSelected() {
    const it = selected();
    if (!it) return;
    try {
      edit(() => { C.detachAudio(items(), it.id, !!(assetOf(it) && assetOf(it).hasAudio)); });
      notify('Áudio separado: agora ele é um clipe na primeira trilha de Áudio/Música.', 'success');
    } catch (err) { notify(err.message, 'warning'); }
  }

  let splitKey = null;

  function updateSplitState() {
    const chk = C.splitCheck(items(), state.selectedId, preview.time);
    const key = chk.ok ? 'ok' : chk.message;
    if (key === splitKey) return;
    splitKey = key;
    const btn = $('btnSplit');
    btn.classList.toggle('is-inactive', !chk.ok);
    btn.title = chk.ok ? 'Dividir o clipe selecionado no cursor (S)' : chk.message;
  }

  function splitSelected() {
    const chk = C.splitCheck(items(), state.selectedId, preview.time);
    if (!chk.ok) { notify(chk.message, 'warning'); return; }
    try {
      let r;
      edit(() => { r = C.splitItem(items(), state.selectedId, preview.time); });
      notify('Clipe dividido em ' + C.fmtTime(r.at) + '.', 'success');
    } catch (err) { notify(err.message, 'warning'); }
  }

  const nativeFs = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const isFullscreen = () => nativeFs() === $('player') || $('player').classList.contains('is-pseudo-fs');
  let idleTimer = 0;

  function wakeControls() {
    const p = $('player');
    p.classList.remove('fs-idle');
    clearTimeout(idleTimer);
    if (p.classList.contains('is-fs')) idleTimer = setTimeout(() => { if (preview.playing) p.classList.add('fs-idle'); }, 2500);
  }

  function syncFullscreenUi() {
    const p = $('player'), on = isFullscreen();
    p.classList.toggle('is-fs', on);
    document.body.classList.toggle('fs-lock', on);
    $('btnFullscreen').setAttribute('aria-label', on ? 'Sair da tela cheia' : 'Tela cheia');
    $('btnFullscreen').title = on ? 'Sair da tela cheia (F ou Esc)' : 'Tela cheia (F)';
    wakeControls();
  }

  function enterFullscreen() {
    const p = $('player');
    const req = p.requestFullscreen || p.webkitRequestFullscreen;
    const fallback = () => { p.classList.add('is-pseudo-fs'); syncFullscreenUi(); };
    if (!req) { fallback(); return; }
    try {
      const r = req.call(p);
      if (r && r.catch) r.catch(fallback);
    } catch { fallback(); }
  }

  function exitFullscreen() {
    const p = $('player');
    p.classList.remove('is-pseudo-fs');
    if (nativeFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    syncFullscreenUi();
  }

  function toggleFullscreen() { isFullscreen() ? exitFullscreen() : enterFullscreen(); }

  function removeSelected() {
    const it = selected();
    if (!it) return;
    edit(() => { state.project.items = items().filter(i => i.id !== it.id); state.selectedId = null; });
  }
  function copySelected() { const it = selected(); if (it) state.clipboard = JSON.stringify(it, (k, v) => (k.startsWith('_') ? undefined : v)); return !!it; }
  function cutSelected() { if (copySelected()) removeSelected(); }
  function pasteClipboard() {
    if (!state.clipboard) return;
    const src = JSON.parse(state.clipboard);
    if (src.type !== 2 && !state.media.has(src.assetId)) { notify('A mídia desse clipe não existe mais.', 'warning'); return; }
    const c = C.cloneItem(src, snap01(preview.time));
    edit(() => { items().push(c); state.selectedId = c.id; });
  }

  let savedSnap = '';
  const markSaved = () => { savedSnap = C.snapshot(state.project); };
  const isDirty = () => items().length > 0 && C.snapshot(state.project) !== savedSnap;

  function newProject() {
    if (items().length && !confirm('Descartar o projeto atual? (dá para desfazer com Ctrl+Z)')) return;
    preview.pause();
    edit(() => { state.project.projectName = 'Novo Projeto'; state.project.items = []; state.selectedId = null; });
    preview.seek(0);
    markSaved();
  }

  let packaging = false;

  async function saveProject() {
    if (packaging) return;

    const name = prompt('Nome do projeto:', state.project.projectName);
    if (name === null) return;
    state.project.projectName = name.trim() || 'Projeto';
    packaging = true;
    const status = $('uploadStatus');
    let skipped = 0;
    try {
      const blob = await C.buildPackage(state.project, async (id) => {
        const asset = state.media.get(id);
        if (!asset) { skipped++; return null; }
        try {
          const res = await fetch(asset.url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return { name: asset.originalName, blob: await res.blob() };
        } catch { skipped++; return null; }
      }, (n, total) => { status.textContent = 'Empacotando mídias (' + (n + 1) + '/' + total + ')...'; });

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = state.project.projectName.replace(/[^\w\- ]+/g, '_') + '.vproj';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      markSaved();
      if (skipped) notify(skipped + ' mídia(s) não puderam ser incluídas no arquivo do projeto.', 'warning');
    } catch (err) {
      notify('Não foi possível salvar o projeto: ' + err.message, 'danger');
    } finally {
      packaging = false;
      status.textContent = '';
      updateUi();
    }
  }

  async function openProjectFile(file) {
    if (!file) return;
    const status = $('uploadStatus');
    mediaOps++;
    try {
      preview.pause();
      const pkg = await C.readPackage(file);
      let raw, failed = 0;
      if (pkg) {
        raw = pkg.header;
        for (let n = 0; n < pkg.media.length; n++) {
          const m = pkg.media[n];
          if (state.media.has(m.id)) continue;
          status.textContent = 'Restaurando mídia ' + (n + 1) + '/' + pkg.media.length + ': ' + m.name;
          try { await uploadOne(new File([m.blob], m.name), m.id); } catch { failed++; }
        }
      } else raw = await file.text();

      const { project, missing } = C.parseProject(raw, id => state.media.get(id));
      edit(() => { state.project.projectName = project.projectName; state.project.items = project.items; state.selectedId = null; });
      preview.seek(0);
      markSaved();
      if (failed) notify(failed + ' mídia(s) do projeto não puderam ser restauradas; os clipes delas foram ignorados.', 'warning');
      else if (missing) notify(missing + ' clipe(s) foram ignorados porque a mídia não existe nesta coleção.', 'warning');
    } catch (err) { notify(err.message, 'danger'); }
    finally { mediaOps--; status.textContent = ''; }
    $('fileProjectInput').value = '';
  }

  function openExport() {
    preview.pause();
    $('exportResult').classList.add('d-none');
    $('exportError').classList.add('d-none');
    $('exportProgress').classList.add('d-none');
    $('btnStartExport').disabled = false;
    bootstrap.Modal.getOrCreateInstance($('exportModal')).show();
  }

  async function startExport() {
    const hasMedia = items().some(i => i.type !== 2);
    if (!hasMedia) { showExportError('Adicione ao menos um vídeo ou áudio à timeline.'); return; }
    $('btnStartExport').disabled = true;
    $('exportError').classList.add('d-none');
    $('exportResult').classList.add('d-none');
    const bar = $('exportBar');
    $('exportProgress').classList.remove('d-none');
    bar.style.width = '0%'; bar.textContent = 'Na fila...';
    try {
      const url = await C.exportProject(items(), {
        height: parseInt($('exportHeight').value, 10),
        sessionId: SID,
        onProgress: (p, st) => { bar.style.width = p + '%'; bar.textContent = st === 'Queued' ? 'Na fila...' : Math.round(p) + '%'; },
      });
      bar.style.width = '100%'; bar.textContent = '100%';
      $('exportVideo').src = url;
      $('exportDownload').href = url + (url.includes('?') ? '&' : '?') + 'attachment=true';
      $('exportResult').classList.remove('d-none');
    } catch (err) { showExportError(err.message); }
    $('btnStartExport').disabled = false;
  }

  function showExportError(msg) { const e = $('exportError'); e.textContent = msg; e.classList.remove('d-none'); $('btnStartExport').disabled = false; }

  let toastTimer = 0;
  function notify(msg, kind = 'info') {
    const t = $('toast');
    t.className = 'alert alert-' + kind + ' shadow';
    t.textContent = msg;
    t.classList.remove('d-none');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('d-none'), 4000);
  }

  function updateUi() {
    $('projectNameDisplay').textContent = state.project.projectName;
    document.querySelector('[data-action="desfazer"]').classList.toggle('disabled', !history.canUndo);
    document.querySelector('[data-action="refazer"]').classList.toggle('disabled', !history.canRedo);
    $('stageEmpty').classList.toggle('d-none', items().length > 0);
    updateSplitState();
  }

  const ACTIONS = {
    novoProjeto: newProject,
    abrirProjeto: () => $('fileProjectInput').click(),
    salvarProjeto: saveProject,
    exportarVideo: openExport,
    desfazer: () => { preview.pause(); history.undo(); updateUi(); },
    refazer: () => { preview.pause(); history.redo(); updateUi(); },
    copiarItem: copySelected,
    colarItem: pasteClipboard,
    recortarItem: cutSelected,
    excluirItem: removeSelected,
    adicionarTitulo: addTitle,
    importarImagem: () => $('imageUpload').click(),
    dividirItem: splitSelected,
    telaCheia: toggleFullscreen,
    separarAudio: detachSelected,
    iniciarExportacao: startExport,
  };

  function isTyping(e) {
    const tag = e.target.tagName, type = e.target.type;
    return tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox', 'file'].includes(type));
  }

  const spaceIsNative = (e) => !!(e.target.closest && e.target.closest('button, a[href], summary, input[type="checkbox"]'));

  function onKeyDown(e) {
    if (isTyping(e)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    let handled = true;
    if (e.key === 'Escape' && $('player').classList.contains('is-pseudo-fs')) exitFullscreen();
    else if (!mod && !e.altKey && k === 's') ACTIONS.dividirItem();
    else if (!mod && !e.altKey && k === 'f') ACTIONS.telaCheia();
    else if (mod && k === 'z' && !e.shiftKey) ACTIONS.desfazer();
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) ACTIONS.refazer();
    else if (mod && k === 'c') ACTIONS.copiarItem();
    else if (mod && k === 'v') ACTIONS.colarItem();
    else if (mod && k === 'x') ACTIONS.recortarItem();
    else if (!mod && e.key === 'Delete') ACTIONS.excluirItem();
    else if (!mod && e.key === ' ') { if (spaceIsNative(e)) return; preview.toggle(); }
    else if (!mod && e.key === 'Home') preview.seek(0);
    else if (!mod && e.key === 'ArrowLeft') preview.seek(preview.time - 0.5);
    else if (!mod && e.key === 'ArrowRight') preview.seek(preview.time + 0.5);
    else handled = false;
    if (handled) e.preventDefault();
  }

  function init() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && e.detail > 0 && !b.closest('.modal') && !b.hasAttribute('data-bs-toggle')) b.blur();
      const a = e.target.closest('[data-action]');
      if (a) { e.preventDefault(); if (!a.classList.contains('disabled')) ACTIONS[a.dataset.action]?.(); return; }
      const addAudio = e.target.closest('[data-add-audio]');
      if (addAudio) { const asset = state.media.get(addAudio.dataset.addAudio); if (asset) addAssetToTimeline(asset, addAudio.dataset.track === '1' ? 1 : 0); return; }
      const add = e.target.closest('[data-add]');
      if (add) { const asset = state.media.get(add.dataset.add); if (asset) addAssetToTimeline(asset); return; }
      const delAsset = e.target.closest('.media-card [data-del]');
      if (delAsset) { deleteAsset(delAsset.dataset.del); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) { e.stopPropagation(); edit(() => { state.project.items = items().filter(i => i.id !== rm.dataset.remove); if (!byId(state.selectedId)) state.selectedId = null; }); }
    });

    $('mediaUpload').addEventListener('change', (e) => uploadFiles([...e.target.files]));
    $('imageUpload').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; uploadFiles(files, true); });

    const tl = $('timelineScroll');
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    tl.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); tl.classList.add('drop-target'); } });
    tl.addEventListener('dragleave', () => tl.classList.remove('drop-target'));
    tl.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); tl.classList.remove('drop-target');
      uploadFiles([...e.dataTransfer.files], true);
    });

    let clickTimer = 0;
    $('stage').addEventListener('click', () => { clearTimeout(clickTimer); clickTimer = setTimeout(() => preview.toggle(), 220); });
    $('stage').addEventListener('dblclick', () => { clearTimeout(clickTimer); toggleFullscreen(); });
    for (const ev of ['mousemove', 'pointerdown', 'touchstart']) $('player').addEventListener(ev, wakeControls, { passive: true });
    document.addEventListener('fullscreenchange', syncFullscreenUi);
    document.addEventListener('webkitfullscreenchange', syncFullscreenUi);

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (!preview.playing) preview.refresh(); }).observe($('stage'));
    $('fileProjectInput').addEventListener('change', (e) => openProjectFile(e.target.files[0]));
    $('timelineInner').addEventListener('mousedown', onTimelineDown);
    $('clipProperties').addEventListener('input', onPropInput);
    $('clipProperties').addEventListener('change', commit);
    $('btnPlay').addEventListener('click', () => preview.toggle());
    $('btnStart').addEventListener('click', () => preview.seek(0));
    $('seekBar').addEventListener('input', (e) => preview.seek((e.target.value / 1000) * preview.end));
    $('zoomRange').addEventListener('input', (e) => { state.pps = parseInt(e.target.value, 10); renderTimeline(); onTime(preview.time, preview.end); });
    document.addEventListener('keydown', onKeyDown);

    document.addEventListener('keyup', (e) => { if (e.key === ' ' && !isTyping(e) && !spaceIsNative(e)) e.preventDefault(); });

    window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('pagehide', (e) => { if (!e.persisted) endSession(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) { heartbeat(); loadMedia(); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') heartbeat(); });
    setInterval(heartbeat, 60000);

    refreshAll();
    markSaved();
    loadMedia();
  }

  function endSession() {
    const url = '/Home/EndSession?sid=' + SID;
    try { if (navigator.sendBeacon && navigator.sendBeacon(url)) return; } catch { }
    try { fetch(url, { method: 'POST', keepalive: true }); } catch { }
  }

  async function heartbeat() {
    try {
      const res = await api('/Home/Ping', { method: 'POST' });
      if (!res.ok) return;
      const { count } = await res.json();
      if (count === 0 && state.media.size > 0 && mediaOps === 0) {
        await loadMedia();
        notify('As mídias expiraram no servidor por inatividade. Abra o projeto salvo para restaurá-las.', 'warning');
      }
    } catch { }
  }


  window.Editor = { state, history, preview, actions: ACTIONS, refreshAll, edit, addAssetToTimeline, addTitle, splitSelected, toggleFullscreen };
  init();
})();
