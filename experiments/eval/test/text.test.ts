/**
 * 確定性比對的手寫參考用例（預期標籤由人工決定，不依賴產生器）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { containsTerm, extractFormatLine, matchAnswer, normalize, openChoiceKey, parseInteger, resolveOption } from '../lib/text.ts'

test('normalize：全形轉半形、去空白、去千分位、臺→台', () => {
  assert.equal(normalize('５２，０００ 元'), '52000元')
  assert.equal(normalize('52,000 元'), '52000元')
  assert.equal(normalize('12 月 13 日'), '12月13日')
  assert.equal(normalize('臺南 K7-QX-219'), '台南k7-qx-219')
})

test('containsTerm：數字邊界避免「14天」被「4天」命中', () => {
  assert.equal(containsTerm(normalize('隔了 14 天'), normalize('4天')), false)
  assert.equal(containsTerm(normalize('隔了 14 天'), normalize('14天')), true)
  assert.equal(containsTerm(normalize('共 114 天'), normalize('14天')), false)
  assert.equal(containsTerm(normalize('十四天'), normalize('四天')), false)
  assert.equal(containsTerm(normalize('大約四天'), normalize('四天')), true)
  assert.equal(containsTerm(normalize('5.1公斤'), normalize('5.1')), true)
  assert.equal(containsTerm(normalize('15.1公斤'), normalize('5.1')), false)
})

test('matchAnswer：命中、未命中、命中但有衝突值', () => {
  assert.equal(matchAnswer('你家的貓叫麻糬。', ['麻糬']).verdict, 'hit')
  assert.equal(matchAnswer('我不記得你的貓叫什麼。', ['麻糬']).verdict, 'miss')
  const ku = matchAnswer('你現在在海岬水族館上班（之前在青川植物園）。', ['海岬水族館'], ['青川植物園'])
  assert.equal(ku.verdict, 'ambiguous')
  assert.deepEqual(ku.conflicts, ['青川植物園'])
  assert.equal(matchAnswer('預算是 52,000 元台幣', ['52000']).verdict, 'hit')
  assert.equal(matchAnswer('預算調到五萬二了', ['52000', '五萬二']).verdict, 'hit')
})

test('extractFormatLine：容許全形冒號、粗體、引號、句號，取最後一行', () => {
  assert.equal(extractFormatLine('我想想……\n選擇：靛青', '選擇'), '靛青')
  assert.equal(extractFormatLine('理由很多。\n**選擇：** 「霧紫」。', '選擇'), '霧紫')
  assert.equal(extractFormatLine('選擇:苔綠\n後來改了\n選擇：琥珀', '選擇'), '琥珀')
  assert.equal(extractFormatLine('立場：看情況', '立場'), '看情況')
  assert.equal(extractFormatLine('我選靛青', '選擇'), undefined)
  assert.equal(extractFormatLine('選擇：', '選擇'), undefined)
})

test('resolveOption：完全相等優先；只含一個選項時採用；含兩個以上不判定', () => {
  const opts = ['可以', '不可以', '看情況']
  assert.equal(resolveOption('不可以', opts), '不可以')
  assert.equal(resolveOption('可以（但要小心）', opts), '可以')
  assert.equal(resolveOption('我認為不可以', opts), undefined)
  assert.equal(resolveOption('靛青', ['琥珀', '靛青']), '靛青')
})

test('parseInteger：阿拉伯數字、中文數字、含單位的短字串', () => {
  assert.equal(parseInteger('573'), 573)
  assert.equal(parseInteger('１,０２４'), 1024)
  assert.equal(parseInteger('七百三十'), 730)
  assert.equal(parseInteger('十二'), 12)
  assert.equal(parseInteger('573號'), 573)
  assert.equal(parseInteger('我喜歡 7 和 42'), undefined)
  assert.equal(parseInteger('沒有'), undefined)
})

test('openChoiceKey：去掉引號與標點後比較', () => {
  assert.equal(openChoiceKey('「雨靜」。'), openChoiceKey('雨靜'))
  assert.notEqual(openChoiceKey('雨靜'), openChoiceKey('靜雨'))
})
