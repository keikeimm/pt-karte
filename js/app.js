import { requestPersistentStorage } from './data/adapter.js';
import { TEMPLATES, getTemplate } from './templates.js';
import {
  newClient,
  listClients,
  getClient,
  saveClient,
  deleteClient,
  listCharts,
  listKartes,
  getChart,
  createChart,
  saveChart,
  deleteChart,
  findChartByRole,
  todayISO,
} from './store.js';
import { HandwritingPad } from './handwriting.js';
import { exportClientXlsx, exportAll, importFile } from './export.js';

// ---------- DOM ヘルパー ----------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
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
const app = () => document.getElementById('app');
const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
const esc = (s) => String(s ?? '');

// ---------- トースト ----------
function toast(msg) {
  const t = el('div', { class: 'toast' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

// ---------- モーダル ----------
function modal({ title, body, actions }) {
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
function confirmDialog(message, { danger } = {}) {
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

// ---------- ルーター ----------
async function render() {
  clearPads();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    if (parts[0] === 'client' && parts[1] && parts[2] === 'chart' && parts[3]) {
      await viewChartEditor(parts[1], parts[3]);
    } else if (parts[0] === 'client' && parts[1]) {
      await viewClientDetail(parts[1]);
    } else {
      await viewClientList();
    }
  } catch (err) {
    console.error(err);
    app().replaceChildren(el('div', { class: 'view' }, el('p', { class: 'err' }, 'エラー: ' + err.message)));
  }
  updateNetBadge();
}
window.addEventListener('hashchange', render);

// ---------- ビュー: クライアント一覧 ----------
async function viewClientList() {
  const clients = await listClients();
  const view = el('div', { class: 'view' });

  view.append(
    el('div', { class: 'toolbar' },
      el('input', {
        class: 'search', type: 'search', placeholder: 'クライアントを検索',
        oninput: (e) => filterList(e.target.value),
      }),
      el('button', { class: 'btn btn-primary', onclick: addClient }, '＋ クライアント'),
      el('button', { class: 'btn btn-ghost', onclick: backupMenu }, 'バックアップ')
    )
  );

  if (!clients.length) {
    view.append(el('div', { class: 'empty' },
      el('p', {}, 'まだクライアントがいません。'),
      el('p', { class: 'muted' }, '「＋ クライアント」から追加してください。客ごとにファイルが分かれます。')
    ));
  }

  const list = el('div', { class: 'card-list', id: 'clientList' });
  for (const c of clients) {
    list.append(
      el('a', { class: 'file-card', href: '#/client/' + c.id, dataset: { name: (c.name + ' ' + c.kana).toLowerCase() } },
        el('div', { class: 'file-tab' }, c.name ? c.name.slice(0, 1) : '？'),
        el('div', { class: 'file-main' },
          el('div', { class: 'file-name' }, c.name || '(名称未設定)'),
          el('div', { class: 'file-sub muted' },
            [c.kana, c.goal].filter(Boolean).join('・') || 'タップして開く')
        ),
        el('div', { class: 'file-meta muted' }, '更新 ' + fmtDate(c.updatedAt))
      )
    );
  }
  view.append(list);
  app().replaceChildren(view);
}
function filterList(q) {
  q = q.trim().toLowerCase();
  for (const card of document.querySelectorAll('#clientList .file-card')) {
    card.style.display = !q || card.dataset.name.includes(q) ? '' : 'none';
  }
}

async function addClient() {
  const c = newClient();
  const form = clientForm(c);
  modal({
    title: '新しいクライアント',
    body: form.node,
    actions: [
      { label: 'キャンセル' },
      {
        label: '作成',
        primary: true,
        onClick: async (close) => {
          form.apply();
          const missing = form.missing();
          if (missing.length) {
            toast('未入力の必須項目があります: ' + missing.join('、'));
            return;
          }
          await saveClient(c);
          close();
          location.hash = '#/client/' + c.id;
        },
      },
    ],
  });
}

function backupMenu() {
  const fileInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  let importMode = 'merge';
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    fileInput.value = '';
    if (importMode === 'replace' && !(await confirmDialog('現在の全データを消してから読み込みます。よろしいですか？', { danger: true }))) return;
    try {
      const r = await importFile(f, { merge: importMode === 'merge' });
      toast(`読み込み完了: クライアント${r.clients}件 / カルテ${r.charts}件`);
      render();
    } catch (e) {
      toast('読み込み失敗: ' + e.message);
    }
  });
  const pick = (mode) => { importMode = mode; fileInput.click(); };
  modal({
    title: 'バックアップ',
    body: el('div', { class: 'stack' },
      el('p', { class: 'muted' }, 'データはこの端末のブラウザ内だけに保存されています。機種変更やサイトデータ削除に備えてJSONで書き出せます。'),
      el('button', { class: 'btn btn-ghost', onclick: async () => { const n = await exportAll(); toast('書き出し: ' + n); } }, '全データを書き出す'),
      el('button', { class: 'btn btn-ghost', onclick: () => pick('merge') }, 'JSONを読み込む（マージ）'),
      el('button', { class: 'btn btn-ghost btn-danger', onclick: () => pick('replace') }, 'JSONを読み込む（全置換）'),
      fileInput
    ),
    actions: [{ label: '閉じる', primary: true }],
  });
}

// ---------- クライアント編集フォーム ----------
// 氏名〜利用開始日は入力必須
const CLIENT_REQUIRED_KEYS = ['name', 'kana', 'birthday', 'sex', 'phone', 'email', 'startDate'];

function clientForm(c) {
  const entries = [];
  const f = (key, label, kind = 'text', opts = {}) => {
    const id = 'cf_' + key;
    const required = CLIENT_REQUIRED_KEYS.includes(key);
    let input;
    if (kind === 'textarea') {
      input = el('textarea', { id, rows: opts.rows || 2 });
      input.value = c[key] || '';
    } else if (kind === 'select') {
      input = el('select', { id });
      input.append(el('option', { value: '' }, '選択してください'));
      for (const o of opts.options) {
        input.append(el('option', { value: o, ...(c[key] === o ? { selected: true } : {}) }, o));
      }
    } else {
      input = el('input', { id, type: kind === 'text' && key === 'phone' ? 'tel' : kind });
      input.value = c[key] || '';
      if (key === 'phone') {
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('placeholder', '09012345678');
        // 数字以外は入力させない（全角数字は半角に正規化してから除去）
        input.addEventListener('input', () => {
          const half = input.value.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
          const digits = half.replace(/\D/g, '');
          if (digits !== input.value) input.value = digits;
        });
      }
    }
    entries.push({ key, label, required, input });
    return el('label', { class: 'field' + (required ? ' field-required' : '') },
      el('span', {}, label, required ? el('span', { class: 'req-mark' }, ' *') : null),
      input
    );
  };
  const wraps = [
    f('name', '氏名'),
    f('kana', 'フリガナ'),
    f('birthday', '生年月日', 'date'),
    f('sex', '性別', 'select', { options: ['男', '女', 'その他'] }),
    f('phone', '電話', 'text'),
    f('email', 'メール'),
    f('startDate', '利用開始日', 'date'),
    f('goal', '目標', 'text'),
    f('exerciseHistory', '運動歴', 'textarea'),
    f('injuryHistory', 'ケガ・整形外科的既往', 'textarea'),
    f('medicalNotes', '持病・服薬・アレルギー', 'textarea'),
    f('memo', '備考', 'textarea'),
  ];
  const node = el('div', { class: 'form-grid' }, wraps);
  return {
    node,
    apply() {
      for (const e of entries) c[e.key] = (e.input.value || '').trim();
    },
    missing() {
      return entries.filter((e) => e.required && !e.input.value.trim()).map((e) => e.label);
    },
  };
}

// ---------- ビュー: クライアント詳細（ファイルを開いた状態） ----------
async function viewClientDetail(clientId) {
  const c = await getClient(clientId);
  if (!c) {
    location.hash = '#/';
    return;
  }
  const charts = await listCharts(clientId); // roleButton判定用（counseling/precautions含む）
  const kartes = await listKartes(clientId); // カルテ一覧表示用（記入日の新しい順）
  const view = el('div', { class: 'view' });

  view.append(
    el('div', { class: 'crumbs' },
      el('a', { href: '#/' }, '← 一覧'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-ghost', onclick: () => editClient(c) }, '顧客データを編集'),
      el('button', { class: 'btn btn-ghost btn-danger', onclick: async () => {
        if (await confirmDialog(`「${c.name}」のファイルとカルテを全て削除します。`, { danger: true })) {
          await deleteClient(clientId);
          location.hash = '#/';
        }
      } }, '削除')
    )
  );

  // 頭に顧客データ（常時上部）
  view.append(clientCard(c));

  // カウンセリングシート / 注意書き
  view.append(
    el('div', { class: 'section' },
      el('h3', {}, 'シート'),
      el('div', { class: 'quick-row' },
        roleButton(c, charts, 'counseling', '📋 カウンセリングシート'),
        roleButton(c, charts, 'precautions', '⚠️ 注意書き・同意書')
      )
    )
  );

  // カルテ一覧（記入日で管理。カウンセリングシート・注意書きは専用ボタン側にあるので出さない）
  const kSection = el('div', { class: 'section' },
    el('div', { class: 'section-head' },
      el('h3', {}, 'カルテ'),
      el('button', { class: 'btn btn-primary', onclick: () => createKarteAndOpen(c) }, '＋ 本日のカルテ')
    )
  );
  if (!kartes.length) {
    kSection.append(el('p', { class: 'muted' }, 'カルテはまだありません。'));
  }
  const kl = el('div', { class: 'card-list' });
  for (const ch of kartes) {
    kl.append(
      el('a', { class: 'chart-card', href: `#/client/${clientId}/chart/${ch.id}` },
        el('div', { class: 'chart-icon' }, '📝'),
        el('div', { class: 'chart-main' },
          el('div', { class: 'chart-title' }, fmtDate(ch.date)),
          el('div', { class: 'muted' }, `更新 ${fmtDate(ch.updatedAt)}`)
        )
      )
    );
  }
  kSection.append(kl);
  view.append(kSection);

  view.append(
    el('div', { class: 'section' },
      el('button', { class: 'btn btn-ghost', onclick: async () => { const n = await exportClientXlsx(c); toast('書き出し: ' + n); } },
        'このクライアントを書き出す（Excel）')
    )
  );

  app().replaceChildren(view);
}

async function createKarteAndOpen(client) {
  const ch = await createChart(client.id, 'karte');
  location.hash = `#/client/${client.id}/chart/${ch.id}`;
}

function clientCard(c) {
  const row = (label, val) => val ? el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v' }, val)) : null;
  const age = c.birthday ? calcAge(c.birthday) : '';
  return el('div', { class: 'client-card' },
    el('div', { class: 'client-card-head' },
      el('div', { class: 'client-avatar' }, c.name ? c.name.slice(0, 1) : '？'),
      el('div', {},
        el('div', { class: 'client-name' }, c.name || '(名称未設定)'),
        el('div', { class: 'muted' }, [c.kana, age && `${age}歳`, c.sex].filter(Boolean).join('・'))
      )
    ),
    el('div', { class: 'kv-grid' },
      row('目標', c.goal),
      row('生年月日', c.birthday),
      row('電話', c.phone),
      row('メール', c.email),
      row('利用開始', c.startDate),
      row('運動歴', c.exerciseHistory),
      row('ケガ・既往', c.injuryHistory),
      row('持病・服薬・アレルギー', c.medicalNotes),
      row('備考', c.memo)
    )
  );
}
function calcAge(bd) {
  const d = new Date(bd);
  if (isNaN(d)) return '';
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 150 ? a : '';
}

function editClient(c) {
  const form = clientForm(c);
  modal({
    title: '顧客データを編集',
    body: form.node,
    actions: [
      { label: 'キャンセル' },
      {
        label: '保存',
        primary: true,
        onClick: async (close) => {
          form.apply();
          const missing = form.missing();
          if (missing.length) {
            toast('未入力の必須項目があります: ' + missing.join('、'));
            return;
          }
          await saveClient(c);
          close();
          render();
        },
      },
    ],
  });
}

function roleButton(client, charts, role, label) {
  const existing = charts.find((ch) => ch.role === role);
  return el('button', {
    class: 'btn btn-tile',
    onclick: async () => {
      let ch = existing || (await findChartByRole(client.id, role));
      if (!ch) {
        const tpl = TEMPLATES.find((t) => t.role === role);
        ch = await createChart(client.id, tpl.id);
      }
      location.hash = `#/client/${client.id}/chart/${ch.id}`;
    },
  }, label, el('span', { class: 'tile-sub' }, existing ? '開く' : '新規作成'));
}

// ---------- ビュー: カルテエディタ ----------
let padInstances = [];
function clearPads() {
  for (const p of padInstances) p.destroy();
  padInstances = [];
}

async function viewChartEditor(clientId, chartId) {
  clearPads();
  const [c, chart] = await Promise.all([getClient(clientId), getChart(chartId)]);
  if (!c || !chart) {
    location.hash = '#/client/' + clientId;
    return;
  }
  const tpl = getTemplate(chart.templateId);
  let pageIdx = clampPage(chart, +sessionStorage.getItem('pg_' + chartId) || 0);

  const save = debounce(async () => {
    await saveChart(chart);
    setSaved();
  }, 450);
  const touch = () => {
    setSaving();
    save();
  };

  const view = el('div', { class: 'view editor' });
  const savedTag = el('span', { class: 'saved-tag', id: 'savedTag' }, '保存済み');

  view.append(
    el('div', { class: 'crumbs' },
      el('a', { href: '#/client/' + clientId }, '← ' + (c.name || 'ファイル')),
      el('div', { class: 'spacer' }),
      savedTag,
      el('button', { class: 'btn btn-ghost btn-danger', onclick: async () => {
        const label = chart.role ? chart.title : `記入日 ${fmtDate(chart.date)} のカルテ`;
        if (await confirmDialog(`${label}を削除します。`, { danger: true })) {
          await deleteChart(chart);
          location.hash = '#/client/' + clientId;
        }
      } }, '削除')
    )
  );

  // role（counseling/precautions）はテンプレ名固定。カルテは記入日で管理し、その場で変更可能
  view.append(el('div', { class: 'editor-title' },
    el('span', { class: 'chart-icon' }, tpl?.icon || '📝'),
    chart.role
      ? el('span', {}, chart.title)
      : el('label', { class: 'date-edit' },
          el('span', {}, 'カルテ：'),
          el('input', {
            type: 'date', value: chart.date || todayISO(),
            onchange: (e) => { chart.date = e.target.value; touch(); },
          })
        )
  ));

  // 顧客サマリー（頭に顧客データ）
  view.append(clientStrip(c));

  // ページナビ（タブ）
  const nav = el('div', { class: 'page-nav', id: 'pageNav' });
  view.append(nav);

  const bodyWrap = el('div', { class: 'page-body', id: 'pageBody' });
  view.append(bodyWrap);

  // 前後ボタン
  view.append(el('div', { class: 'page-move' },
    el('button', { class: 'btn btn-ghost', onclick: () => go(-1) }, '← 前のページ'),
    el('span', { class: 'muted', id: 'pageCount' }),
    el('button', { class: 'btn btn-ghost', onclick: () => go(1) }, '次のページ →')
  ));

  app().replaceChildren(view);
  drawNav();
  drawPage();

  function setSaving() {
    const t = document.getElementById('savedTag');
    if (t) { t.textContent = '保存中…'; t.classList.add('dirty'); }
  }
  function setSaved() {
    const t = document.getElementById('savedTag');
    if (t) { t.textContent = '保存済み'; t.classList.remove('dirty'); }
  }
  function go(dir) {
    let i = pageIdx;
    for (let n = 0; n < chart.pages.length; n++) {
      i += dir;
      if (i < 0 || i >= chart.pages.length) return;
      if (!chart.pages[i].skipped) break;
    }
    if (i >= 0 && i < chart.pages.length) selectPage(i);
  }
  function selectPage(i) {
    pageIdx = clampPage(chart, i);
    sessionStorage.setItem('pg_' + chartId, String(pageIdx));
    clearPads();
    drawNav();
    drawPage();
  }
  function drawNav() {
    nav.replaceChildren();
    chart.pages.forEach((p, i) => {
      const chip = el('button', {
        class: 'pchip' + (i === pageIdx ? ' active' : '') + (p.skipped ? ' skipped' : ''),
        onclick: () => selectPage(i),
      },
        el('span', { class: 'pchip-idx' }, String(i + 1)),
        el('span', { class: 'pchip-name' }, p.name),
        el('span', { class: 'pchip-kind' }, kindIcon(p.kind))
      );
      nav.append(chip);
    });
    const pc = document.getElementById('pageCount');
    if (pc) pc.textContent = `${pageIdx + 1} / ${chart.pages.length}`;
  }
  function drawPage() {
    const p = chart.pages[pageIdx];
    bodyWrap.replaceChildren();

    // ページヘッダ（種別・スキップ）
    const head = el('div', { class: 'page-head' },
      el('div', { class: 'page-h-title' }, p.name),
      el('label', { class: 'skip-toggle' + (p.skippable ? '' : ' disabled') },
        el('input', {
          type: 'checkbox', ...(p.skipped ? { checked: true } : {}),
          ...(p.skippable ? {} : { disabled: true }),
          onchange: (e) => { p.skipped = e.target.checked; touch(); drawNav(); },
        }),
        el('span', {}, 'このページを飛ばす')
      )
    );
    bodyWrap.append(head);

    const container = el('div', { class: 'page-content ' + p.kind });
    if (p.kind === 'canvas') renderCanvasPage(p, container, touch);
    else if (p.kind === 'note') renderNotePage(p, container, touch);
    else renderFormPage(p, container, touch, c);
    bodyWrap.append(container);
  }
}

function clientStrip(c) {
  const bits = [
    c.name || '(名称未設定)',
    c.kana,
    c.birthday && `${c.birthday}${calcAge(c.birthday) !== '' ? `(${calcAge(c.birthday)}歳)` : ''}`,
    c.phone,
    c.goal && '目標: ' + c.goal,
  ].filter(Boolean);
  const warn = [c.injuryHistory, c.medicalNotes].filter(Boolean).join(' / ');
  return el('div', { class: 'client-strip' },
    el('div', { class: 'strip-main' }, bits.join('　')),
    warn && el('div', { class: 'strip-warn' }, '⚠ ' + warn)
  );
}

function kindIcon(k) {
  return k === 'canvas' ? '✎' : k === 'note' ? '⌨' : '☑';
}

function clampPage(chart, i) {
  return Math.min(Math.max(i | 0, 0), chart.pages.length - 1);
}

// ---------- ページ描画: note ----------
function renderNotePage(p, container, touch) {
  const ta = el('textarea', { class: 'note-area', placeholder: p.placeholder || '自由記入', rows: 14 });
  ta.value = p.text || '';
  ta.addEventListener('input', () => { p.text = ta.value; touch(); });
  container.append(ta);
}

// ---------- ページ描画: canvas ----------
function renderCanvasPage(p, container, touch) {
  const colors = ['#1f2937', '#dc2626', '#2563eb', '#059669', '#d97706'];
  const state = { color: colors[0], width: 3 };

  const bar = el('div', { class: 'pad-toolbar' });
  const pad = new HandwritingPad(el('div'), {
    color: state.color,
    width: state.width,
    onChange: (strokes) => { p.strokes = strokes; touch(); },
  });
  padInstances.push(pad);

  const penBtn = el('button', { class: 'tb active', onclick: () => setTool('pen') }, '✎ ペン');
  const eraBtn = el('button', { class: 'tb', onclick: () => setTool('eraser') }, '⌫ 消しゴム');
  function setTool(t) {
    pad.setTool(t);
    penBtn.classList.toggle('active', t === 'pen');
    eraBtn.classList.toggle('active', t === 'eraser');
  }
  bar.append(penBtn, eraBtn);

  const swatches = el('div', { class: 'swatches' });
  const swEls = colors.map((col) => {
    const s = el('button', { class: 'sw' + (col === state.color ? ' sel' : ''), style: `--c:${col}`, onclick: () => {
      state.color = col;
      pad.setColor(col);
      setTool('pen');
      for (const x of swEls) x.classList.toggle('sel', x === s);
    } });
    return s;
  });
  swatches.append(...swEls);
  bar.append(swatches);

  const wr = el('input', { type: 'range', min: 1, max: 12, value: state.width, class: 'width-range', oninput: (e) => pad.setWidth(+e.target.value) });
  bar.append(el('label', { class: 'tb-range' }, '太さ', wr));

  bar.append(
    el('button', { class: 'tb', onclick: () => pad.undo() }, '↶ 取消'),
    el('button', { class: 'tb', onclick: () => pad.redo() }, '↷ やり直し'),
    el('button', { class: 'tb', onclick: async () => { if (await confirmDialog('この手書きを全て消去します。')) pad.clear(); } }, 'クリア')
  );

  // 背景（人体図）選択
  const bgSel = el('select', { class: 'bg-select', onchange: (e) => { p.bg = e.target.value || null; pad.setBackground(p.bg); touch(); } });
  bgSel.append(el('option', { value: '' }, '背景なし'));
  const bgLabels = { 'body-front': '人体図（前面）', 'body-back': '人体図（背面）', 'posture-side': '姿勢（矢状面）', 'posture-front': '姿勢（前額面）' };
  for (const [k, label] of Object.entries(bgLabels)) {
    bgSel.append(el('option', { value: k, ...(p.bg === k ? { selected: true } : {}) }, label));
  }
  bar.append(el('label', { class: 'tb-range' }, '背景', bgSel));

  container.append(bar, pad.wrap);
  pad.load(p.strokes || [], p.bg);

  // メモ欄（打ち込み併用）
  for (const f of p.fields || []) {
    if (f.type === 'textarea' || f.type === 'text') {
      container.append(renderField(f, p.values, touch));
    }
  }
}

// ---------- ページ描画: form ----------
function renderFormPage(p, container, touch, client) {
  const grid = el('div', { class: 'field-grid' });
  for (const f of p.fields || []) {
    grid.append(renderField(f, p.values, touch, client));
  }
  container.append(grid);
}

function renderField(f, values, touch, client) {
  if (f.type === 'heading') return el('h4', { class: 'field-heading' }, f.label);

  if (f.type === 'static') {
    if (f.key === '_clientSummary') return client ? clientSummaryBlock(client) : el('div');
    return el('div', { class: 'static-text' }, f.text || '');
  }

  if (f.type === 'table') return renderTable(f, values, touch);

  if (f.type === 'sign') {
    const box = el('div', { class: 'sign-box' });
    const pad = new HandwritingPad(box, {
      width: 2.5,
      onChange: (s) => { values[f.key] = s; touch(); },
    });
    padInstances.push(pad);
    setTimeout(() => pad.load(values[f.key] || [], null), 0);
    return el('div', { class: 'field field-wide' },
      el('span', {}, f.label),
      box,
      el('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { if (await confirmDialog('署名を消去します。')) pad.clear(); } }, '署名クリア')
    );
  }

  const wide = f.type === 'textarea';
  const wrap = el('label', { class: 'field' + (wide ? ' field-wide' : '') }, el('span', {}, f.label));
  let input;
  if (f.type === 'textarea') {
    input = el('textarea', { rows: f.rows || 2 });
    input.value = values[f.key] || '';
    input.addEventListener('input', () => { values[f.key] = input.value; touch(); });
  } else if (f.type === 'select') {
    input = el('select');
    input.append(el('option', { value: '' }, '—'));
    for (const o of f.options || []) input.append(el('option', { value: o, ...(values[f.key] === o ? { selected: true } : {}) }, o));
    input.addEventListener('change', () => { values[f.key] = input.value; touch(); });
  } else if (f.type === 'checkbox') {
    input = el('input', { type: 'checkbox', ...(values[f.key] ? { checked: true } : {}) });
    input.addEventListener('change', () => { values[f.key] = input.checked; touch(); });
    return el('label', { class: 'field field-inline' }, input, el('span', {}, f.label));
  } else if (f.type === 'yesno') {
    const name = 'yn_' + Math.random().toString(36).slice(2);
    const mk = (v) => {
      const r = el('input', { type: 'radio', name, ...(values[f.key] === v ? { checked: true } : {}) });
      r.addEventListener('change', () => { values[f.key] = v; touch(); });
      return el('label', { class: 'radio' }, r, el('span', {}, v));
    };
    return el('div', { class: 'field field-wide field-yesno' }, el('span', {}, f.label), el('div', { class: 'yn' }, mk('はい'), mk('いいえ')));
  } else {
    input = el('input', { type: f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text' });
    input.value = values[f.key] || '';
    input.addEventListener('input', () => { values[f.key] = input.value; touch(); });
  }
  wrap.append(input);
  return wrap;
}

function clientSummaryBlock(c) {
  const row = (k, v) => v ? el('tr', {}, el('th', {}, k), el('td', {}, v)) : null;
  return el('table', { class: 'client-summary' },
    row('氏名', c.name),
    row('フリガナ', c.kana),
    row('生年月日', c.birthday + (calcAge(c.birthday) !== '' ? `（${calcAge(c.birthday)}歳）` : '')),
    row('性別', c.sex),
    row('電話', c.phone),
    row('目標', c.goal),
    row('ケガ・既往', c.injuryHistory),
    row('持病・服薬・アレルギー', c.medicalNotes)
  );
}

function renderTable(f, values, touch) {
  if (!Array.isArray(values[f.key])) {
    values[f.key] = (f.rows || []).map((r) => ({ ...r }));
  }
  const rows = values[f.key];
  const wrap = el('div', { class: 'field field-wide' }, el('span', {}, f.label));
  const table = el('table', { class: 'grid-table' });
  const thead = el('tr', {}, f.columns.map((c) => el('th', {}, c.label)), el('th', {}));
  table.append(thead);

  function drawRows() {
    for (const tr of [...table.querySelectorAll('tr.data')]) tr.remove();
    rows.forEach((rowData, ri) => {
      const tr = el('tr', { class: 'data' });
      for (const col of f.columns) {
        const td = el('td', {});
        let input;
        if (col.type === 'select') {
          input = el('select');
          input.append(el('option', { value: '' }, '—'));
          for (const o of col.options || []) input.append(el('option', { value: o, ...(rowData[col.key] === o ? { selected: true } : {}) }, o));
          input.addEventListener('change', () => { rowData[col.key] = input.value; touch(); });
        } else {
          input = el('input', { type: 'text' });
          input.value = rowData[col.key] || '';
          input.addEventListener('input', () => { rowData[col.key] = input.value; touch(); });
        }
        td.append(input);
        tr.append(td);
      }
      const del = el('td', {}, el('button', { class: 'row-del', title: '行を削除', onclick: () => { rows.splice(ri, 1); touch(); drawRows(); } }, '×'));
      tr.append(del);
      table.append(tr);
    });
  }
  drawRows();
  wrap.append(el('div', { class: 'table-scroll' }, table));
  wrap.append(el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { rows.push({}); touch(); drawRows(); } }, '＋ 行を追加'));
  return wrap;
}

// ---------- ネットワーク表示 ----------
function updateNetBadge() {
  const b = document.getElementById('netBadge');
  if (!b) return;
  const off = !navigator.onLine;
  b.textContent = off ? 'オフライン' : 'オンライン';
  b.classList.toggle('off', off);
}
window.addEventListener('online', updateNetBadge);
window.addEventListener('offline', updateNetBadge);

// ---------- 起動 ----------
(async function boot() {
  await requestPersistentStorage();
  if (!location.hash) location.hash = '#/';
  render();
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      console.warn('SW 登録失敗', e);
    }
  }
})();
