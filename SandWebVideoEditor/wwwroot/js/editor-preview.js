(function (root) {
  'use strict';

  const C = root.EditorCore;
  const PRELOAD = 2.0;
  const KEEP = 1.0;
  const DRIFT_PLAYING = 0.3;
  const DRIFT_PAUSED = 0.05;
  const STALL_MAX_MS = 3000;

  const CSS_FILTER = {
    none: 'none', grayscale: 'grayscale(1)', sepia: 'sepia(1)',
    bright: 'brightness(1.15) contrast(1.1)', blur: 'blur(3px)', negate: 'invert(1)',
  };

  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  class PreviewEngine {
    /**
     * @param {object} o
     * @param {HTMLElement} o.videosEl
     * @param {HTMLElement} o.titlesEl
     * @param {() => Array} o.getItems
     * @param {number} [o.outHeight=720]
     * @param {(t:number, end:number)=>void} [o.onTime]
     * @param {(playing:boolean)=>void} [o.onState]
     */
    constructor(o) {
      this.videosEl = o.videosEl;
      this.titlesEl = o.titlesEl;
      this.getItems = o.getItems;
      this.outHeight = o.outHeight || 720;
      this.onTime = o.onTime || (() => {});
      this.onState = o.onState || (() => {});

      this._t = 0;
      this._end = 0;
      this._playing = false;
      this._raf = 0;
      this._baseNow = 0;
      this._baseT = 0;
      this._stallSince = 0;
      this._primary = null;

      this._v = new Map();
      this._a = new Map();
      this._titles = new Map();
      this._ctx = null;

      this._frame = this._frame.bind(this);
    }

    get time() { return this._t; }
    get end() { return this._end; }
    get playing() { return this._playing; }

    play() {
      this.refresh(true);
      if (this._end <= 0) return;
      if (this._t >= this._end - 0.05) this._t = 0;
      this._ensureAudioCtx();
      this._playing = true;
      this._baseNow = performance.now();
      this._baseT = this._t;
      this._stallSince = 0;
      this._sync(this._t, true);
      this.onState(true);
      this._raf = requestAnimationFrame(this._frame);
    }

    pause() {
      if (!this._playing) return;
      this._playing = false;
      cancelAnimationFrame(this._raf);
      for (const r of this._v.values()) if (!r.isImg) r.el.pause();
      for (const r of this._a.values()) r.el.pause();
      this.onState(false);
    }

    toggle() { this._playing ? this.pause() : this.play(); }

    seek(t) {
      this.refresh(true);
      this._t = Math.min(this._end, Math.max(0, t));
      this._baseNow = performance.now();
      this._baseT = this._t;
      this._sync(this._t, this._playing);
      this.onTime(this._t, this._end);
    }

    refresh(silent = false) {
      this._end = C.timelineEnd(this.getItems());
      if (this._t > this._end) this._t = this._end;
      if (silent) return;
      this._baseNow = performance.now();
      this._baseT = this._t;
      this._sync(this._t, this._playing);
      this.onTime(this._t, this._end);
    }

    destroy() {
      this.pause();
      for (const id of [...this._v.keys()]) this._drop(this._v, id);
      for (const id of [...this._a.keys()]) this._drop(this._a, id);
      for (const el of this._titles.values()) el.remove();
      this._titles.clear();
      if (this._ctx) { this._ctx.close().catch(() => {}); this._ctx = null; }
    }

    debug() {
      const byId = new Map(this.getItems().map(i => [i.id, i]));
      return {
        t: this._t, end: this._end, playing: this._playing,
        videos: [...this._v].map(([id, r]) => ({ id, img: !!r.isImg, vis: r.el.style.visibility, op: r.el.style.opacity, tf: r.el.style.transform, clip: r.el.style.clipPath, filter: r.el.style.filter, t: r.el.currentTime, paused: r.el.paused, gain: r.gain ? r.gain.gain.value : r.el.volume, item: byId.get(id)?.timelineStartTime })),
        audios: [...this._a].map(([id, r]) => ({ id, t: r.el.currentTime, paused: r.el.paused, gain: r.gain ? r.gain.gain.value : r.el.volume })),
        titles: [...this._titles].map(([id, el]) => ({ id, text: el.textContent, cls: el.className, fs: el.style.fontSize, color: el.style.color })),
        audioCtx: this._ctx ? this._ctx.state : 'none',
      };
    }

    _frame(now) {
      if (!this._playing) return;
      let t = this._baseT + (now - this._baseNow) / 1000;

      const p = this._primary;
      if (p && (p.isImg ? !p.el.complete : (p.el.readyState < 2 || p.el.seeking))) {
        if (!this._stallSince) this._stallSince = now;
        if (now - this._stallSince < STALL_MAX_MS) { this._baseNow = now; this._baseT = this._t; t = this._t; }
      } else {
        this._stallSince = 0;
      }

      if (t >= this._end) {
        this._t = this._end;
        this.pause();
        this._sync(Math.max(0, this._end - 0.04), false);
        this.onTime(this._t, this._end);
        return;
      }
      this._t = t;
      this._sync(t, true);
      this.onTime(t, this._end);
      this._raf = requestAnimationFrame(this._frame);
    }

    _sync(t, playing) {
      const items = this.getItems();
      const byId = new Map(items.map(i => [i.id, i]));
      this._syncVideo(items, t, playing);
      this._syncAudio(items, byId, t, playing);
      this._syncTitles(items, t);
    }

    _syncVideo(items, t, playing) {
      const vids = items.filter(i => i.type === 0 && i.mediaUrl);
      const keep = new Set();
      const active = [];

      for (const it of vids) {
        const start = it.timelineStartTime, end = C.itemEnd(it);
        const isActive = t >= start && t < end;
        const near = isActive || (t < start && start - t <= PRELOAD) || (t >= end && t - end <= KEEP);
        if (!near) continue;
        keep.add(it.id);
        const rec = this._ensure(this._v, it, () => this._makeVideo(it), !!it.isImage);
        const base = it.startTime || 0;
        if (isActive) {
          if (!rec.isImg) this._drive(rec, base + (t - start), playing, true);
          active.push(it);
        } else if (!rec.isImg) {
          this._drive(rec, t < start ? base : Math.max(0, base + C.dur(it) - 0.05), false, false);
        }
      }
      for (const id of [...this._v.keys()]) if (!keep.has(id)) this._drop(this._v, id);

      active.sort((a, b) => a.timelineStartTime - b.timelineStartTime);
      this._primary = active.length ? this._v.get(active[active.length - 1].id) : null;
      this._styleVideos(vids, active, t);
    }

    _styleVideos(vids, active, t) {
      for (const it of vids) {
        const rec = this._v.get(it.id);
        if (!rec) continue;
        const s = rec.el.style;
        s.visibility = 'hidden'; s.opacity = '1'; s.transform = 'none'; s.clipPath = 'none';
        s.filter = CSS_FILTER[it.effect || 'none'] || 'none';
        s.zIndex = '0';
      }
      active.forEach((it, i) => {
        const s = this._v.get(it.id).el.style;
        s.visibility = 'visible';
        s.zIndex = String(i + 1);
      });

      if (active.length >= 2) {
        const out = active[active.length - 2], inc = active[active.length - 1];
        if (inc._trIn > 0) {
          const p = clamp01((t - inc.timelineStartTime) / inc._trIn);
          this._transition(this._v.get(out.id).el.style, this._v.get(inc.id).el.style, inc.transition, p);
        }
      }
    }

    _transition(o, n, type, p) {
      switch (type) {
        case 'fadeblack':
          if (p < 0.5) { o.opacity = String(1 - 2 * p); n.visibility = 'hidden'; }
          else { n.opacity = String(2 * p - 1); o.visibility = 'hidden'; }
          break;
        case 'wipeleft':   n.clipPath = `inset(0 0 0 ${(1 - p) * 100}%)`; break;
        case 'wiperight':  n.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`; break;
        case 'slideleft':  n.transform = `translateX(${(1 - p) * 100}%)`;  o.transform = `translateX(${-p * 100}%)`; break;
        case 'slideright': n.transform = `translateX(${-(1 - p) * 100}%)`; o.transform = `translateX(${p * 100}%)`; break;
        case 'circleopen': n.clipPath = `circle(${p * 75}% at 50% 50%)`; break;
        default:           n.opacity = String(p);
      }
    }

    _makeVideo(it) {
      if (it.isImage) {
        const img = document.createElement('img');
        img.className = 'stage-video stage-image';
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        img.src = it.mediaUrl;
        img.style.visibility = 'hidden';
        this.videosEl.appendChild(img);
        return img;
      }
      const el = document.createElement('video');
      el.className = 'stage-video';
      el.preload = 'auto';
      el.playsInline = true;
      el.src = it.mediaUrl;
      el.style.visibility = 'hidden';
      this.videosEl.appendChild(el);
      return el;
    }

    _syncAudio(items, byId, t, playing) {
      for (const [id, rec] of this._v) {
        if (rec.isImg) continue;
        const it = byId.get(id);
        const on = it && t >= it.timelineStartTime && t < C.itemEnd(it);
        this._setGain(rec, on && !it.isMuted ? C.clampVolume(it.volume ?? 1) * C.fadeFactor(it, t) : 0);
      }

      const keep = new Set();
      for (const it of items) {
        if (it.type !== 1 || !it.mediaUrl) continue;
        const start = it.timelineStartTime, end = C.itemEnd(it);
        const isActive = t >= start && t < end;
        const near = isActive || (t < start && start - t <= PRELOAD);
        if (!near) continue;
        keep.add(it.id);
        const rec = this._ensure(this._a, it, () => {
          const el = new Audio();
          el.preload = 'auto';
          el.src = it.mediaUrl;
          return el;
        });
        const base = it.startTime || 0;
        if (isActive) this._drive(rec, base + (t - start), playing, true);
        else this._drive(rec, base, false, false);
        this._setGain(rec, isActive && !it.isMuted ? C.clampVolume(it.volume ?? 1) : 0);
      }
      for (const id of [...this._a.keys()]) if (!keep.has(id)) this._drop(this._a, id);
    }

    _ensureAudioCtx() {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      if (!this._ctx) {
        try { this._ctx = new AC(); } catch { return; }
        for (const r of this._v.values()) this._attachGain(r);
        for (const r of this._a.values()) this._attachGain(r);
      }
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
    }

    _attachGain(rec) {
      if (!this._ctx || rec.gain || rec.isImg) return;
      try {
        rec.node = this._ctx.createMediaElementSource(rec.el);
        rec.gain = this._ctx.createGain();
        rec.node.connect(rec.gain).connect(this._ctx.destination);
        rec.el.volume = 1;
      } catch { rec.gain = null; }
    }

    _setGain(rec, g) {
      if (rec.gain) rec.gain.gain.value = g;
      else rec.el.volume = Math.min(1, Math.max(0, g));
    }

    _ensure(map, it, make, isImg = false) {
      let rec = map.get(it.id);
      if (rec && rec.url === it.mediaUrl && rec.isImg === isImg) return rec;
      if (rec) this._drop(map, it.id);
      rec = { el: make(), url: it.mediaUrl, gain: null, node: null, isImg };
      this._attachGain(rec);
      map.set(it.id, rec);
      return rec;
    }

    _drop(map, id) {
      const rec = map.get(id);
      if (!rec) return;
      if (!rec.isImg) rec.el.pause();
      try { rec.node && rec.node.disconnect(); rec.gain && rec.gain.disconnect(); } catch { }
      rec.el.removeAttribute('src');
      if (!rec.isImg) rec.el.load();
      rec.el.remove();
      map.delete(id);
    }

    _drive(rec, target, playing, isActive) {
      const el = rec.el;
      const tol = playing ? DRIFT_PLAYING : DRIFT_PAUSED;
      if (Math.abs(el.currentTime - target) > tol) { try { el.currentTime = target; } catch { } }
      if (playing && isActive) { if (el.paused) el.play().catch(() => {}); }
      else if (!el.paused) el.pause();
    }

    _syncTitles(items, t) {
      const h = this.titlesEl.clientHeight;
      const scale = h > 0 ? h / this.outHeight : 0.5;
      const keep = new Set();
      for (const it of items) {
        if (it.type !== 2 || !(it.text || '').trim()) continue;
        if (!(t >= it.timelineStartTime && t < C.itemEnd(it))) continue;
        keep.add(it.id);
        let el = this._titles.get(it.id);
        if (!el) { el = document.createElement('div'); this._titles.set(it.id, el); this.titlesEl.appendChild(el); }
        el.className = 'stage-title title-' + (C.POSITIONS.includes(it.textPosition) ? it.textPosition : 'center');
        if (el.textContent !== it.text) el.textContent = it.text;
        el.style.fontSize = Math.max(8, (it.fontSize || 36) * scale) + 'px';
        el.style.color = it.fontColor || 'white';
      }
      for (const [id, el] of [...this._titles]) if (!keep.has(id)) { el.remove(); this._titles.delete(id); }
    }
  }

  const api = { PreviewEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EditorPreview = api;
})(typeof window !== 'undefined' ? window : globalThis);
