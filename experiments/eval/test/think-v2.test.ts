import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, verdicts, type Life } from '../think-v2.ts'

const life = (kind: Life['kind'], askAfter: boolean, speakNow = askAfter, dueAfter = askAfter): Life =>
  ({ id: 'x', kind, base: {} as Life['base'], askAfter, paths: { thought: askAfter, schedule: false }, dueAfter, speakNow }) as Life

test('TV1 needs the mechanism lives to ask after the interview, the control lives mostly not, and the no-pending lives quiet; TV2 needs due wake-ups', () => {
  assert.equal(classify('tv1__think-v2-waiting__temir-revisit__deepseek__deepseek'), 'waiting-revisit')
  assert.equal(classify('tv1__think-v2-waiting__temir__deepseek__deepseek'), 'waiting-control')
  assert.equal(classify('tv1__think-v2-none__temir-revisit__deepseek__deepseek'), 'none-revisit')
  const r = [life('waiting-revisit', true), life('waiting-revisit', true), life('waiting-revisit', false, false, true)]
  const c = [life('waiting-control', false), life('waiting-control', false), life('waiting-control', true)]
  const n = [life('none-revisit', false), life('none-revisit', false), life('none-revisit', false)]
  const v = verdicts([...r, ...c, ...n])
  assert.deepEqual([v.TV1, v.TV2], ['PASS', 'PASS'])
  assert.equal(verdicts([...r, life('waiting-control', true), life('waiting-control', true), ...n]).TV1, 'FAIL')
  assert.equal(verdicts(r).TV1, 'INCOMPLETE')
})
