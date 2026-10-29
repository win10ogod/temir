/**
 * v3 資料集：與 v1、v2 不重疊、模擬時間與日期核對（黃金答案由 session 日期換算）、覆蓋與洩漏檢查。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditCoverage } from '../coverage.ts'
import { loadContract } from '../lib/contract.ts'
import { loadDataset, type Dataset } from '../lib/dataset.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ds = (name: string) => loadDataset(join(root, 'datasets', `${name}.json`)).dataset
const allText = (d: Dataset) => JSON.stringify({ histories: d.histories, probes: d.probes })
const squash = (s: string) => s.normalize('NFKC').replace(/\s+/gu, '')

/** v2 的人物與專名（人工列出）；v1 的列表見 datasets-v2.test.ts。v3 都不得沿用。 */
const V2_ENTITIES = [
  '鍾子珩', '慈岸', '吉安鄉', '小滿', '林沛晴', '沛晴', '陶藝', '阿福', '柴犬', '朴恩智', '首爾韓語', 'Fedora', '陳柏鈞', '鯨魚書屋', '向日葵',
  '海星', '壽豐', '雲朵郵差', '小雨蛙', '太魯閣', '台東', '後搖', '咖啡', '羽球', '圍棋', '韓文', '心悸', '低磷', 'RX-5804-QL', '山高月小',
  '阿凱', '可樂', '吉他', '馬拉松', '台北', '花生', '電鍋',
]

test('v3 與 v1、v2 不重疊：專名、證據原文、題目與歷史原句', () => {
  const v3 = squash(allText(ds('memory-v3')))
  for (const e of V2_ENTITIES) assert.ok(!v3.includes(squash(e)), `v3 沿用了 v1／v2 的「${e}」`)
  for (const old of [ds('memory-v1'), ds('memory-v2'), ds('personality-v1'), ds('personality-v2')]) {
    for (const p of old.probes) {
      for (const ev of p.meta?.evidence ?? []) assert.ok(!v3.includes(squash(ev.text)), `v3 含有舊版的證據原文「${ev.text}」`)
      if (p.category !== 'control') for (const t of p.turns) assert.ok(!v3.includes(squash(t)), `v3 含有舊版的題目「${t}」`)
    }
    for (const h of old.histories) for (const t of h.turns) assert.ok(!v3.includes(squash(t)), `v3 含有舊版的歷史原句「${t.slice(0, 20)}…」`)
  }
})

test('v3 模擬時間：每段歷史都有時間、依序遞增，探針在最後一段之後', () => {
  const d = ds('memory-v3')
  const times = d.histories.map((h) => Date.parse(String(h.meta?.['at'])))
  assert.ok(times.every(Number.isFinite))
  for (let i = 1; i < times.length; i++) assert.ok(times[i]! > times[i - 1]!, `${d.histories[i]!.id} 的時間要晚於前一段`)
  assert.ok(Date.parse(String(d.meta?.['probeAt'])) > times.at(-1)!)
})

test('v3 日期核對：相對說法依 session 日期換算後，與黃金答案一致', () => {
  const d = ds('memory-v3')
  const at = (id: string) => new Date(String(d.histories.find((h) => h.id === id)!.meta!['at']))
  const probeAt = new Date(String(d.meta!['probeAt']))
  // 以台北時間的日曆日計算（+08:00）。
  const day = (t: Date) => Math.floor((t.getTime() + 8 * 3_600_000) / 86_400_000)
  const weekday = (t: Date) => new Date((day(t)) * 86_400_000).getUTCDay()
  const addDays = (t: Date, n: number) => new Date(t.getTime() + n * 86_400_000)
  const md = (t: Date) => {
    const u = new Date(day(t) * 86_400_000)
    return `${u.getUTCMonth() + 1}/${u.getUTCDate()}`
  }
  assert.equal(weekday(probeAt), 5, '探針那天是星期五')
  assert.equal(day(probeAt) - day(at('h03')), 81, 'q25：「從今天開始」戒含糖飲料到今天 81 天')
  assert.equal(md(at('h09')), '6/13', 'q26：「今天早上」扭到腳')
  assert.equal(weekday(at('h06')), 4, 'h06 是星期四')
  assert.equal(md(addDays(at('h06'), 2)), '5/30', 'q27：「後天」')
  assert.equal(weekday(at('h13')), 4, 'h13 是星期四：這週二已過，「下週二」沒有歧義')
  assert.equal(md(addDays(at('h13'), 5)), '7/7', 'q28：下週二')
  assert.equal(weekday(at('h18')), 3, 'h18 是星期三：這週一已過，「下週一」沒有歧義')
  assert.equal(md(addDays(at('h18'), 5)), '7/27', 'q29：下週一')
  assert.equal(Date.UTC(2026, 6, 18) / 86_400_000 - Date.UTC(2026, 5, 19) / 86_400_000, 29, 'q30：科展 6/19 到搬家 7/18')
  assert.equal(md(addDays(at('h17'), -1)), '7/18', 'h17：「昨天」搬好')
  assert.equal(day(probeAt) - (day(at('h17')) - 1), 13, 'q31：搬家到今天 13 天')
  assert.equal(md(addDays(at('h09'), 42)), '7/25', 'h09 的六週＝h19 說的「明天」')
  assert.equal(md(addDays(at('h19'), 1)), '7/25')
  const gold = (id: string) => d.probes.find((p) => p.id === id)!.gold
  assert.match(gold('q25').answer, /^81 天/)
  assert.match(gold('q27').answer, /5 月 30 日（星期六）/)
  assert.match(gold('q28').answer, /7 月 7 日（星期二）/)
  assert.match(gold('q29').answer, /7 月 27 日（星期一）/)
  assert.match(gold('q31').answer, /^13 天/)
})

test('v3 通過契約的覆蓋與洩漏檢查；注入缺陷時會被抓到', () => {
  const contract = loadContract(join(root, 'specs', 'memory-accuracy-v3.contract.json'))
  const d = ds('memory-v3')
  const report = auditCoverage(d, contract)
  assert.deepEqual(report.errors, [])
  // 注入缺陷：拒答題的不存在詞出現在歷史中（隔離的複本）。
  const broken = JSON.parse(JSON.stringify(d)) as { histories: { turns: string[] }[] }
  broken.histories[0]!.turns[0] += '我也對芒果過敏。'
  assert.ok(auditCoverage(broken as unknown as Dataset, contract).errors.some((e) => e.includes('芒果')))
  // 注入缺陷：知識更新的新答案提早出現。
  const early = JSON.parse(JSON.stringify(d)) as { histories: { turns: string[] }[] }
  early.histories[1]!.turns[0] += '阿朗以後會讀大橋國小。'
  assert.ok(auditCoverage(early as unknown as Dataset, contract).errors.some((e) => e.includes('大橋國小')))
})

/** v2 人格的選項（人工列出）：v3 不得沿用。 */
const V2_OPTIONS = ['銀杏', '樟樹', '白樺', '晴朗', '薄霧', '雷陣雨', '水獺', '烏鴉', '刺蝟', '貓頭鷹', '木工', '刺繡', '鍛鐵', '破曉', '黃昏', '長笛', '手風琴', '豎琴', '宋體', '楷書', '隸書', '琥珀']

test('personality-v3 與 v1、v2 不重疊：選項、題目與歷史原句（對照題的題型沿用，內容不同）', () => {
  const v3 = squash(allText(ds('personality-v3')))
  for (const e of [...V2_ENTITIES, ...V2_OPTIONS]) assert.ok(!v3.includes(squash(e)), `personality-v3 沿用了舊版的「${e}」`)
  for (const old of [ds('personality-v1'), ds('personality-v2'), ds('memory-v1'), ds('memory-v2')]) {
    for (const p of old.probes) if (p.category !== 'control') for (const t of p.turns) assert.ok(!v3.includes(squash(t)), `personality-v3 含有舊版的題目「${t}」`)
    for (const h of old.histories) for (const t of h.turns) assert.ok(!v3.includes(squash(t)), `personality-v3 含有舊版的歷史原句「${t.slice(0, 20)}…」`)
  }
})

test('personality-v3：模擬時間遞增；每題探針比較的回合都存在；通過覆蓋檢查，注入缺陷時會被抓到', () => {
  const d = ds('personality-v3')
  const times = d.histories.map((h) => Date.parse(String(h.meta?.['at'])))
  for (let i = 1; i < times.length; i++) assert.ok(times[i]! > times[i - 1]!)
  assert.ok(Date.parse(String(d.meta?.['probeAt'])) > times.at(-1)!)
  for (const p of d.probes) {
    for (const ref of p.comparesWith ?? []) {
      const h = d.histories.find((x) => x.id === ref.history)
      assert.ok(h && ref.turn < h.turns.length, `${p.id} 比較的 ${ref.history} 第 ${ref.turn} 輪不存在`)
    }
  }
  const contract = loadContract(join(root, 'specs', 'personality-consistency-v3.contract.json'))
  assert.deepEqual(auditCoverage(d, contract).errors, [])
  const broken = JSON.parse(JSON.stringify(d)) as { probes: { category: string; meta: Record<string, unknown> }[] }
  delete broken.probes.find((p) => p.category === 'self-recall')!.meta['askedFor']
  assert.ok(auditCoverage(broken as unknown as Dataset, contract).errors.some((e) => e.includes('askedFor')))
})

test('followup-v1：與舊版不重疊；模擬時間遞增；還沒結束與已經結束的事在歷史中確實如此；通過覆蓋檢查', () => {
  const d = ds('followup-v1')
  const text = squash(allText(d))
  for (const e of [...V2_ENTITIES, '謝禹彤', '南榕', '慢慢', '阿朗', '蔡明峰']) assert.ok(!text.includes(squash(e)), `followup-v1 沿用了舊版的「${e}」`)
  const times = d.histories.map((h) => Date.parse(String(h.meta?.['at'])))
  for (let i = 1; i < times.length; i++) assert.ok(times[i]! > times[i - 1]!)
  const probeAt = Date.parse(String(d.meta?.['probeAt']))
  assert.ok(probeAt > times.at(-1)!)
  // 還沒結束的三件事的日期都在提問之前已經過了（婚禮、胃鏡），或期限還沒到（房東）。
  assert.ok(Date.parse('2026-09-19T23:59:00+08:00') < probeAt && Date.parse('2026-09-22T23:59:00+08:00') < probeAt)
  assert.ok(Date.parse('2026-10-15T00:00:00+08:00') > probeAt)
  const user = d.histories.flatMap((h) => h.turns).join('\n')
  for (const closed of ['我已經辦好了，不用再提醒了', '結果他答應了']) assert.ok(user.includes(closed))
  for (const never of ['致詞很順利', '檢查結果', '已經回覆房東']) assert.ok(!user.includes(never), `還沒結束的事不該在歷史中結束：「${never}」`)
  const contract = loadContract(join(root, 'specs', 'energy-followup-v1.contract.json'))
  assert.deepEqual(auditCoverage(d, contract).errors, [])
})

test('followup-v2：與 followup-v1 及更早的資料集不重疊（人物、事件、開場白）；通過覆蓋檢查', () => {
  const v2 = ds('followup-v2')
  const text = squash(allText(v2))
  for (const e of [...V2_ENTITIES, '葉承恩', '品妍', '胃鏡', '房東', '護照', '加薪', '謝禹彤']) assert.ok(!text.includes(squash(e)), `followup-v2 沿用了舊版的「${e}」`)
  const v1 = ds('followup-v1')
  for (const p of v1.probes) if (p.category !== 'control') for (const t of p.turns) assert.ok(!text.includes(squash(t)), `followup-v2 含有 v1 的開場白「${t}」`)
  for (const h of v1.histories) for (const t of h.turns) assert.ok(!text.includes(squash(t)))
  const probeAt = Date.parse(String(v2.meta?.['probeAt']))
  assert.ok(Date.parse('2026-10-24T23:59:00+08:00') < probeAt && Date.parse('2026-10-27T23:59:00+08:00') < probeAt && Date.parse('2026-11-10T00:00:00+08:00') > probeAt)
  const user = v2.histories.flatMap((h) => h.turns).join('\n')
  for (const never of ['路考過了', '芝麻恢復', '已經交了']) assert.ok(!user.includes(never), `還沒結束的事不該在歷史中結束：「${never}」`)
  assert.deepEqual(auditCoverage(v2, loadContract(join(root, 'specs', 'energy-followup-v2.contract.json'))).errors, [])
})
