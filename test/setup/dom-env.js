// テスト用の簡易 DOM 環境（jsdom）。
// app.js / handwriting.js はブラウザのグローバル（document, navigator, …）に
// 直接依存しているため、jsdom で本物に近い DOM を用意し globalThis に反映する。
// jsdom が持たない/未実装のAPI（ResizeObserver・canvas 2D・URL.createObjectURL・
// pointer capture）だけ最小限のフェイクで補う。
import { JSDOM } from 'jsdom';

const GLOBAL_KEYS = [
  'window', 'document', 'navigator', 'location', 'history',
  'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent',
  'HTMLCanvasElement', 'HTMLInputElement', 'HTMLSelectElement',
  'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver',
  'sessionStorage', 'localStorage', 'Blob', 'FormData', 'URL',
];

export function installDom({ url = 'http://localhost/pt-karte/' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url,
    pretendToBeVisual: true, // requestAnimationFrame / getComputedStyle を有効化
  });
  const { window } = dom;

  // jsdom未実装: ResizeObserver
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // jsdom未実装: canvas 2D context（描画自体はしないフェイク。呼び出しは記録できるように）
  window.HTMLCanvasElement.prototype.getContext = function () {
    return makeFakeCanvasContext();
  };

  // jsdom未実装: URL.createObjectURL / revokeObjectURL、pointer capture
  window.URL.createObjectURL = () => 'blob:mock-url';
  window.URL.revokeObjectURL = () => {};
  window.HTMLElement.prototype.setPointerCapture = window.HTMLElement.prototype.setPointerCapture || function () {};
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || function () {};
  // <a>.click() はjsdomだと未実装ナビゲーションの警告が出るのでデフォルトno-opに
  // （ダウンロードの検証をしたいテストは import 後に個別で上書きしてよい）
  window.HTMLAnchorElement.prototype.click = function () {};

  for (const key of GLOBAL_KEYS) {
    if (!(key in window)) continue;
    // Node 22+ は navigator 等をゲッターのみのグローバルとして持つため
    // 単純代入だと失敗する。defineProperty で上書き可能にする。
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }
  globalThis.self = globalThis;
  globalThis.window = window;

  return dom;
}

export function makeFakeCanvasContext() {
  const noop = () => {};
  return {
    save: noop, restore: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, stroke: noop, fill: noop,
    arc: noop, clearRect: noop, fillRect: noop, setTransform: noop,
    lineCap: '', lineJoin: '', lineWidth: 1,
    strokeStyle: '', fillStyle: '', globalCompositeOperation: 'source-over',
  };
}

// pointerdown/move/up を canvas / 要素に対して発火するヘルパー。
// jsdom は PointerEvent を実装していないため、Event に必要なプロパティを
// 手で足して dispatch する。
export function firePointer(target, type, { x = 0, y = 0, pressure = 0.5, pointerId = 1, pointerType = 'pen' } = {}) {
  const ev = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, {
    pointerId, pressure, pointerType,
    clientX: x, clientY: y,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    button: 0,
    getCoalescedEvents: () => [ev],
  });
  target.dispatchEvent(ev);
  return ev;
}

// 実レイアウトが無い jsdom で getBoundingClientRect に固定サイズを返させる。
export function stubRect(el, { width = 300, height = 300, left = 0, top = 0 } = {}) {
  el.getBoundingClientRect = () => ({ width, height, left, top, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
}

export function fireClick(el) {
  const ev = new window.Event('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
}

export function fireInput(el, value) {
  el.value = value;
  const ev = new window.Event('input', { bubbles: true });
  el.dispatchEvent(ev);
}

export function fireChange(el, value) {
  if (value !== undefined) el.value = value;
  const ev = new window.Event('change', { bubbles: true });
  el.dispatchEvent(ev);
}

// テキストで要素/ボタンを探すヘルパー（モーダル操作用）
export function byText(root, selector, text) {
  return [...root.querySelectorAll(selector)].find((el) => el.textContent.trim() === text);
}
export function clickByText(root, selector, text) {
  const el = byText(root, selector, text);
  if (!el) throw new Error(`not found: ${selector} "${text}"`);
  fireClick(el);
  return el;
}

// マイクロタスク/短い非同期処理（IndexedDB経由の描画など）の完了待ち。
export function flush(rounds = 20) {
  return new Promise((resolve) => {
    let n = 0;
    const step = () => {
      n++;
      if (n >= rounds) resolve();
      else setTimeout(step, 0);
    };
    step();
  });
}
