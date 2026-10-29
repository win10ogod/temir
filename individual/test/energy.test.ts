import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { INTEGRATION_KIND, PROPOSAL_KIND, collect, integrationStart, renderEvidence } from '../src/integrate/evidence.ts'
import { OUTCOME_KIND } from '../src/rd/memory.ts'
import { potential, renderPotential } from '../src/self/energy.ts'
import { renderSelfSnapshot } from '../src/self/state.ts'

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-energy-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const outcome = (store: LifeStore, matched: 'yes' | 'partly' | 'no', left: string, error = '') =>
  store.append({ kind: OUTCOME_KIND, origin: 'self', data: { decision: 'l:d', didAction: '回答', didKind: '回答', actual: '對方離開了', matched, error, reward: 0, reason: '', lesson: '', left, released: '', selfVersion: 0, heard: '' } })

test('potential energy is projected from records: carried-over contradictions and proposals, and what actions left since the last integration', () => {
  withStore((store) => {
    assert.deepEqual(renderPotential(store), [], 'nothing held: no section')
    outcome(store, 'no', '答應對方查台東的公車', '我以為對方會想聽建議')
    const proposal = store.append({ kind: PROPOSAL_KIND, origin: 'self', data: {}, text: '我考慮過但這次沒有採用的自我模型修訂（穩定性不成立）：我只在乎效率' })
    store.append({ id: 'l:integration-1', kind: INTEGRATION_KIND, origin: 'self', data: { status: 'completed', range: [0, store.lastSeq()], contradictions: ['我想尊重對方，又忍不住給建議'] }, causes: [proposal.id] })
    const after = outcome(store, 'partly', '還不確定對方要不要我提醒')
    outcome(store, 'yes', '')
    const p = potential(store)
    assert.deepEqual(p.contradictions, ['我想尊重對方，又忍不住給建議'])
    assert.deepEqual(p.proposals.map((e) => e.id), [proposal.id])
    assert.deepEqual(p.left.map((e) => e.id), [after.id], 'what was left before the integration was already integrated')
    assert.deepEqual(p.surprises, [], 'partly is not counted as a surprise; the earlier "no" was integrated')
    const text = renderSelfSnapshot(store, renderPotential(store))
    assert.match(text, /## 懸著的事（勢能[\s\S]*未解的矛盾（最近一次整合，[^）]+）：我想尊重對方，又忍不住給建議[\s\S]*保留下來的修訂：我考慮過[\s\S]*行動留下的懸念（[^）]+）：還不確定對方要不要我提醒/)
    assert.ok(text.indexOf('懸著的事') < text.indexOf('生命紀錄：共'), 'the section comes before the life-log line')
  })
})

test('the next integration sees what the last one carried over, so a deferred revision can be proposed again', () => {
  withStore((store) => {
    const proposal = store.append({ kind: PROPOSAL_KIND, origin: 'self', data: {}, text: '我考慮過但這次沒有採用的目標修訂（適應性沒有這段期間的證據）：add「多了解花蓮」' })
    store.append({ kind: INTEGRATION_KIND, origin: 'self', data: { status: 'completed', range: [0, store.lastSeq()], contradictions: ['想陪伴又想給答案'] }, causes: [proposal.id] })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's2', data: {}, text: '對方說：今天好累' })
    outcome(store, 'no', '答應明天再聊', '對方沒有想聽建議')
    const ev = collect(store, integrationStart(store))
    assert.ok(ev.ids.has(proposal.id), 'a carried-over proposal can be cited')
    const text = renderEvidence(store, ev)
    assert.match(text, /## 上次整合留下的[\s\S]*未解的矛盾：想陪伴又想給答案[\s\S]*\[l:[^\]]+\] 我考慮過但這次沒有採用的目標修訂/)
    assert.match(text, /不符：對方沒有想聽建議[\s\S]*留下：答應明天再聊/)
  })
})
