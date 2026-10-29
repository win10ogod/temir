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
