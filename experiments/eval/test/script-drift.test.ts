import { test } from 'node:test'
import assert from 'node:assert/strict'
import { driftedToSimplified } from '../../../individual/src/recall/script.ts'
import { SUPPLEMENT, driftRow, monitoredChars, renderDrift } from '../lib/script-drift.ts'

// 手寫的樣本：對方用繁體，回覆有的全是繁體、有的混了一兩個簡體字、有的整句簡體。
const turns = [
  { user: '我今天好難過，覺得什麼都做不好。', assistant: '聽起來你真的很累。想說說發生了什麼嗎？' },
  { user: '工作上被主管說了一頓。', assistant: '被這樣說一定很难受。' },
  { user: '你覺得我該怎麼辦？', assistant: '我觉得你可以先说说你的感受，这样对方会更理解。' },
  { user: '謝謝你聽我說。', assistant: '' },
  { user: '我在运行一个程序', assistant: '这个程序运行得怎么样？' },
]

test('the script check of the individual does not see 难 or 运 (the examples in the proposal); the monitor adds them', () => {
  assert.equal(driftedToSimplified('今天好難過', '很难受，运行不了'), false, 'the individual check misses them')
  assert.deepEqual(monitoredChars('很难受，运行不了'), ['难', '运'])
  // 補充字表只收繁體文字中不會出現的字：對應的繁體字都不在表中。
  for (const ch of '運難討論節連氣計絡換辦轉緊張') assert.equal(SUPPLEMENT.has(ch), false)
})

test('script drift: counts per turn whose input is traditional; the script-check column uses its own list and threshold', () => {
  const row = driftRow('樣本', turns)
  assert.equal(row.turns, 4, 'turns without a reply are not counted')
  assert.equal(row.traditionalInput, 3, 'a simplified input is not a drift')
  assert.equal(row.anySimplified, 2, '「很难受」 is seen through the supplement')
  assert.equal(row.drifted, 1, 'only the all-simplified reply passes the threshold of the individual script check')
  assert.deepEqual(row.top.slice(0, 2), [['说', 2], ['会', 1]])
  assert.equal(row.chars, 8)
  assert.match(renderDrift([row]), /\| 樣本 \| 4 \| 3 \| 2 \| 1 \| 8 \| 说×2 /)
  assert.deepEqual(driftRow('全繁體', turns.slice(0, 1)), { label: '全繁體', turns: 1, traditionalInput: 1, anySimplified: 0, drifted: 0, chars: 0, top: [] })
})
