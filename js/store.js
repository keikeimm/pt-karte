// クライアント / カルテの CRUD。
import { db, uid } from './data/adapter.js';
import { getTemplate, instantiatePages } from './templates.js';

export function newClient(partial = {}) {
  const now = Date.now();
  return {
    id: uid('c_'),
    name: '',
    kana: '',
    birthday: '',
    sex: '',
    phone: '',
    email: '',
    goal: '',
    startDate: '',
    injuryHistory: '',
    medicalNotes: '',
    exerciseHistory: '',
    memo: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export async function listClients() {
  const all = await db.getAll('clients');
  all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return all;
}

export function getClient(id) {
  return db.get('clients', id);
}

export async function saveClient(client) {
  client.updatedAt = Date.now();
  await db.put('clients', client);
  return client;
}

export async function deleteClient(id) {
  const charts = await db.getAllByIndex('charts', 'by_client', id);
  for (const ch of charts) await db.delete('charts', ch.id);
  await db.delete('clients', id);
}

export async function listCharts(clientId) {
  const all = await db.getAllByIndex('charts', 'by_client', clientId);
  all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return all;
}

// role を持たない（＝記入日で管理する）カルテだけを、日付の新しい順で返す。
// カウンセリングシート・注意書きは専用ボタン側にあるためここには含めない。
export async function listKartes(clientId) {
  const all = await listCharts(clientId);
  return all.filter((ch) => !ch.role).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function getChart(id) {
  return db.get('charts', id);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// role を持つテンプレート（counseling/precautions）はタイトル固定・日付なし。
// role を持たないテンプレート（karte）は記入日（date）で管理する。
export async function createChart(clientId, templateId, date) {
  const tpl = getTemplate(templateId);
  if (!tpl) throw new Error('unknown template: ' + templateId);
  const now = Date.now();
  const chart = {
    id: uid('k_'),
    clientId,
    templateId,
    role: tpl.role || null,
    title: tpl.role ? tpl.name : null,
    date: tpl.role ? null : date || todayISO(),
    createdAt: now,
    updatedAt: now,
    pages: instantiatePages(tpl),
  };
  await db.put('charts', chart);
  await touchClient(clientId);
  return chart;
}

export async function saveChart(chart) {
  chart.updatedAt = Date.now();
  await db.put('charts', chart);
  await touchClient(chart.clientId);
  return chart;
}

export async function deleteChart(chart) {
  await db.delete('charts', chart.id);
  await touchClient(chart.clientId);
}

async function touchClient(clientId) {
  const c = await db.get('clients', clientId);
  if (c) {
    c.updatedAt = Date.now();
    await db.put('clients', c);
  }
}

// role（counseling / precautions）を持つ既存カルテを探す
export async function findChartByRole(clientId, role) {
  const all = await db.getAllByIndex('charts', 'by_client', clientId);
  return all.find((ch) => ch.role === role) || null;
}
