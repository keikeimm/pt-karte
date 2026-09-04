// データの持ち出し。2種類:
// - JSON バックアップ（exportAll/importFile）: アプリ自身の全データを退避・復元する内部用
// - Excel 書き出し（exportClientXlsx）: 基本情報・カウンセリングシート・同意書・カルテを
//   シート分けした、人に渡せる書類としての書き出し（読み込みには対応しない）
// Excel生成は js/vendor/xlsx.core.min.js が生やすグローバル XLSX を使う。
import { db } from './data/adapter.js';
import { listCharts } from './store.js';

const FORMAT = 'pt-karte-backup';
const VERSION = 1;

// ---- JSON バックアップ ----
export async function exportAll() {
  const clients = await db.getAll('clients');
  const charts = await db.getAll('charts');
  const json = JSON.stringify(
    { format: FORMAT, version: VERSION, kind: 'all', exportedAt: new Date().toISOString(), clients, charts },
    null,
    2
  );
  return downloadBlob([json], 'application/json', `karte_backup_${stamp()}.json`);
}

export async function importFile(file, { merge = true } = {}) {
  const data = JSON.parse(await file.text());
  if (data.format !== FORMAT) throw new Error('対応していないファイル形式です');
  if (data.kind !== 'all') throw new Error('不明なバックアップ種別です');

  if (!merge) {
    await db.clear('clients');
    await db.clear('charts');
  }
  await db.bulkPut('clients', data.clients || []);
  await db.bulkPut('charts', data.charts || []);
  return { clients: (data.clients || []).length, charts: (data.charts || []).length };
}

// ---- Excel 書き出し（基本情報 / カウンセリングシート / 同意書 / カルテ） ----
export async function exportClientXlsx(client) {
  const charts = await listCharts(client.id);
  const counseling = charts.find((ch) => ch.role === 'counseling');
  const precautions = charts.find((ch) => ch.role === 'precautions');
  const kartes = charts.filter((ch) => !ch.role).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, clientInfoSheet(client), '基本情報');
  XLSX.utils.book_append_sheet(wb, chartSheet(counseling ? [counseling] : [], 'カウンセリングシートは未作成です。'), 'カウンセリングシート');
  XLSX.utils.book_append_sheet(wb, chartSheet(precautions ? [precautions] : [], '同意書は未作成です。'), '同意書');
  XLSX.utils.book_append_sheet(wb, chartSheet(kartes, 'カルテはまだありません。'), 'カルテ');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const filename = `karte_${safe(client.name || client.id)}_${stamp()}.xlsx`;
  return downloadBlob(
    [buf],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename
  );
}

function clientInfoSheet(c) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['項目', '内容'],
    ['氏名', c.name],
    ['フリガナ', c.kana],
    ['生年月日', c.birthday],
    ['性別', c.sex],
    ['電話', c.phone],
    ['メール', c.email],
    ['目標', c.goal],
    ['利用開始日', c.startDate],
    ['運動歴', c.exerciseHistory],
    ['ケガ・整形外科的既往', c.injuryHistory],
    ['持病・服薬・アレルギー', c.medicalNotes],
    ['備考', c.memo],
  ]);
  ws['!cols'] = [{ wch: 24 }, { wch: 50 }];
  return ws;
}

// 1件以上のカルテ（同種のチャート配列）をシート化。見出し→ページごとの項目/値を
// 並べ、複数件（カルテ）は記入日の見出しと空行で区切る。
function chartSheet(charts, emptyMessage) {
  const rows = [];
  if (!charts.length) rows.push([emptyMessage]);
  for (const ch of charts) {
    rows.push([ch.role ? ch.title : `記入日: ${ch.date || ''}`]);
    for (const page of ch.pages) {
      if (page.name === '顧客データ') continue; // 基本情報シートと重複するため省略
      rows.push([page.name]);
      rows.push(...pageValueRows(page));
    }
    rows.push([]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
  return ws;
}

function pageValueRows(page) {
  const rows = [];
  for (const f of page.fields || []) {
    if (f.type === 'heading' || f.type === 'static') continue;
    if (f.type === 'table') {
      rows.push([f.label]);
      rows.push(f.columns.map((c) => c.label));
      for (const r of page.values[f.key] || []) rows.push(f.columns.map((c) => r[c.key] ?? ''));
      continue;
    }
    if (f.type === 'sign') {
      rows.push([f.label, (page.values[f.key] || []).length ? '署名あり' : '未署名']);
      continue;
    }
    const v = page.values[f.key];
    rows.push([f.label, v === true ? 'はい' : v === false ? 'いいえ' : v ?? '']);
  }
  if (page.kind === 'note' && page.text) rows.push(['メモ', page.text]);
  if (page.kind === 'canvas') rows.push(['手書き', (page.strokes || []).length ? 'あり（アプリ内で参照）' : 'なし']);
  return rows;
}

// ---- 共通: ダウンロード発火 ----
function downloadBlob(parts, mime, filename) {
  const blob = new Blob(parts, { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}
function safe(s) {
  return String(s).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);
}
