// 汎用UIキット（ドメイン知識を持たない）: DOM生成・モーダル・トースト・日付整形。
// 注: innerHTML への書き込みは一切行わない（XSS対策）。テキストは常に
// createTextNode 経由で挿入する。人体図SVG（固定文字列）は handwriting.js 側で
// BODY_CHARTS の定数のみを innerHTML に渡しており、ユーザー入力は混ざらない。

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });

export function calcAge(bd) {
  const d = new Date(bd);
  if (isNaN(d)) return '';
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 150 ? a : '';
}

// ---------- トースト ----------
export function toast(msg) {
  const t = el('div', { class: 'toast' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

// ---------- モーダル ----------
export function modal({ title, body, actions }) {
  const overlay = el('div', { class: 'overlay' });
  const box = el('div', { class: 'modal' });
  box.append(el('div', { class: 'modal-head' }, title));
  const content = el('div', { class: 'modal-body' });
  content.append(body);
  box.append(content);
  const foot = el('div', { class: 'modal-foot' });
  const close = () => overlay.remove();
  for (const a of actions || []) {
    foot.append(
      el(
        'button',
        {
          class: 'btn ' + (a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost'),
          onclick: () => {
            if (a.onClick) a.onClick(close);
            else close();
          },
        },
        a.label
      )
    );
  }
  box.append(foot);
  overlay.append(box);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.append(overlay);
  return { close };
}

export function confirmDialog(message, { danger } = {}) {
  return new Promise((resolve) => {
    modal({
      title: '確認',
      body: el('p', { class: 'confirm-msg' }, message),
      actions: [
        { label: 'キャンセル', onClick: (c) => (c(), resolve(false)) },
        {
          label: 'OK',
          primary: !danger,
          danger,
          onClick: (c) => (c(), resolve(true)),
        },
      ],
    });
  });
}
