import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, getTemplate, instantiatePages, BLANK_PAGE_KINDS, BODY_CHARTS } from '../js/templates.js';

describe('templates.js', () => {
  test('7種類のテンプレートが定義されている', () => {
    assert.equal(TEMPLATES.length, 7);
    const ids = TEMPLATES.map((t) => t.id);
    assert.deepEqual(
      [...ids].sort(),
      ['assessment', 'blank', 'body-composition', 'counseling', 'nutrition', 'precautions', 'session'].sort()
    );
  });

  test('role を持つのは counseling と precautions のみ', () => {
    const roled = TEMPLATES.filter((t) => t.role).map((t) => t.id).sort();
    assert.deepEqual(roled, ['counseling', 'precautions']);
  });

  test('getTemplate は id で引ける・存在しなければ null', () => {
    assert.equal(getTemplate('session').name, 'トレーニングセッション記録');
    assert.equal(getTemplate('nope'), null);
  });

  test('instantiatePages: 通常テンプレは先頭に顧客データページが付く', () => {
    const pages = instantiatePages(getTemplate('session'));
    assert.equal(pages[0].name, '顧客データ');
    assert.equal(pages[0].skippable, false);
    assert.equal(pages.length, getTemplate('session').pages.length + 1);
  });

  test('instantiatePages: skipHeaderPage を持つ precautions は顧客データページを省略', () => {
    const tpl = getTemplate('precautions');
    assert.equal(tpl.skipHeaderPage, true);
    const pages = instantiatePages(tpl);
    assert.equal(pages.length, tpl.pages.length);
    assert.notEqual(pages[0].name, '顧客データ');
    assert.equal(pages[0].name, '運動参加の注意事項');
  });

  test('counseling テンプレは「同意・署名」ページを持たない（注意書きチャートと重複するため削除済み）', () => {
    const pages = instantiatePages(getTemplate('counseling'));
    const names = pages.map((p) => p.name);
    assert.ok(!names.includes('同意・署名'));
    assert.equal(names[names.length - 1], '整形外科的既往・痛み');
  });

  test('instantiatePages: 各ページは独立したid/values/strokesを持つ（テンプレ本体を汚染しない）', () => {
    const tpl = getTemplate('body-composition');
    const a = instantiatePages(tpl);
    const b = instantiatePages(tpl);
    assert.notEqual(a[1].id, b[1].id);
    a[1].values.weight = '70';
    assert.equal(b[1].values.weight, undefined);
    assert.deepEqual(a[1].strokes, []);
  });

  test('全テンプレートのページは kind が form/note/canvas のいずれか', () => {
    for (const t of TEMPLATES) {
      for (const p of instantiatePages(t)) {
        assert.ok(['form', 'note', 'canvas'].includes(p.kind), `${t.id}/${p.name} kind=${p.kind}`);
      }
    }
  });

  test('table フィールドは columns を持つ', () => {
    for (const t of TEMPLATES) {
      for (const p of t.pages) {
        for (const f of p.fields || []) {
          if (f.type === 'table') {
            assert.ok(Array.isArray(f.columns) && f.columns.length > 0, `${t.id}/${p.name}/${f.key}`);
          }
        }
      }
    }
  });

  test('canvas ページに bg 指定があれば BODY_CHARTS に実体がある', () => {
    for (const t of TEMPLATES) {
      for (const p of t.pages) {
        if (p.kind === 'canvas' && p.bg) {
          assert.ok(BODY_CHARTS[p.bg], `unknown bg: ${p.bg}`);
        }
      }
    }
  });

  test('BLANK_PAGE_KINDS は form/note/canvas の3種', () => {
    assert.deepEqual(BLANK_PAGE_KINDS.map((k) => k.kind).sort(), ['canvas', 'form', 'note']);
  });

  test('blank テンプレは顧客データ+白紙noteページの2ページから始まる', () => {
    const pages = instantiatePages(getTemplate('blank'));
    assert.equal(pages.length, 2);
    assert.equal(pages[0].name, '顧客データ');
    assert.equal(pages[1].kind, 'note');
  });
});
