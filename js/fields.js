// テンプレートのページ/フィールドをDOMへ描画する。カルテエディタ（app.js）から
// ページ種別ごとに呼ばれる。手書きパッドは呼び出し側（app.js）がライフサイクル
// （ページ切替時の破棄）を管理できるよう、生成のたびに registerPad(pad) で通知する。
import { el, confirmDialog, calcAge } from './ui.js';
import { HandwritingPad } from './handwriting.js';

export function kindIcon(k) {
  return k === 'canvas' ? '✎' : k === 'note' ? '⌨' : '☑';
}

// ---------- ページ描画: note ----------
export function renderNotePage(p, container, markDirty) {
  const ta = el('textarea', { class: 'note-area', placeholder: p.placeholder || '自由記入', rows: 14 });
  ta.value = p.text || '';
  ta.addEventListener('input', () => { p.text = ta.value; markDirty(); });
  container.append(ta);
}

// ---------- ページ描画: canvas ----------
export function renderCanvasPage(p, container, markDirty, registerPad) {
  const colors = ['#1f2937', '#dc2626', '#2563eb', '#059669', '#d97706'];
  const state = { color: colors[0], width: 3 };

  const bar = el('div', { class: 'pad-toolbar' });
  const pad = new HandwritingPad(el('div'), {
    color: state.color,
    width: state.width,
    onChange: (strokes) => { p.strokes = strokes; markDirty(); },
  });
  registerPad(pad);

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
  const bgSel = el('select', { class: 'bg-select', onchange: (e) => { p.bg = e.target.value || null; pad.setBackground(p.bg); markDirty(); } });
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
      container.append(renderField(f, p.values, markDirty, null, registerPad));
    }
  }
}

// ---------- ページ描画: form ----------
export function renderFormPage(p, container, markDirty, client, registerPad) {
  const grid = el('div', { class: 'field-grid' });
  for (const f of p.fields || []) {
    grid.append(renderField(f, p.values, markDirty, client, registerPad));
  }
  container.append(grid);
}

export function renderField(f, values, markDirty, client, registerPad) {
  if (f.type === 'heading') return el('h4', { class: 'field-heading' }, f.label);

  if (f.type === 'static') {
    if (f.key === '_clientSummary') return client ? clientSummaryBlock(client) : el('div');
    return el('div', { class: 'static-text' }, f.text || '');
  }

  if (f.type === 'table') return renderTable(f, values, markDirty);

  if (f.type === 'sign') {
    const box = el('div', { class: 'sign-box' });
    const pad = new HandwritingPad(box, {
      width: 2.5,
      onChange: (s) => { values[f.key] = s; markDirty(); },
    });
    registerPad(pad);
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
    input.addEventListener('input', () => { values[f.key] = input.value; markDirty(); });
  } else if (f.type === 'select') {
    input = el('select');
    input.append(el('option', { value: '' }, '—'));
    for (const o of f.options || []) input.append(el('option', { value: o, ...(values[f.key] === o ? { selected: true } : {}) }, o));
    input.addEventListener('change', () => { values[f.key] = input.value; markDirty(); });
  } else if (f.type === 'checkbox') {
    input = el('input', { type: 'checkbox', ...(values[f.key] ? { checked: true } : {}) });
    input.addEventListener('change', () => { values[f.key] = input.checked; markDirty(); });
    return el('label', { class: 'field field-inline' }, input, el('span', {}, f.label));
  } else if (f.type === 'yesno') {
    const name = 'yn_' + Math.random().toString(36).slice(2);
    const mk = (v) => {
      const r = el('input', { type: 'radio', name, ...(values[f.key] === v ? { checked: true } : {}) });
      r.addEventListener('change', () => { values[f.key] = v; markDirty(); });
      return el('label', { class: 'radio' }, r, el('span', {}, v));
    };
    return el('div', { class: 'field field-wide field-yesno' }, el('span', {}, f.label), el('div', { class: 'yn' }, mk('はい'), mk('いいえ')));
  } else {
    input = el('input', { type: f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text' });
    input.value = values[f.key] || '';
    input.addEventListener('input', () => { values[f.key] = input.value; markDirty(); });
  }
  wrap.append(input);
  return wrap;
}

export function clientSummaryBlock(c) {
  const row = (k, v) => v ? el('tr', {}, el('th', {}, k), el('td', {}, v)) : null;
  const emergency = [c.emergencyName, c.emergencyRelation && `（${c.emergencyRelation}）`, c.emergencyPhone].filter(Boolean).join(' ');
  return el('table', { class: 'client-summary' },
    row('会員ID', c.memberId),
    row('氏名', c.name),
    row('フリガナ', c.kana),
    row('生年月日', c.birthday + (calcAge(c.birthday) !== '' ? `（${calcAge(c.birthday)}歳）` : '')),
    row('性別', c.sex),
    row('電話', c.phone),
    row('目標', c.goal),
    row('ケガ・既往', c.injuryHistory),
    row('持病・服薬・アレルギー', c.medicalNotes),
    row('緊急連絡先', emergency),
    row('かかりつけ医', c.doctor)
  );
}

function renderTable(f, values, markDirty) {
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
          input.addEventListener('change', () => { rowData[col.key] = input.value; markDirty(); });
        } else {
          input = el('input', { type: 'text' });
          input.value = rowData[col.key] || '';
          input.addEventListener('input', () => { rowData[col.key] = input.value; markDirty(); });
        }
        td.append(input);
        tr.append(td);
      }
      const del = el('td', {}, el('button', { class: 'row-del', title: '行を削除', onclick: () => { rows.splice(ri, 1); markDirty(); drawRows(); } }, '×'));
      tr.append(del);
      table.append(tr);
    });
  }
  drawRows();
  wrap.append(el('div', { class: 'table-scroll' }, table));
  wrap.append(el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { rows.push({}); markDirty(); drawRows(); } }, '＋ 行を追加'));
  return wrap;
}
