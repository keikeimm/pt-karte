// カルテテンプレート定義と、手書きページの背景（人体図）。
// カルテの種類は1種類（karte）＋カウンセリングシート／注意書き（役割固定）のみ。
// karte の各ページが「既存のタブ」＝各項目 + 白紙の手書き欄になる。
//
// pageDef = { name, kind:'form'|'note'|'canvas', skippable, bg, fields:[fieldDef] }
// fieldDef.type = 'heading'|'text'|'textarea'|'number'|'date'|'select'
//               |'checkbox'|'yesno'|'table'|'static'|'sign'

// ---- 人体図 / 姿勢図（canvas 背景に敷く SVG） ----
const BODY_FRONT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320">
  <g fill="none" stroke="#9aa4b2" stroke-width="1.6">
    <circle cx="100" cy="28" r="16"/>
    <path d="M100 44 L100 60 M72 74 Q100 62 128 74 L134 150 Q100 160 66 150 Z"/>
    <path d="M72 76 L52 150 L44 200 M128 76 L148 150 L156 200"/>
    <path d="M84 158 L80 250 L74 306 M116 158 L120 250 L126 306"/>
    <path d="M66 150 Q100 168 134 150"/>
  </g>
  <text x="100" y="318" text-anchor="middle" font-size="9" fill="#9aa4b2">前面</text>
</svg>`;

const BODY_BACK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320">
  <g fill="none" stroke="#9aa4b2" stroke-width="1.6">
    <circle cx="100" cy="28" r="16"/>
    <path d="M100 44 L100 60 M72 74 Q100 62 128 74 L134 150 Q100 160 66 150 Z"/>
    <path d="M72 76 L52 150 L44 200 M128 76 L148 150 L156 200"/>
    <path d="M84 158 L80 250 L74 306 M116 158 L120 250 L126 306"/>
    <path d="M100 60 L100 150 M78 96 L122 96"/>
  </g>
  <text x="100" y="318" text-anchor="middle" font-size="9" fill="#9aa4b2">背面</text>
</svg>`;

const POSTURE_SIDE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320">
  <g fill="none" stroke="#9aa4b2" stroke-width="1.6">
    <line x1="100" y1="8" x2="100" y2="312" stroke-dasharray="4 4"/>
    <circle cx="100" cy="30" r="14"/>
    <path d="M100 44 Q104 90 100 150 Q96 200 108 250 L120 306"/>
    <path d="M100 150 Q92 200 84 250 L76 306"/>
    <path d="M100 70 Q120 96 112 140"/>
  </g>
  <text x="100" y="318" text-anchor="middle" font-size="9" fill="#9aa4b2">矢状面（側方）</text>
</svg>`;

const POSTURE_FRONT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320">
  <g fill="none" stroke="#9aa4b2" stroke-width="1.6">
    <line x1="100" y1="8" x2="100" y2="312" stroke-dasharray="4 4"/>
    <line x1="40" y1="80" x2="160" y2="80" stroke-dasharray="2 4"/>
    <line x1="40" y1="150" x2="160" y2="150" stroke-dasharray="2 4"/>
    <circle cx="100" cy="30" r="14"/>
    <path d="M100 44 L100 60 M64 80 Q100 64 136 80 L140 150 Q100 160 60 150 Z"/>
    <path d="M64 82 L44 160 M136 82 L156 160"/>
    <path d="M82 158 L78 306 M118 158 L122 306"/>
  </g>
  <text x="100" y="318" text-anchor="middle" font-size="9" fill="#9aa4b2">前額面（正面）</text>
</svg>`;

export const BODY_CHARTS = {
  'body-front': BODY_FRONT,
  'body-back': BODY_BACK,
  'posture-side': POSTURE_SIDE,
  'posture-front': POSTURE_FRONT,
};

const parqQuestions = [
  '医師から心臓病があると言われ、医師の勧める範囲でのみ運動するように言われたことがありますか',
  '運動をすると胸に痛みを感じることがありますか',
  'この1か月で、運動していないときに胸の痛みがありましたか',
  'めまいでふらついたり、意識を失ったことがありますか',
  '運動によって悪化する骨・関節の問題がありますか',
  '血圧・心臓の薬など、医師から処方されている薬がありますか',
  '運動をしない方がよい理由が他にありますか',
];

// ---- テンプレート本体（3種類のみ） ----
export const TEMPLATES = [
  {
    id: 'counseling',
    name: '初回カウンセリングシート',
    short: 'カウンセリング',
    icon: '📋',
    role: 'counseling',
    description: '目標・生活習慣・食事・運動歴・医学スクリーニング',
    pages: [
      {
        name: '目標・運動歴',
        kind: 'form',
        fields: [
          { type: 'textarea', key: 'mainGoal', label: '主な目標', rows: 2 },
          { type: 'textarea', key: 'concerns', label: '不安・過去に続かなかった理由', rows: 2 },
          { type: 'text', key: 'currentExercise', label: '現在の運動習慣' },
          { type: 'textarea', key: 'sportHistory', label: 'これまでの運動・競技歴', rows: 2 },
        ],
      },
      {
        name: '生活・食習慣',
        kind: 'form',
        fields: [
          { type: 'number', key: 'sleepHours', label: '睡眠時間（h）' },
          { type: 'select', key: 'smoke', label: '喫煙', options: ['なし', '過去', 'あり'] },
          { type: 'text', key: 'alcohol', label: '飲酒（頻度・量）' },
          { type: 'select', key: 'activity', label: '日常の活動量', options: ['座位中心', '普通', '活動的'] },
          { type: 'number', key: 'meals', label: '1日の食事回数' },
          { type: 'text', key: 'snack', label: '間食・嗜好品' },
          { type: 'text', key: 'water', label: '水分摂取量（L/日）' },
          { type: 'textarea', key: 'allergy', label: 'アレルギー・苦手な食品', rows: 2 },
        ],
      },
      {
        name: '医学スクリーニング（PAR-Q+）',
        kind: 'form',
        fields: [
          { type: 'heading', label: '以下に該当する場合は「はい」' },
          ...parqQuestions.map((q, i) => ({
            type: 'yesno',
            key: 'parq' + (i + 1),
            label: q,
          })),
          { type: 'textarea', key: 'meds', label: '服用中の薬', rows: 2 },
          { type: 'textarea', key: 'history', label: '既往歴・手術歴', rows: 2 },
          { type: 'text', key: 'bp', label: '血圧（安静時）' },
          { type: 'textarea', key: 'parqNote', label: '補足（「はい」の詳細）', rows: 2 },
        ],
      },
      {
        name: '整形外科的既往・痛み',
        kind: 'canvas',
        bg: 'body-front',
        fields: [
          { type: 'textarea', key: 'painNote', label: '痛み・違和感・可動制限のメモ', rows: 3 },
        ],
      },
    ],
  },

  {
    id: 'precautions',
    name: '注意事項・免責同意書',
    short: '注意書き',
    icon: '⚠️',
    role: 'precautions',
    description: '運動参加の注意事項・免責（緊急連絡先は顧客の基本情報を参照）',
    pages: [
      {
        name: '運動参加の注意事項',
        kind: 'form',
        skippable: false,
        fields: [
          {
            type: 'static',
            key: '_precautionText',
            text:
              '・体調不良（発熱・強い倦怠感・睡眠不足・二日酔い等）の場合は無理をせず申告してください。\n' +
              '・トレーニング中にめまい・胸の痛み・強い息切れ・関節痛が出た場合はすぐに中止し、伝えてください。\n' +
              '・持病、服薬、ケガ、手術歴、妊娠の可能性は必ず事前に共有してください。\n' +
              '・指導者の指示に従い、無理な重量・回数は行わないでください。\n' +
              '・水分をこまめに補給し、体調に異変を感じたら遠慮なく休憩してください。',
          },
          { type: 'checkbox', key: 'readPrecautions', label: '注意事項を読み、理解しました' },
        ],
      },
      {
        name: '免責・キャンセルポリシー',
        kind: 'form',
        skippable: false,
        fields: [
          {
            type: 'static',
            key: '_waiverText',
            text:
              '本人の体調・既往に起因する事故について、事前申告がない場合は施設・トレーナーは責任を負いかねます。\n' +
              'キャンセルは前日までにご連絡ください。当日キャンセル・無断キャンセルは1回分の消化となります。',
          },
          { type: 'checkbox', key: 'agreeWaiver', label: '免責事項・キャンセルポリシーに同意します' },
          { type: 'date', key: 'signDate', label: '記入日' },
          { type: 'sign', key: 'signature', label: '本人署名' },
        ],
      },
    ],
  },

  {
    id: 'karte',
    name: 'カルテ',
    short: 'カルテ',
    icon: '📝',
    description: '記入日で管理。各項目（コンディション・メニュー/測定）＋白紙の手書き欄をタブで切替',
    pages: [
      {
        name: '本日の記録',
        kind: 'form',
        skippable: false,
        fields: [
          { type: 'select', key: 'condition', label: '体調', options: ['良い', '普通', '不調'] },
          { type: 'number', key: 'sleepHours', label: '睡眠時間（h）' },
          { type: 'number', key: 'weight', label: '体重（kg）' },
          { type: 'number', key: 'bodyFat', label: '体脂肪率（%）' },
          { type: 'textarea', key: 'memo', label: 'メモ', rows: 3 },
        ],
      },
      {
        name: 'メニュー・測定記録',
        kind: 'form',
        fields: [
          {
            type: 'table',
            key: 'items',
            label: '種目・測定項目',
            columns: [
              { key: 'name', label: '種目・項目', type: 'text' },
              { key: 'value', label: '重量・数値', type: 'text' },
              { key: 'reps', label: '回数・セット', type: 'text' },
              { key: 'note', label: 'メモ', type: 'text' },
            ],
            rows: Array.from({ length: 6 }, () => ({})),
          },
        ],
      },
      {
        name: '白紙（手書き・自由記述）',
        kind: 'canvas',
        fields: [
          { type: 'textarea', key: 'note', label: '自由記述', rows: 3 },
        ],
      },
    ],
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

// テンプレートから実カルテの pages 配列を生成する。
// 顧客データはクライアント詳細画面・エディタ上部のサマリーに既出のため、
// ページ（タブ）としては持たせない。
export function instantiatePages(template) {
  return template.pages.map((p, idx) => ({
    id: 'p' + idx + '-' + Math.random().toString(36).slice(2, 7),
    name: p.name,
    kind: p.kind || 'form',
    skippable: p.skippable !== false,
    skipped: false,
    bg: p.bg || null,
    placeholder: p.placeholder || '',
    fields: (p.fields || []).map((f) => ({ ...f })),
    values: {},
    text: '',
    strokes: [],
  }));
}
