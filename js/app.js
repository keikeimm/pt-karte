import { requestPersistentStorage } from './data/adapter.js';
import { TEMPLATES, getTemplate } from './templates.js';
import {
  newClient,
  nextMemberId,
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
  isKarteDateTaken,
} from './store.js';
import { el, toast, modal, confirmDialog, fmtDate, calcAge } from './ui.js';
import { renderFormPage, renderNotePage, renderCanvasPage, clientSummaryBlock, kindIcon } from './fields.js';
import { exportClientXlsx, exportAll, importFile } from './export.js';

const app = () => document.getElementById('app');

// ---------- ルーター（未保存の変更を破棄してよいか確認するガード付き） ----------
// カルテエディタ表示中は unsavedGuard に「未保存の変更があるか」を返す関数を
// セットする。ハッシュが変わる（＝画面を離れる）たびにこれを確認し、
// 未保存なら確認ダイアログを出す。キャンセルされたら直前のハッシュへ戻す。
let unsavedGuard = null;
let lastHash = location.hash;
let suppressGuard = false;

async function guardedRender() {
  if (suppressGuard) {
    // 直前のハッシュへ戻すための取り消し操作。今表示中の編集画面（未保存の
    // 変更を含む）はそのままなので、再描画はしない
    suppressGuard = false;
    return;
  }
  if (unsavedGuard && unsavedGuard()) {
    const leave = await confirmDialog(
      '保存されていない変更があります。保存せずに移動すると変更内容は失われます。移動しますか？',
      { danger: true }
    );
    if (!leave) {
      suppressGuard = true;
      location.hash = lastHash; // 直前のハッシュへ戻す
      return;
    }
  }
  unsavedGuard = null;
  lastHash = location.hash;
  await render();
}
window.addEventListener('hashchange', guardedRender);
window.addEventListener('beforeunload', (e) => {
  if (unsavedGuard && unsavedGuard()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

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
      el('a', { class: 'file-card', href: '#/client/' + c.id, dataset: { name: (c.name + ' ' + c.kana + ' ' + c.memberId).toLowerCase() } },
        el('div', { class: 'file-tab' }, c.name ? c.name.slice(0, 1) : '？'),
        el('div', { class: 'file-main' },
          el('div', { class: 'file-name' }, c.name || '(名称未設定)'),
          el('div', { class: 'file-sub muted' },
            [c.memberId, c.kana, c.goal].filter(Boolean).join('・') || 'タップして開く')
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
          c.memberId = await nextMemberId();
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
// 入力必須は最小限（氏名・フリガナ・生年月日・性別・利用開始日）。
// 電話・メールは任意（連絡手段が無い/教えたくない顧客もいるため必須にしない）
const CLIENT_REQUIRED_KEYS = ['name', 'kana', 'birthday', 'sex', 'startDate'];
// 数字以外を入力させないフィールド（本人の電話・緊急連絡先の電話）
const PHONE_KEYS = ['phone', 'emergencyPhone'];

function clientForm(c) {
  const entries = [];
  const f = (key, label, kind = 'text', opts = {}) => {
    const id = 'cf_' + key;
    const required = CLIENT_REQUIRED_KEYS.includes(key);
    const isPhone = kind === 'text' && PHONE_KEYS.includes(key);
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
      input = el('input', { id, type: isPhone ? 'tel' : kind });
      input.value = c[key] || '';
      if (isPhone) {
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
    f('phone', '電話'),
    f('email', 'メール'),
    f('startDate', '利用開始日', 'date'),
    f('goal', '目標'),
    f('exerciseHistory', '運動歴', 'textarea'),
    f('injuryHistory', 'ケガ・整形外科的既往', 'textarea'),
    f('medicalNotes', '持病・服薬・アレルギー', 'textarea'),
    el('h4', { class: 'field-heading' }, '緊急連絡先'),
    f('emergencyName', '緊急連絡先（氏名）'),
    f('emergencyRelation', '続柄'),
    f('emergencyPhone', '緊急連絡先（電話）'),
    f('doctor', 'かかりつけ医・病院'),
    f('memo', '備考', 'textarea'),
  ];
  const memberIdNote = el('p', { class: 'muted' },
    c.memberId ? `会員ID: ${c.memberId}` : '会員IDは保存時に自動採番されます'
  );
  const node = el('div', {}, memberIdNote, el('div', { class: 'form-grid' }, wraps));
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
      el('button', { class: 'btn btn-primary', onclick: () => pickKarteDate(c) }, '＋ カルテを作成')
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

// 記入日を選んでカルテを新規作成する。同じ日付のカルテが既にあれば作成させない
function pickKarteDate(client) {
  const input = el('input', { type: 'date', value: todayISO() });
  modal({
    title: 'カルテを作成',
    body: el('label', { class: 'field' }, el('span', {}, '記入日'), input),
    actions: [
      { label: 'キャンセル' },
      {
        label: '作成',
        primary: true,
        onClick: async (close) => {
          const date = input.value;
          if (!date) { toast('記入日を選んでください'); return; }
          if (await isKarteDateTaken(client.id, date)) {
            toast(`${fmtDate(date)} のカルテは既に作成されています`);
            return;
          }
          const ch = await createChart(client.id, 'karte', date);
          close();
          location.hash = `#/client/${client.id}/chart/${ch.id}`;
        },
      },
    ],
  });
}

function clientCard(c) {
  const row = (label, val) => val ? el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v' }, val)) : null;
  const age = c.birthday ? calcAge(c.birthday) : '';
  const emergency = [c.emergencyName, c.emergencyRelation && `（${c.emergencyRelation}）`, c.emergencyPhone].filter(Boolean).join(' ');
  return el('div', { class: 'client-card' },
    el('div', { class: 'client-card-head' },
      el('div', { class: 'client-avatar' }, c.name ? c.name.slice(0, 1) : '？'),
      el('div', {},
        el('div', { class: 'client-name' }, c.name || '(名称未設定)'),
        el('div', { class: 'muted' }, [c.memberId, c.kana, age && `${age}歳`, c.sex].filter(Boolean).join('・'))
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
      row('緊急連絡先', emergency),
      row('かかりつけ医', c.doctor),
      row('備考', c.memo)
    )
  );
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
function registerPad(pad) {
  padInstances.push(pad);
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

  // 明示的な「保存」ボタンでのみ永続化する。それまでの変更はメモリ上のみで、
  // このカルテを離れようとするとガード（guardedRender）が確認を出す
  let dirty = false;
  const markDirty = () => { dirty = true; updateSavedTag(); };
  unsavedGuard = () => dirty;

  async function doSave() {
    if (!chart.role && (await isKarteDateTaken(chart.clientId, chart.date, chart.id))) {
      toast(`記入日 ${fmtDate(chart.date)} のカルテは既に存在します。日付を変更してください。`);
      return;
    }
    await saveChart(chart);
    dirty = false;
    updateSavedTag();
    toast('保存しました');
  }

  const view = el('div', { class: 'view editor' });
  const savedTag = el('span', { class: 'saved-tag', id: 'savedTag' }, '保存済み');

  view.append(
    el('div', { class: 'crumbs' },
      el('a', { href: '#/client/' + clientId }, '← ' + (c.name || 'ファイル')),
      el('div', { class: 'spacer' }),
      savedTag,
      el('button', { class: 'btn btn-primary', onclick: doSave }, '保存'),
      el('button', { class: 'btn btn-ghost btn-danger', onclick: async () => {
        const label = chart.role ? chart.title : `記入日 ${fmtDate(chart.date)} のカルテ`;
        if (await confirmDialog(`${label}を削除します。`, { danger: true })) {
          dirty = false; // 削除確定後は「未保存の変更」確認を出さない
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
            onchange: (e) => { chart.date = e.target.value; markDirty(); },
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

  function updateSavedTag() {
    const t = document.getElementById('savedTag');
    if (!t) return;
    t.textContent = dirty ? '未保存の変更があります' : '保存済み';
    t.classList.toggle('dirty', dirty);
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
          onchange: (e) => { p.skipped = e.target.checked; markDirty(); drawNav(); },
        }),
        el('span', {}, 'このページを飛ばす')
      )
    );
    bodyWrap.append(head);

    const container = el('div', { class: 'page-content ' + p.kind });
    if (p.kind === 'canvas') renderCanvasPage(p, container, markDirty, registerPad);
    else if (p.kind === 'note') renderNotePage(p, container, markDirty);
    else renderFormPage(p, container, markDirty, c, registerPad);
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

function clampPage(chart, i) {
  return Math.min(Math.max(i | 0, 0), chart.pages.length - 1);
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
