// fake-indexeddb で本物同等の IndexedDB を用意し、adapter.js 経由で
// store.js を実際に動かす結合テスト（local-adapter.js の実コードも通る）。
import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  newClient,
  listClients,
  getClient,
  saveClient,
  deleteClient,
  listCharts,
  getChart,
  createChart,
  saveChart,
  deleteChart,
  findChartByRole,
} from '../js/store.js';
import { db } from '../js/data/adapter.js';

beforeEach(async () => {
  // テストごとに全ストアをクリアして独立させる
  await db.clear('clients');
  await db.clear('charts');
  await db.clear('settings');
});

describe('store.js（clients）', () => {
  test('newClient はデフォルト値と createdAt/updatedAt を持つ', () => {
    const c = newClient({ name: '山田太郎' });
    assert.equal(c.name, '山田太郎');
    assert.equal(c.goal, '');
    assert.ok(c.id.length > 0);
    assert.equal(typeof c.createdAt, 'number');
  });

  test('saveClient → listClients で保存・一覧取得できる', async () => {
    const c = newClient({ name: '佐藤花子' });
    await saveClient(c);
    const all = await listClients();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, '佐藤花子');
  });

  test('listClients は updatedAt 降順', async () => {
    const c1 = newClient({ name: 'A' });
    await saveClient(c1);
    await new Promise((r) => setTimeout(r, 5));
    const c2 = newClient({ name: 'B' });
    await saveClient(c2);
    const all = await listClients();
    assert.equal(all[0].name, 'B');
    assert.equal(all[1].name, 'A');
  });

  test('getClient: 存在しないIDはundefined', async () => {
    assert.equal(await getClient('nope'), undefined);
  });

  test('deleteClient は紐づくカルテも削除する（カスケード）', async () => {
    const c = newClient({ name: '削除太郎' });
    await saveClient(c);
    await createChart(c.id, 'session');
    await createChart(c.id, 'nutrition');
    assert.equal((await listCharts(c.id)).length, 2);

    await deleteClient(c.id);
    assert.equal(await getClient(c.id), undefined);
    assert.equal((await listCharts(c.id)).length, 0);
  });
});

describe('store.js（charts）', () => {
  let client;
  beforeEach(async () => {
    client = newClient({ name: 'テスト太郎' });
    await saveClient(client);
  });

  test('createChart はテンプレの role / title / pages を引き継ぐ', async () => {
    const ch = await createChart(client.id, 'counseling');
    assert.equal(ch.clientId, client.id);
    assert.equal(ch.role, 'counseling');
    assert.equal(ch.title, '初回カウンセリングシート');
    assert.ok(ch.pages.length > 1);
  });

  test('createChart は未知のtemplateIdでエラー', async () => {
    await assert.rejects(() => createChart(client.id, 'no-such-template'));
  });

  test('createChart はクライアントの updatedAt を更新する', async () => {
    const before = (await getClient(client.id)).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await createChart(client.id, 'session');
    const after = (await getClient(client.id)).updatedAt;
    assert.ok(after > before);
  });

  test('saveChart で値・ページのスキップ状態が永続化される', async () => {
    const ch = await createChart(client.id, 'session');
    ch.pages[1].values.foo = 'bar';
    ch.pages[2].skipped = true;
    await saveChart(ch);

    const reloaded = await getChart(ch.id);
    assert.equal(reloaded.pages[1].values.foo, 'bar');
    assert.equal(reloaded.pages[2].skipped, true);
  });

  test('listCharts は指定クライアントのカルテのみ返す', async () => {
    const other = newClient({ name: '別人' });
    await saveClient(other);
    await createChart(client.id, 'session');
    await createChart(other.id, 'nutrition');

    const mine = await listCharts(client.id);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].clientId, client.id);
  });

  test('findChartByRole は role で1件見つける・無ければnull', async () => {
    assert.equal(await findChartByRole(client.id, 'counseling'), null);
    const ch = await createChart(client.id, 'counseling');
    const found = await findChartByRole(client.id, 'counseling');
    assert.equal(found.id, ch.id);
  });

  test('deleteChart 後は一覧から消え、クライアントは残る', async () => {
    const ch = await createChart(client.id, 'session');
    await deleteChart(ch);
    assert.equal((await listCharts(client.id)).length, 0);
    assert.ok(await getClient(client.id));
  });
});
