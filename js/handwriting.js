// 手書きパッド。ストロークは正規化座標(0–1)で保持し、端末幅が変わっても再描画できる。
// stroke = { tool:'pen'|'eraser', color, width(0–1 of canvas width), points:[[x,y,pressure]] }
import { BODY_CHARTS } from './templates.js';

export class HandwritingPad {
  constructor(container, opts = {}) {
    this.container = container;
    this.onChange = opts.onChange || (() => {});
    this.tool = 'pen';
    this.color = opts.color || '#1f2937';
    this.width = opts.width || 3; // px 基準（内部で正規化）
    this.strokes = [];
    this.redoStack = [];
    this.bg = null;
    this._drawing = null;
    this._raf = null;

    this.wrap = document.createElement('div');
    this.wrap.className = 'pad-wrap';
    this.bgLayer = document.createElement('div');
    this.bgLayer.className = 'pad-bg';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pad-canvas';
    this.wrap.append(this.bgLayer, this.canvas);
    this.container.append(this.wrap);

    this.ctx = this.canvas.getContext('2d');
    this._bindPointer();

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.wrap);
    requestAnimationFrame(() => this._resize());
  }

  destroy() {
    this._ro.disconnect();
  }

  load(strokes, bg) {
    this.strokes = Array.isArray(strokes) ? strokes.map((s) => ({ ...s, points: s.points.slice() })) : [];
    this.redoStack = [];
    this.setBackground(bg || null);
    this._resize();
  }

  setBackground(bg) {
    this.bg = bg;
    const svg = bg && BODY_CHARTS[bg];
    this.bgLayer.innerHTML = svg || '';
    this.bgLayer.style.display = svg ? 'block' : 'none';
  }

  setTool(t) { this.tool = t; }
  setColor(c) { this.color = c; this.tool = 'pen'; }
  setWidth(w) { this.width = w; }

  undo() {
    if (!this.strokes.length) return;
    this.redoStack.push(this.strokes.pop());
    this._redraw();
    this.onChange(this.getStrokes());
  }
  redo() {
    if (!this.redoStack.length) return;
    this.strokes.push(this.redoStack.pop());
    this._redraw();
    this.onChange(this.getStrokes());
  }
  clear() {
    if (!this.strokes.length) return;
    this.strokes = [];
    this.redoStack = [];
    this._redraw();
    this.onChange(this.getStrokes());
  }

  getStrokes() {
    return this.strokes.map((s) => ({ ...s, points: s.points.slice() }));
  }

  // ---- 内部 ----
  _resize() {
    const rect = this.wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._cssW = rect.width;
    this._cssH = rect.height;
    this._redraw();
  }

  _redraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this._cssW, this._cssH);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.strokes) this._drawStroke(s);
  }

  _drawStroke(s) {
    const ctx = this.ctx;
    const w = this._cssW;
    const h = this._cssH;
    const pts = s.points;
    if (!pts.length) return;
    ctx.save();
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color;
    }
    const baseW = s.width * w;
    if (pts.length === 1) {
      ctx.fillStyle = s.tool === 'eraser' ? 'rgba(0,0,0,1)' : s.color;
      ctx.beginPath();
      ctx.arc(pts[0][0] * w, pts[0][1] * h, Math.max(baseW / 2, 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const pr = s.tool === 'eraser' ? 1 : 0.35 + 0.65 * (b[2] || 0.5);
      ctx.lineWidth = Math.max(baseW * pr, 0.6);
      ctx.beginPath();
      ctx.moveTo(a[0] * w, a[1] * h);
      ctx.lineTo(b[0] * w, b[1] * h);
      ctx.stroke();
    }
    ctx.restore();
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [
      Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
      e.pressure && e.pressure > 0 ? e.pressure : 0.5,
    ];
  }

  _bindPointer() {
    const c = this.canvas;
    let activePointer = null;

    c.addEventListener('pointerdown', (e) => {
      if (activePointer !== null) return;
      // ペンが使われている場面での手のひら誤爆を軽減
      activePointer = e.pointerId;
      c.setPointerCapture(e.pointerId);
      const eraser = this.tool === 'eraser' || e.button === 5 || e.buttons === 32;
      this._drawing = {
        tool: eraser ? 'eraser' : 'pen',
        color: this.color,
        width: this.width / (this._cssW || 300),
        points: [this._pos(e)],
      };
      this.redoStack = [];
      this._scheduleDraw();
      e.preventDefault();
    });

    const move = (e) => {
      if (e.pointerId !== activePointer || !this._drawing) return;
      const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evts) {
        const p = this._pos(ev);
        const last = this._drawing.points[this._drawing.points.length - 1];
        const dx = p[0] - last[0];
        const dy = p[1] - last[1];
        if (dx * dx + dy * dy > 0.0000004) this._drawing.points.push(p);
      }
      this._scheduleDraw();
      e.preventDefault();
    };
    c.addEventListener('pointermove', move);

    const end = (e) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      if (!this._drawing) return;
      if (this._drawing.points.length) this.strokes.push(this._drawing);
      this._drawing = null;
      this._redraw();
      this.onChange(this.getStrokes());
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerId === activePointer && this._drawing) end(e);
    });
  }

  _scheduleDraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._redraw();
      if (this._drawing) this._drawStroke(this._drawing);
    });
  }
}
