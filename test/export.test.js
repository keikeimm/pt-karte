import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './setup/dom-env.js';

installDom();
// download() は <a>.click() でファイル保存を発火する。jsdomは実ナビゲーション
// を持たないため click() を差し替えて「何がダウンロードされようとしたか」を記録する。
const downloads = [];
window.HTMLAnchorElement.prototype.click = function () {
  downloads.push({ href: this.href, download: this.download });
};

const { db } = await import('../js/data/adapter.js');
const { newClient, saveClient, createChart } = await import('../js/store.js');
const { exportClient, exportAll, importFile } = await import('../js/export.js');

function fakeFile(obj) {
  const text = JSON.stringify(obj);
  return { text: async () => text };
}

beforeEach(async () => {
  await db.clear('clients');
  await db.clear('charts');
  downloads.length = 0;
});

describe('export.js', () => {
  test('exportClient: そのクライアントのカルテだけを書き出す', async () => {
    const c = newClient({ name: '山田太郎' });
    await saveClient(c);
    await createChart(c.id, 'session');
    const filename = await exportClient(c);

    assert.equal(downloads.length, 1);
    assert.ok(filename.startsWith('karte_山田太郎_'));
    assert.ok(filename.endsWith('.json'));
    assert.equal(downloads[0].download, filename);
    assert.match(downloads[0].href, /^blob:/);
  });

  test('exportClient: ファイル名の危険な文字は安全化される', async () => {
    const c = newClient({ name: '山田/太郎:テスト?' });
    await saveClient(c);
    const filename = await exportClient(c);
    assert.doesNotMatch(filename, /[/:?]/);
  });

  test('exportAll: 全クライアント・全カルテをまとめて書き出す', async () => {
    const c1 = newClient({ name: 'A' });
    const c2 = newClient({ name: 'B' });
    await saveClient(c1);
    await saveClient(c2);
    await createChart(c1.id, 'session');
    const filename = await exportAll();
    assert.ok(filename.startsWith('karte_backup_'));
    assert.equal(downloads.length, 1);
  });

  test('importFile: kind=all をマージで読み込める', async () => {
    const backup = {
      format: 'pt-karte-backup', version: 1, kind: 'all',
      clients: [newClient({ id: 'c1', name: '復元太郎' })],
      charts: [],
    };
    const result = await importFile(fakeFile(backup), { merge: true });
    assert.equal(result.clients, 1);
    assert.equal(result.charts, 0);
    const restored = await db.get('clients', 'c1');
    assert.equal(restored.name, '復元太郎');
  });

  test('importFile: merge=false は既存データを消してから読み込む', async () => {
    const existing = newClient({ name: '既存太郎' });
    await saveClient(existing);

    const backup = {
      format: 'pt-karte-backup', version: 1, kind: 'all',
      clients: [newClient({ id: 'c2', name: '新規花子' })],
      charts: [],
    };
    await importFile(fakeFile(backup), { merge: false });

    const all = await db.getAll('clients');
    assert.equal(all.length, 1);
    assert.equal(all[0].name, '新規花子');
  });

  test('importFile: 対応していない形式は例外', async () => {
    await assert.rejects(
      () => importFile(fakeFile({ format: 'other' })),
      /対応していないファイル形式/
    );
  });

  test('importFile: 不明な kind は例外', async () => {
    await assert.rejects(
      () => importFile(fakeFile({ format: 'pt-karte-backup', kind: 'mystery' })),
      /不明なバックアップ種別/
    );
  });

  test('importFile: kind=client は1クライアント分として読み込む', async () => {
    const backup = {
      format: 'pt-karte-backup', version: 1, kind: 'client',
      client: newClient({ id: 'c3', name: '単体太郎' }),
      charts: [{ id: 'k1', clientId: 'c3', templateId: 'session', title: 't', pages: [] }],
    };
    const result = await importFile(fakeFile(backup), { merge: true });
    assert.equal(result.clients, 1);
    assert.equal(result.charts, 1);
  });
});
