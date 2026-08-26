import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCardText } from '../parse-card.mjs'

// Fixtures below are the ACTUAL rendered text captured live from
// pokemon-card.com on 2026-08-17 via browser automation (get_page_text),
// not fabricated. Used verbatim as regression fixtures.

const LEIFEON_VSTAR = `リーフィアVSTAR
012 / 172

イラストレーター
PLANETA Hiiragi
V進化 HP 260 タイプ
ワザ
リーフガード
180

次の相手の番、このポケモンが受けるワザのダメージは「-30」される。

VSTARパワー
特性
アイビースター

自分の番に使える。相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。［対戦中、自分はVSTARパワーを1回しか使えない。］

特別なルール

ポケモンVSTARがきぜつしたとき、相手はサイドを2枚とる。

弱点 抵抗力 にげる
×2 --
進化
リーフィアVMAX
リーフィアVSTAR
リーフィアV

ハイクラスパック 「VSTARユニバース」

CLOSE
ポケモンカードゲーム トレーナーズウェブサイト`

const BASIC_GRASS_ENERGY = `基本草エネルギー

基本エネルギー

ポケモンカードゲームDP エントリーパック
ポケモンカードゲームDP ランダム構築スターター スタンダードデッキ
ポケモンカードゲームDP 拡張パック「時空の創造 パールコレクション」

CLOSE
ポケモンカードゲーム トレーナーズウェブサイト`

// Captured live 2026-08-17, id 49500 (real dry-run smoke test target, real MC set).
// Used to (a) verify Japanese text survives the real fetch/decode/parse pipeline intact
// (root-cause investigation for a reported "mojibake" symptom -- see extract-image.mjs's
// header comment: the page itself is genuine UTF-8, verified live via document.characterSet
// + <meta charset="utf-8">, so this fixture round-tripping correctly is expected, and
// documents that no corruption happens in parseCardText/htmlToText specifically), and
// (b) document a real, separate gap: this product's set-name line has NO 「」 brackets
// around it ("スタートデッキ100 バトルコレクション" appears as plain text, unlike e.g.
// "ハイクラスパック「VSTARユニバース」"), so the existing bracket-based primarySetName
// heuristic in parseCardText finds nothing for this real page. Not fixed here (out of
// scope for this pass) -- extractSetCode() in extract-image.mjs reads the official set
// code from the image path instead, which is unaffected by this gap.
const ARIGEITSU_MC = `アリゲイツ
167 / 742
No.159 おおあごポケモン

高さ：1.1 m 重さ：25.0 kg

キバは 抜けても 次から 次に 生えてくる。 いつも 口の中には ４８本の キバが そろっている。

イラストレーター
Felicia Chen
1 進化 HP 100 タイプ
ワザ
かみくだく
50

コインを1回投げオモテなら、相手のバトルポケモンについているエネルギーを1個選び、トラッシュする。

弱点 抵抗力 にげる
×2 --
進化
オーダイル
メガオーダイルex
アリゲイツ
ワニノコ

スタートデッキ100 バトルコレクション

CLOSE
ポケモンカードゲーム トレーナーズウェブサイト`

const SEARCH_REDIRECT_PAGE = `カード
Q&A
検索
レギュレーション
スタンダード
エクストラ
殿堂
すべてのカード
トップ カード検索
139
件
143ページ中 1ページ目`

test('parseCardText: carta moderna valida -> nome/numero/illustratore/set estratti correttamente', () => {
  const r = parseCardText(LEIFEON_VSTAR, { id: 42273 })
  assert.equal(r.found, true)
  assert.equal(r.name, 'リーフィアVSTAR')
  assert.equal(r.cardNumber, '012/172')
  assert.equal(r.illustrator, 'PLANETA Hiiragi')
  assert.equal(r.primarySetName, 'VSTARユニバース')
  assert.equal(r.supertypeGuess, 'pokemon')
  assert.equal(r.officialSourceId, '42273')
})

test('parseCardText: energia base ristampata in molti set -> tutti i set raccolti, nessun crash', () => {
  const r = parseCardText(BASIC_GRASS_ENERGY, { id: 1 })
  assert.equal(r.found, true)
  assert.equal(r.name, '基本草エネルギー')
  assert.equal(r.cardNumber, null) // le energie base non hanno "N / M" su questa pagina
  assert.equal(r.supertypeGuess, 'energy')
  assert.ok(r.setNames.length >= 1)
})

test('parseCardText: pagina di redirect (id inesistente) -> found:false, nessun campo inventato', () => {
  const r = parseCardText(SEARCH_REDIRECT_PAGE, { id: 999999 })
  assert.equal(r.found, false)
  assert.equal(r.name, null)
  assert.equal(r.cardNumber, null)
})

test('parseCardText: carta reale MC (id 49500) -> testo giapponese corretto end-to-end, nessuna mojibake introdotta dalla pipeline', () => {
  const r = parseCardText(ARIGEITSU_MC, { id: 49500 })
  assert.equal(r.found, true)
  assert.equal(r.name, 'アリゲイツ')
  assert.equal(r.cardNumber, '167/742')
  assert.equal(r.illustrator, 'Felicia Chen')
  // Gap noto (documentato, non corretto in questo pass): nessuna coppia 「...」 su questa
  // pagina reale -> setNames vuoto, primarySetName null. Il set ufficiale reale (MC) va
  // preso da extractSetCode() sull'URL immagine, non da questo campo, per questo prodotto.
  assert.deepEqual(r.setNames, [])
  assert.equal(r.primarySetName, null)
})

test('htmlToText: rimuove script/style e tag, preserva il testo visibile', async () => {
  const { htmlToText } = await import('../parse-card.mjs')
  const html = '<html><head><script>evil()</script></head><body><h1>Test</h1><p>Ciao</p></body></html>'
  const text = htmlToText(html)
  assert.ok(!text.includes('evil()'))
  assert.ok(text.includes('Test'))
  assert.ok(text.includes('Ciao'))
})

// --- Regressione: <head>/<title> inquinava discovered.name (diagnosticato dal vivo sul
// dry-run reale 49500-49510, id 49501/MC-169) ---
//
// Il documento REALE restituito da fetch() per una pagina carta è un documento HTML
// completo: <head><title>{NomeCarta} | ポケモンカードゲーム公式ホームページ</title>...
// </head><body>...{NomeCarta} reale nel markup visibile...</body>. Prima del fix,
// htmlToText() convertiva <head>/<title> in una riga di testo come ogni altro tag, quindi
// quella riga (il title della pagina, non il nome carta) diventava lines[0] e
// parseCardText() la usava come nameLine/discovered.name -- rompendo il name match a
// valle in match-confidence.mjs anche quando il nome vero e proprio era corretto e
// identico su entrambi i lati. Verificato dal vivo: id 49500-49510, 11/11 AMBIGUOUS grade
// D, tutti con lo stesso pattern "{Nome} | ポケモンカードゲーム公式ホームページ".
test('htmlToText + parseCardText: documento reale con <head><title>NomeCarta | ポケモンカードゲーム公式ホームページ</title></head> -> il title NON diventa name, il nome viene estratto dal <body>', async () => {
  const { htmlToText } = await import('../parse-card.mjs')
  // Forma realistica del documento reale (verificata dal vivo per id 49501, MC-169):
  // stesso pattern di title osservato su TUTTI gli id del range 49500-49510.
  const REAL_SHAPED_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>メガオーダイルex | ポケモンカードゲーム公式ホームページ</title>
<meta name="description" content="メガオーダイルexのカード情報です。">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="cardDetail">
メガオーダイルex
169 / 742
イラストレーター
5ban Graphics
</div>
<footer>ポケモンカードゲーム トレーナーズウェブサイト</footer>
</body>
</html>`

  const text = htmlToText(REAL_SHAPED_HTML)
  // Il title della pagina non deve comparire più da nessuna parte nel testo estratto --
  // rimosso insieme al resto di <head>, non solo "scavalcato" come prima riga.
  assert.ok(!text.includes('ポケモンカードゲーム公式ホームページ'), 'il testo del <title> non deve sopravvivere all\'estrazione')

  const r = parseCardText(text, { id: 49501 })
  assert.equal(r.found, true)
  // Il nome estratto è quello reale del <body>, mai il title della pagina.
  assert.equal(r.name, 'メガオーダイルex')
  assert.ok(!r.name.includes('|'), 'discovered.name non deve contenere il separatore del title della pagina')
  assert.ok(!r.name.includes('公式ホームページ'), 'discovered.name non deve contenere il suffisso del sito')
  assert.equal(r.cardNumber, '169/742')
  assert.equal(r.illustrator, '5ban Graphics')
})

test('htmlToText + parseCardText: documento HTML senza <head>/<title> -> comportamento invariato dal fix (no-op quando il tag non c\'è)', async () => {
  const { htmlToText } = await import('../parse-card.mjs')
  const html = `<html><body>
アリゲイツ
167 / 742
イラストレーター
Felicia Chen
スタートデッキ100 バトルコレクション
</body></html>`
  const text = htmlToText(html)
  const r = parseCardText(text, { id: 49500 })
  assert.equal(r.found, true)
  assert.equal(r.name, 'アリゲイツ')
  assert.equal(r.cardNumber, '167/742')
  assert.equal(r.illustrator, 'Felicia Chen')
})
