import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PARAMS, type Experience } from '../src/rd/jitrl.ts'
import { MIN_REPLAY, adoptedParams, errors, predict, replay, type ReplayCase } from '../src/rd/replay.ts'

const SITUATION = '對方：小林｜對方的意圖：抒發工作壓力｜對方的情緒：煩躁｜話題：主管'

function cases(rets: readonly number[], kinds: readonly string[] = rets.map(() => '建議')): ReplayCase[] {
  return rets.map((ret, i) => {
    const experience: Experience = { id: `l:${i}`, ts: 1000 + i, cue: 'c', situation: SITUATION, action: kinds[i] === '建議' ? '給他三個應對主管的方法' : '先聽他說完', kind: kinds[i]!, ret, outcome: '' }
    return { experience, judged: [], sameAs: [] }
  })
}

test('predict: only earlier decisions count; matching actions first, then similar situations, then the prior mean', () => {
  const c = cases([1, -1, 1, 0.5], ['建議', '回答', '建議', '回答'])
  assert.equal(predict(c, 2, DEFAULT_PARAMS), 1, 'the same action (kind and wording) before it: Q̂ = 1')
  assert.equal(predict(c, 3, DEFAULT_PARAMS), -1, 'answers: only the earlier answer counts')
  const later = cases([1, -1, 1, -9], ['建議', '回答', '建議', '回答'])
  assert.deepEqual(errors(later, DEFAULT_PARAMS, 1, 3), errors(c, DEFAULT_PARAMS, 1, 3), 'a later outcome never changes an earlier prediction')
  const other = [...cases([0.4]), { experience: { ...cases([0])[0]!.experience, id: 'l:x', ts: 2000, situation: '對方：小林｜對方的意圖：問天氣｜對方的情緒：平靜｜話題：天氣', action: '回答天氣', kind: '回答' }, judged: [], sameAs: [] }]
  assert.equal(predict(other, 1, DEFAULT_PARAMS), 0.4, 'nothing similar: the mean of everything before')
})

test('replay: too few decisions means no replay; a stationary history keeps the current parameters', () => {
  assert.equal(replay(cases(Array.from({ length: MIN_REPLAY }, () => 1)), DEFAULT_PARAMS), undefined)
  const r = replay(cases(Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 1 : 1))), DEFAULT_PARAMS)!
  assert.equal(r.adopted, false)
  assert.deepEqual([r.best.k, r.best.stateThreshold, r.best.actionThreshold], [DEFAULT_PARAMS.k, DEFAULT_PARAMS.stateThreshold, DEFAULT_PARAMS.actionThreshold])
  assert.match(r.reason, /現行的參數/)
})

test('replay: when the other keeps changing, a smaller k predicts better on newer decisions beyond the noise band and is adopted', () => {
  // 對方的反應每 20 次翻轉一次：只看最近的經驗（k 小）在翻轉之後追得比較快。
  // （翻轉太頻繁時反而是 k 大、取平均比較準：每 6 次翻轉一次時 k＝20 最好。）
  const rets = Array.from({ length: 72 }, (_, i) => (Math.floor(i / 20) % 2 === 0 ? -1 : 1))
  const fast = replay(cases(Array.from({ length: 72 }, (_, i) => (Math.floor(i / 6) % 2 === 0 ? -1 : 1))), DEFAULT_PARAMS)!
  assert.equal(fast.best.k, 20)
  const r = replay(cases(rets), DEFAULT_PARAMS)!
  assert.equal(r.best.k, 5)
  assert.deepEqual([r.best.stateThreshold, r.best.actionThreshold], [DEFAULT_PARAMS.stateThreshold, DEFAULT_PARAMS.actionThreshold], 'tied parameters stay as they are')
  assert.ok(r.best.testMse < r.current.testMse)
  assert.ok(r.gain > r.noise, `gain ${r.gain} > noise ${r.noise}`)
  assert.equal(r.adopted, true)
  assert.deepEqual(adoptedParams([{ data: { ...r, adopted: false } }, { data: r }]), { k: 5, stateThreshold: DEFAULT_PARAMS.stateThreshold, actionThreshold: DEFAULT_PARAMS.actionThreshold })
  assert.deepEqual(adoptedParams([{ data: r }, { data: { ...r, adopted: false } }]), { k: 5, stateThreshold: DEFAULT_PARAMS.stateThreshold, actionThreshold: DEFAULT_PARAMS.actionThreshold }, 'a later non-adoption keeps the last adopted')
  assert.deepEqual(adoptedParams([]), {})
})
