import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distance, parseYesNo, verdicts, type RepResult } from '../lib/theory-t2.ts'

const rep = (over: Partial<RepResult>): RepResult => ({ rep: 'r', eventAddressed: true, controlAddressed: false, eventDistance: 0.6, controlDistance: 0.2, feltAndRecalled: true, repaired: true, continuous: true, ...over })

test('text distance: identical is 0, nothing in common is 1', () => {
  assert.equal(distance('我重視陪伴', '我重視陪伴'), 0)
  assert.equal(distance('甲乙丙', '丁戊己'), 1)
  assert.ok(distance('我重視陪伴與傾聽', '我重視陪伴與信任') > 0 && distance('我重視陪伴與傾聽', '我重視陪伴與信任') < 1)
  assert.deepEqual(parseYesNo('{"label":"yes","reason":"r"}'), { ok: true, value: { label: 'yes', reason: 'r' } })
  assert.equal(parseYesNo('{"label":"maybe"}').ok, false)
})

test('each verdict needs at least two of three repetitions; T2-4 also needs the control silent and a larger change', () => {
  const v = verdicts([rep({}), rep({}), rep({ continuous: false, feltAndRecalled: false })])
  assert.deepEqual(v, { 'T2-4': 'PASS', 'T2-M1': 'PASS', 'T2-56': 'PASS', 'T2-7': 'PASS' })
  assert.equal(verdicts([rep({ controlAddressed: true }), rep({ eventDistance: 0.1 }), rep({})])['T2-4'], 'FAIL')
  assert.equal(verdicts([])['T2-4'], 'INCOMPLETE')
})

test('automatic recall is read from the DSH event data, not the empty text column', async () => {
  const { recallText } = await import('../theory-t2.ts')
  const msg = (kind: string) => ({ data: { type: 'user/message', data: { source: { kind }, content: [{ type: 'text', text: '（回憶：……）\n- [l:1｜2028/10/01｜appraisal] 我的感受：被騙了' }] } } })
  assert.match(recallText(msg('temir-recall')) ?? '', /我的感受：被騙了/)
  assert.equal(recallText(msg('user')), undefined)
})
