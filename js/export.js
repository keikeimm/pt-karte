// JSON でのバックアップ / 復元。サーバーが無いので端末外へ持ち出す唯一の手段。
import { db } from './data/adapter.js';
import { listCharts } from './store.js';

const FORMAT = 'pt-karte-backup';
const VERSION = 1;

export async function exportClient(client) {
  const charts = await listCharts(client.id);
  return download(
    { format: FORMAT, version: VERSION, kind: 'client', exportedAt: new Date().toISOString(), client, charts },
    `karte_${safe(client.name || client.id)}_${stamp()}.json`
  );
}

export async function exportAll() {
  const clients = await db.getAll('clients');
  const charts = await db.getAll('charts');
  return download(
    { format: FORMAT, version: VERSION, kind: 'all', exportedAt: new Date().toISOString(), clients, charts },
    `karte_backup_${stamp()}.json`
  );
}

export async function importFile(file, { merge = true } = {}) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.format !== FORMAT) throw new Error('対応していないファイル形式です');

  let clients = [];
  let charts = [];
  if (data.kind === 'client') {
    clients = [data.client];
    charts = data.charts || [];
  } else if (data.kind === 'all') {
    clients = data.clients || [];
    charts = data.charts || [];
  } else {
    throw new Error('不明なバックアップ種別です');
  }

  if (!merge) {
    await db.clear('clients');
    await db.clear('charts');
  }
  await db.bulkPut('clients', clients);
  await db.bulkPut('charts', charts);
  return { clients: clients.length, charts: charts.length };
}

function download(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
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
