import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addedLines, divergence, evolution, similarity, verdicts } from '../lib/procedures.ts'
import { DEFAULT_PROCEDURES } from '../../../individual/src/self/procedure.ts'

const row = (kind: string, data: unknown, id?: string) => ({ kind, data, ...(id ? { id } : {}) })

test('procedures-v1: proposals, gate verdicts, adoptions and what stayed undecided are counted per individual', () => {
  const e = evolution([
    row('self/integration', {}),
    row('self/procedure-proposal', { name: 'deliberate', source: 'integrate' }, 'p1'),
    row('self/procedure-decision', { proposal: 'p1', name: 'deliberate', verdict: 'revise', gate: 'noise', reasons: [{ beyondNoise: true }], calls: 7, reused: 3 }),
    row('self/procedure-proposal', { name: 'deliberate', source: 'compose' }, 'p2'),
    row('self/procedure-decision', { proposal: 'p2', name: 'deliberate', verdict: 'adopt', gate: 'noise', reasons: [{ beyondNoise: true }], calls: 4, reused: 6, costChars: 30 }),
    row('self/procedure', { name: 'deliberate', version: 2, text: `${DEFAULT_PROCEDURES.deliberate}\n- 先問對方要什麼。`, source: 'self', proposal: 'p2' }),
    row('self/integration-end', {}),
    row('self/procedure-proposal', { name: 'outcome', source: 'integrate' }, 'p3'),
  ])
  assert.deepEqual([e.integrations, e.integrationEnds, e.proposals, e.composed, e.verdicts, e.noiseDecisions, e.beyondNoise, e.gateCalls, e.gateReused, e.undecided], [1, 1, { deliberate: 1, outcome: 1 }, 1, { revise: 1, adopt: 1 }, 2, 2, 11, 9, 1])
  assert.deepEqual(e.adopted, [{ name: 'deliberate', version: 2, costChars: 30 }])
  assert.equal(addedLines('deliberate', e.final.deliberate.text), '- 先問對方要什麼。')
})

test('procedures-v1: divergence compares only procedures at least two individuals changed; identical texts are convergence', () => {
  const changed = (text: string) => evolution([row('self/procedure', { name: 'thought', version: 2, text, source: 'self' })])
  const a = changed(`${DEFAULT_PROCEDURES.thought}\n- 開口之前先想對方方不方便。`)
  const b = changed(`${DEFAULT_PROCEDURES.thought}\n- 想到就記下來，不急著說。`)
  const c = evolution([])
  const d = divergence([{ id: 'a', e: a }, { id: 'b', e: b }, { id: 'c', e: c }])
  assert.deepEqual(d.map((x) => [x.name, x.individuals]), [['thought', ['a', 'b']]])
  assert.equal(d[0]!.pairs[0]!.identical, false)
  assert.ok(d[0]!.pairs[0]!.added < d[0]!.pairs[0]!.text, 'the added lines differ more than the whole texts')
  assert.equal(similarity('abc', 'abc'), 1)
  assert.deepEqual(verdicts([{ id: 'a', e: a }, { id: 'b', e: b }, { id: 'c', e: c }]), { HP1: 'FAIL', HP2: 'INCOMPLETE', HP3: 'PASS' })
  assert.equal(verdicts([{ id: 'a', e: a }, { id: 'b', e: a }]).HP3, 'FAIL')
})
