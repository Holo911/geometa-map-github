import type { en } from './en';

// 日本語 UI dictionary.
// Aim: how a real app would phrase it — concise, polite-neutral (です/ます where a
// sentence is needed, plain noun phrases for labels/buttons), no keigo overkill
// and no literal translations of English sentence structure.
export const ja: Record<keyof typeof en, string> = {
  // ---- common ----
  'common.close': '閉じる',
  'common.cancel': 'キャンセル',
  'common.done': '完了',
  'common.confirm': '確認',
  'common.remove': '削除',
  'common.delete': '削除',
  'common.edit': '編集',
  'common.open': '開く',
  'common.replace': '差し替え',
  'common.loading': '読み込み中…',
  'common.loadingMap': '地図データを読み込み中…',
  'common.dismiss': '（クリックで閉じる）',
  'common.previous': '前へ',
  'common.next': '次へ',

  // ---- HUD / toolbar ----
  'hud.byCountry': '国別',
  'hud.byCategory': 'カテゴリ別',
  'toolbar.search': '検索',
  'toolbar.searchTitle': '国を検索（Ctrl+K）',
  'toolbar.roads': '道路',
  'toolbar.roadsTitle': '道路レイヤー — 実際に道路がある場所を表示',
  'toolbar.settings': '設定',

  // ---- legend ----
  'legend.title': '凡例',
  'legend.drivesRight': '右側通行',
  'legend.drivesLeft': '左側通行',
  'legend.covered': 'カバー済み',
  'legend.limited': '限定カバレッジ',
  'legend.hasNotes': 'メモあり',
  'legend.noCoverage': 'カバレッジなし',
  'legend.roads': '道路（🛣）',

  // ---- category rail ----
  'rail.browseByCategory': 'カテゴリから探す',
  'rail.tags': 'タグ',
  'rail.noTags': 'タグはまだありません。メモから追加できます。',
  'rail.clear': '✕ ハイライトを解除',

  // ---- country panel ----
  'panel.notes': 'メモ',
  'panel.territories': '海外領土',
  'panel.studyMode': '学習モード（F）',
  'panel.exitStudyMode': '学習モードを終了（F）',
  'panel.closeEsc': '閉じる（Esc）',
  'panel.clearFilter': 'フィルターを解除',
  'panel.zoomHere': 'ここにズーム',
  'panel.offscreenZoom': '画面外 — クリックでズーム',
  'panel.partOf': '‹ {name}の一部',
  'panel.mainland': '本土',
  'panel.islands': '島嶼部',
  'panel.allParts': 'すべて',
  'panel.noteCount_one': 'メモ{n}件',
  'panel.noteCount_other': 'メモ{n}件',

  // ---- country ID card ----
  'idcard.domain': 'ドメイン',
  'idcard.phone': '電話番号',
  'idcard.currency': '通貨',
  'idcard.drives': '通行',
  'idcard.language': '言語',
  'idcard.coverage': 'カバレッジ',
  'idcard.drivesLeft': '左側',
  'idcard.drivesRight': '右側',
  'idcard.limited': '限定',
  'idcard.domainTitle': 'トップレベルドメイン',
  'idcard.phoneTitle': '国番号',
  'idcard.drivesTitle': '通行区分',
  'idcard.limitedTitle': 'トレッカー中心の限定的なカバレッジ',

  // ---- alphabet block ----
  'alphabet.addChart': '+ 画像',
  'alphabet.dropHint': '文字表を貼り付け／ドロップ',
  'alphabet.enlarge': 'クリックで拡大',
  'alphabet.caption': '{name} — 文字',

  // ---- feed ----
  'feed.addFirstNote': '最初のメモを追加…',
  'feed.addNote': 'メモを追加…',
  'feed.more': 'もっと見る',
  'feed.less': '閉じる',
  'feed.untitled': '無題のメモ',
  'feed.deleteConfirm': 'このメモを削除しますか？',
  'feed.addTo': 'メモを追加',
  'feed.addToCategory': '{name}に追加',

  // ---- entry editor ----
  'editor.newNote': '新しいメモ',
  'editor.editNote': 'メモを編集',
  'editor.category': 'カテゴリ',
  'editor.titleField': 'タイトル（任意）',
  'editor.bodyField': 'メモ（Markdown）',
  'editor.pickBanner': '🗺 地図で都道府県・州をクリックして選びます。',
  'editor.donePicking': '選択を終了',
  'editor.picking': '✓ 選択中',
  'editor.noRegions': '該当する地域がありません。',
  'editor.dropzone': 'スクリーンショットを貼り付け（Ctrl+V）、画像をドラッグ、または',
  'editor.ctrlEnter': 'Ctrl+Enter で保存',
  'editor.titlePlaceholder': '例：軽自動車の黄色いナンバープレート',
  'editor.bodyPlaceholder':
    '手がかりを書く…  **太字**、- 箇条書き、`コード` が使えます。スクリーンショットはどこにでも貼り付けできます。',
  'editor.tags': 'タグ',
  'editor.newTagPlaceholder': '新しいタグ名…',
  'editor.createTag': '+ 作成',
  'editor.editTagColors': 'このタグを編集',
  'editor.tagSecondColor': '2色目（任意）',
  'editor.tagNoSecondColor': '2色目なし',
  'editor.appliesTo': '適用範囲',
  'editor.wholeCountry': '国全体',
  'editor.specificRegions': '地域を指定',
  'editor.pickOnMap': '🗺 地図で選ぶ',
  'editor.browse': 'ファイルを選択',
  'editor.dropzoneEnd': '',
  'editor.searchRegions': '地域を検索…',
  'editor.screenshots': 'スクリーンショット',
  'editor.captionPlaceholder': 'キャプション',
  'editor.save': '保存',
  'editor.addNote': 'メモを追加',
  'editor.saving': '保存中…',
  'editor.unsaved': '編集内容を破棄しますか？',
  'editor.keepEditing': '編集を続ける',
  'editor.discard': '破棄',
  'editor.regionsSelected_one': '{n}地域を選択中',
  'editor.regionsSelected_other': '{n}地域を選択中',

  // ---- search palette ----
  'search.placeholder': '国を検索…（カバー済みの国を選べます）',
  'search.notCovered': '対象外',
  'search.noCoverageTitle': 'ストリートビュー未対応',
  'search.noResults': '「{q}」に一致する国はありません。',
  'search.uncoveredTag': '対象外',
  'search.hint': '↑↓ 移動 · ↵ 開く · esc 閉じる',

  // ---- offscreen cue ----
  'cue.count_one': 'ほかに{n}か所：',
  'cue.count_other': 'ほかに{n}か所：',

  // ---- coverage edit ----
  'coverage.banner': '✎ カバレッジ編集 — 国をクリックすると 全体 → 限定 → なし の順で切り替わります。',

  // ---- settings ----
  'settings.title': '⚙ 設定',
  'settings.language': '言語',
  'settings.mapAppearance': '地図の表示',
  'settings.colorBySide': '通行区分で色分けする',
  'settings.colorBySideHint':
    'オン：右側通行は青、左側通行は紫。オフ：すべて同じ色で表示します。',
  'settings.limitedAsUncovered': '限定カバレッジを対象外として扱う',
  'settings.limitedAsUncoveredHint': 'トレッカーなど部分的なカバレッジしかない国を隠します。',
  'settings.uncoveredCountries': '対象外の国',
  'settings.dim': '暗くする',
  'settings.hide': '非表示',
  'settings.coverage': 'カバレッジ',
  'settings.editCoverage': '✎ 地図上でカバレッジを編集',
  'settings.editCoverageHint':
    '国をクリックするたびに 全体 → 限定 → なし と切り替わるモードです。新しく追加された国などの調整に使えます。内蔵のリストに上書きして保存されます。',
  'settings.experimental': '実験的機能',
  'settings.svOverlay': 'ストリートビューのカバレッジ表示',
  'settings.svOverlayHintA': 'Google の実際のカバレッジ（青い線）を地図に重ねます。',
  'settings.svOverlayHintBold': '非公式のエンドポイント',
  'settings.svOverlayHintB':
    'を使っているため、個人利用のみを想定しています。動作が重くなったり、突然使えなくなることがあります。タイルを読み込めない場合は何も表示されません。',
  'settings.categories': 'カテゴリ',
  'settings.moveUp': '上へ',
  'settings.moveDown': '下へ',
  'settings.deleteCategory': '削除（メモはその他へ移動）',
  'settings.miscCannotDelete': '「その他」は削除できません',
  'settings.addCategory': '+ カテゴリを追加',
  'settings.newCategory': '新しいカテゴリ',
  'settings.backup': 'バックアップと復元',
  'settings.export': '⬇ バックアップを書き出す（.zip）',
  'settings.import': '⬆ バックアップを読み込む…',
  'settings.backupHint':
    '書き出すと、データベースとスクリーンショットをまとめた zip をダウンロードします。読み込むと現在のデータは置き換えられますが、その前に data-backup-… フォルダーへコピーされます。',
  'settings.importConfirm': '現在のデータをすべて「{name}」に置き換えますか？',
  'settings.importReplace': '読み込んで置き換える',
  'settings.importing': '読み込み中…',
  'settings.movedToMisc_one': 'メモ{n}件を「その他」へ移動しました。',
  'settings.movedToMisc_other': 'メモ{n}件を「その他」へ移動しました。',

  // ---- toasts ----
  'toast.imported': 'バックアップを読み込みました。以前のデータは {name}/ に保存しています。',

  // ---- default category names ----
  'cat.licensePlates': 'ナンバープレート',
  'cat.bollards': 'ボラード',
  'cat.roadLines': '路面標示',
  'cat.signs': '標識',
  'cat.utilityPoles': '電柱',
  'cat.language': '言語と文字',
  'cat.architecture': '建築',
  'cat.landscape': '風景と植生',
  'cat.roads': '道路と路肩',
  'cat.googleCar': 'グーグルカーとカメラ世代',
  'cat.phoneDomains': '国番号とドメイン',
  'cat.misc': 'その他',


};
