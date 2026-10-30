import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../../../individual/src/life/store.ts'
import { pendingPivotal, pendingProcedures } from '../run.ts'

/** 沉澱階段要等的事（手寫的生命日誌片段，測試夾具）：還沒整合的「重新檢視自己」，以及整合時提出、閘門還沒決定的做法提案。 */
test('settle: waits for a pending reconsider and for a procedure proposal from integration that has no decision yet', () => {
  const home = mkdtempSync(join(tmpdir(), 'temir-settle-'))
  const store = LifeStore.open(home)
  try {
    const db = join(home, 'life.db')
    assert.equal(pendingPivotal(db), false)
    store.append({ kind: 'rd/outcome', origin: 'self', data: { reconsider: true } })
    assert.equal(pendingPivotal(db), true, 'ADR-0008: reconsider')
    store.append({ kind: 'self/integration', origin: 'self', data: { range: [0, store.lastSeq()] } })
    assert.equal(pendingPivotal(db), false)
    store.append({ kind: 'appraisal', origin: 'self', data: { significance: 'pivotal' } })
    assert.equal(pendingPivotal(db), true, 'old records: pivotal')

    assert.equal(pendingProcedures(db), 0)
    const own = store.append({ kind: 'self/procedure-proposal', origin: 'self', data: { name: 'outcome', source: 'integrate' } })
    store.append({ kind: 'self/procedure-proposal', origin: 'self', data: { name: 'outcome', source: 'compose' } })
    assert.equal(pendingProcedures(db), 1, 'a version left by the round budget is not waited for')
    store.append({ kind: 'self/procedure-decision', origin: 'self', data: { proposal: own.id, verdict: 'reject' } })
    assert.equal(pendingProcedures(db), 0)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
})
