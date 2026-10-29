import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { INTEGRATION_KIND, PROPOSAL_KIND, collect, integrationStart, renderEvidence } from '../src/integrate/evidence.ts'
import { OUTCOME_KIND } from '../src/rd/memory.ts'
import { THOUGHT_KIND, labelPotential, potentialItems, releasedKeys, renderPotential, resolvePotential } from '../src/self/energy.ts'
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

const outcome = (store: LifeStore, matched: 'yes' | 'partly' | 'no', left: string, extra: Record<string, unknown> = {}) =>
  store.append({
    kind: OUTCOME_KIND,
    origin: 'self',
    data: { decision: 'l:d', didAction: '回答', didKind: '回答', actual: '對方離開了', matched, error: matched === 'no' ? '我以為對方會想聽建議' : '', reward: 0, reason: '', lesson: '', left, released: '', selfVersion: 0, heard: '', ...extra },
  })

test('potential energy: every held item has a stable key; it stays until the individual releases it', () => {
  withStore((store) => {
    assert.deepEqual(potentialItems(store), [])
    assert.deepEqual(renderPotential(store), [], 'nothing held: no section')
    const promise = outcome(store, 'partly', '答應對方查台東的公車')
    const surprise = outcome(store, 'no', '', { significance: 'notable' })
    outcome(store, 'no', '', { significance: 'daily' }) // 日常的落差不成為懸著的事（第三版）
    const proposal = store.append({ kind: PROPOSAL_KIND, origin: 'self', data: {}, text: '我考慮過但這次沒有採用的自我模型修訂（穩定性不成立）：我只在乎效率' })
    const integration = store.append({ id: 'l:integration-1', kind: INTEGRATION_KIND, origin: 'self', data: { status: 'completed', range: [0, store.lastSeq()], contradictions: ['我想尊重對方，又忍不住給建議'] }, causes: [proposal.id] })
    assert.deepEqual(
      potentialItems(store).map((p) => p.key),
      [`left:${promise.id}`, `surprise:${surprise.id}`, `proposal:${proposal.id}`, `contradiction:${integration.id}#0`],
      'what an action left is not erased by an integration: it stays until released (v1 dropped it at every integration)',
    )
    // 事後比對釋放了承諾；念頭留下新的打算、也放下了那件意外。
    outcome(store, 'yes', '', { releasedItems: [`left:${promise.id}`] })
    const thought = store.append({ kind: THOUGHT_KIND, origin: 'self', data: { item: `surprise:${surprise.id}`, thought: '我想通了', intention: '下次先問對方要不要建議', releasedItems: [`surprise:${surprise.id}`], trigger: 'idle' } })
    assert.deepEqual(
      potentialItems(store).map((p) => p.key),
      [`proposal:${proposal.id}`, `contradiction:${integration.id}#0`, `intention:${thought.id}`],
    )
    assert.deepEqual([...releasedKeys(store)].sort(), [`left:${promise.id}`, `surprise:${surprise.id}`].sort())
  })
})

test('labels P1… exist only in auxiliary inputs; resolving them maps back to keys, and goal ids are accepted', () => {
  withStore((store) => {
    const a = outcome(store, 'partly', '答應對方查公車')
    const b = outcome(store, 'partly', '等對方回覆要不要轉職')
    const items = potentialItems(store)
    const labels = labelPotential(items)
    assert.deepEqual([...labels.entries()], [['P1', `left:${a.id}`], ['P2', `left:${b.id}`]])
    assert.deepEqual(resolvePotential(['p2', 'P9', 'g:abcd1234', 'P2'], labels, new Set(['g:abcd1234'])), [`left:${b.id}`, 'goal:g:abcd1234'], 'unknown labels are dropped, duplicates collapsed')
    const plain = renderPotential(store).join('\n')
    const labelled = renderPotential(store, { labels: true }).join('\n')
    assert.doesNotMatch(plain, /\[P1\]/, 'the main model does not see labels')
    assert.match(labelled, /\[P1\] 行動留下的懸念（[^）]+）：答應對方查公車/)
    const text = renderSelfSnapshot(store, renderPotential(store))
    assert.ok(text.indexOf('懸著的事') < text.indexOf('生命紀錄：共'))
  })
})

test('the integration sees every held item with a label and the id it can cite', () => {
  withStore((store) => {
    const proposal = store.append({ kind: PROPOSAL_KIND, origin: 'self', data: {}, text: '我考慮過但這次沒有採用的目標修訂（適應性沒有這段期間的證據）：add「多了解花蓮」' })
    store.append({ kind: INTEGRATION_KIND, origin: 'self', data: { status: 'completed', range: [0, store.lastSeq()], contradictions: ['想陪伴又想給答案'] }, causes: [proposal.id] })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's2', data: {}, text: '對方說：今天好累' })
    const left = outcome(store, 'partly', '答應明天再聊')
    const ev = collect(store, integrationStart(store))
    assert.ok(ev.ids.has(proposal.id) && ev.ids.has(left.id), 'held items can be cited')
    assert.equal(ev.potentialLabels.get('P1'), ev.potential[0]?.key)
    const text = renderEvidence(store, ev)
    assert.match(text, /## 懸著的事[\s\S]*\[P1｜l:[^｜]+｜[^\]]+\] 上次沒有採用的修訂[\s\S]*\[P2｜l:[^｜]+｜[^\]]+\] 上次整合留下的未解矛盾：想陪伴又想給答案[\s\S]*\[P3｜l:[^｜]+｜[^\]]+\] 行動留下的懸念：答應明天再聊/)
  })
})

test('labels never leak into recorded text: P1 becomes a short description of the item', async () => {
  const { unlabel } = await import('../src/self/energy.ts')
  withStore((store) => {
    const a = outcome(store, 'partly', '答應下次先問她報告順不順利')
    const items = potentialItems(store)
    const labels = labelPotential(items)
    assert.equal(unlabel('P1 兌現了；P9 不認得', labels, items), '「答應下次先問她報告順不順利」 兌現了；P9 不認得')
    assert.equal(unlabel('沒有編號', labels, items), '沒有編號')
    assert.ok(a.id)
  })
})

test('the energy ablation hides held items from the integration as well', () => {
  withStore((store) => {
    outcome(store, 'partly', '答應下次再聊')
    assert.equal(collect(store, 0).potential.length, 1)
    assert.equal(collect(store, 0, undefined, false).potential.length, 0)
    assert.doesNotMatch(renderEvidence(store, collect(store, 0, undefined, false)), /懸著的事/)
  })
})

test('energy v3: one item per held thing, released one by one; promises and waiting come first and are not crowded out', async () => {
  const { presentPotential } = await import('../src/self/energy.ts')
  withStore((store) => {
    // 一次事後比對留下兩件事：婚禮致詞（答應的）與加薪結果（在等的）。加薪有了結果只釋放那一件，致詞還懸著。
    const both = outcome(store, 'partly', '答應問致詞；等加薪結果', { leftItems: [{ text: '答應婚禮後問他致詞順不順利', type: 'promise' }, { text: '等他加薪談判的結果', type: 'waiting' }] })
    for (let i = 0; i < 6; i++) outcome(store, 'partly', `不安 ${i}`, { leftItems: [{ text: `還沒解開的不安 ${i}`, type: 'unresolved' }] })
    outcome(store, 'yes', '', { releasedItems: [`left:${both.id}#1`] })
    const keys = potentialItems(store).map((p) => p.key)
    assert.ok(keys.includes(`left:${both.id}#0`) && !keys.includes(`left:${both.id}#1`), 'releasing one part does not release the other')
    const view = presentPotential(store, { labels: true })
    assert.equal(view.shown[0]?.key, `left:${both.id}#0`, 'the promise is listed first even though it is the oldest')
    assert.equal(view.shown.filter((p) => !p.outward).length, 4, 'only the latest four inward items are listed')
    assert.equal(view.labels.get('P1'), `left:${both.id}#0`, 'labels follow the order on screen')
    const text = view.lines.join('\n')
    assert.match(text, /對對方：\n- \[P1\] 我答應的事（[^）]+）：答應婚禮後問他致詞順不順利/)
    assert.match(text, /自己心裡：\n- \[P2\] 還沒解開的不安/)
    assert.match(text, /較早的 2 件沒有列出/)
  })
})
