// データアダプタの差し替えポイント。
//
// store.js / export.js / app.js はこのファイルからしか db 機能を import しない。
// 今は IndexedDB（local-adapter.js）だが、Firebase / Supabase / PocketBase
// などの無料枠がある汎用 BaaS に移行する際は、下記「契約」を満たす別ファイル
// （例: firebase-adapter.js）を作り、下の re-export をそこに向けるだけでよい。
// 呼び出し側（store.js 等）の変更は不要な設計にしてある。
//
// ---- アダプタが満たすべき契約 ----
// db.get(store, key)              -> Promise<object|undefined>  1件取得
// db.getAll(store)                -> Promise<object[]>          全件取得
// db.getAllByIndex(store, idx, v) -> Promise<object[]>          idx==v で絞り込み
//   （store='charts', idx='by_client', v=clientId のように使う。Firestore なら
//    collection(store).where(idx相当のフィールド,'==',v) に、Supabase/PocketBase
//    なら該当カラムのフィルタにそのまま対応する）
// db.put(store, value)            -> Promise<key>               upsert（value.id をキーに）
// db.delete(store, key)           -> Promise<void>
// db.clear(store)                 -> Promise<void>               store の全削除（全置換インポート用）
// db.bulkPut(store, values[])     -> Promise<void>               複数件 upsert
// uid(prefix?)                    -> string                      新規レコードのID発行
// requestPersistentStorage()      -> Promise<boolean>            ローカル永続化要求（リモード実装は no-op でよい）
//
// store 名は 'clients' | 'charts' | 'settings' の3つ固定（templates.js/store.js 参照）。
// レコードは全て { id, ...} で、id をキーとして扱う（Firestoreならドキュメント
// ID、Supabase/PocketBaseなら主キーにそのまま使える文字列）。
//
// ---- 移行時のイメージ（例: Firebase Firestore） ----
// export const db = {
//   get: (store, key) => getDoc(doc(firestore, store, key)).then(s => s.exists() ? s.data() : undefined),
//   getAll: (store) => getDocs(collection(firestore, store)).then(qs => qs.docs.map(d => d.data())),
//   getAllByIndex: (store, idx, v) => {
//     const field = idx === 'by_client' ? 'clientId' : idx;
//     return getDocs(query(collection(firestore, store), where(field, '==', v))).then(qs => qs.docs.map(d => d.data()));
//   },
//   put: (store, value) => setDoc(doc(firestore, store, value.id), value).then(() => value.id),
//   delete: (store, key) => deleteDoc(doc(firestore, store, key)),
//   clear: (store) => getDocs(collection(firestore, store)).then(qs => Promise.all(qs.docs.map(d => deleteDoc(d.ref)))),
//   bulkPut: (store, values) => { const b = writeBatch(firestore); for (const v of values) b.set(doc(firestore, store, v.id), v); return b.commit(); },
// };
// // Firestore は端末オフラインキャッシュ＋オンライン復帰時の自動同期を標準搭載
// // （enableIndexedDbPersistence）なので、「オフライン必須」の要件はそのまま満たせる。
//
// 現在アクティブなアダプタ:
export { db, uid, requestPersistentStorage } from './local-adapter.js';
