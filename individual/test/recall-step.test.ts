import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import type { CallModel } from '../src/recall/aux.ts'
import { createRecall, type RecallStepInput } from '../src/recall/index.ts'
import { COMPACTION_KIND, FACTS_KIND, STM_PAGES } from '../src/recall/retrieve.ts'

/** 測試替身（單元測試專用）：取代 callModel，線索理解一律回傳同一份輸出，並記下收到的 input。 */
function scripted(output: string): { call: CallModel; inputs: string[] } {
  const inputs: string[] = []
  const call: CallModel = async (_route, _system, input) => {
    inputs.push(input)
    return { output, ms: 1, effort: 'low', reasoningChars: 0, usage: null, finish: 'stop' }
  }
  return { call, inputs }
}

/** 測試替身（單元測試專用）：記下 warn 與 error，取代 cordis 的 Logger。 */
function recorder(): { logger: { warn: (f: string) => void; error: (f: string) => void }; logs: string[] } {
  const logs: string[] = []
  return { logger: { warn: (f) => void logs.push(f), error: (f) => void logs.push(f) }, logs }
}

async function withStore(fn: (store: LifeStore) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'temir-recall-step-'))
  const store = LifeStore.open(home)
  try {
    await fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

const AUX = '{"lasting":["對方的女兒叫小葵"],"facts":[],"keywords":["小葵","女兒"]}'

function input(cue: string, messageIds: readonly string[] = []): RecallStepInput {
  return { session: 'now', route: { provider: 'test', model: 'double' }, cue, messageIds, signal: new AbortController().signal }
}

/** 之前的對話：每個 session 一個回合，每一句都提到小葵（檢索會找到每一句）。 */
function history(store: LifeStore, n: number): string[] {
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const heard = store.append({ kind: 'dsh/user/message', origin: 'session', session: `old${i}`, data: {}, text: `對方說：小葵第 ${i} 次去公園` })
    store.append({ kind: 'dsh/assistant/message', origin: 'session', session: `old${i}`, data: {}, text: `我說：小葵玩得開心嗎（${i}）` })
    ids.push(heard.id)
  }
  return ids
}

const recalls = (store: LifeStore) => store.allInSession('now', 'memory/recall').map((e) => e.data as { working: boolean; afterCompaction?: true; recent: string[]; hits: { id: string }[] })

test('recall step: the first sentence of a session brings the working set and 7 recent pages; recall does not repeat them', () =>
  withStore(async (store) => {
    const old = history(store, STM_PAGES + 2)
    const { call, inputs } = scripted(AUX)
    const { logger, logs } = recorder()
    const recall = createRecall({ life: store, call, logger }, {})
    const text = await recall.step(input('小葵最近好嗎', ['m1']))
    assert.deepEqual(inputs, ['小葵最近好嗎'], 'one cue-understanding call')
    const [r] = recalls(store)
    assert.equal(r!.working, true)
    assert.deepEqual(r!.recent, old.slice(-STM_PAGES), 'the latest 7 pages, oldest first')
    const hits = r!.hits.map((h) => h.id)
    assert.ok(hits.length > 0)
    assert.deepEqual(hits.filter((id) => r!.recent.includes(id)), [], 'excludeIds: a page shown as short-term memory is not recalled again')
    assert.deepEqual(new Set(hits), new Set(old.slice(0, 2)), 'the older pages are still recalled')
    assert.match(text ?? '', /## 最近的對話（短期記憶：這段對話之前最近的 7 個回合/)
    // 擷取到的事實等對方的訊息寫進生命日誌之後才寫成 memory/facts。
    assert.deepEqual(store.all(FACTS_KIND), [])
    recall.heard('now', 'm1', 'now#1')
    recall.heard('now', 'm1', 'now#1')
    const facts = store.all(FACTS_KIND)
    assert.equal(facts.length, 1, 'written once')
    assert.deepEqual(facts[0]!.causes, ['now#1'])
    assert.deepEqual(logs, [])
  }))

test('recall step: later sentences bring neither the working set nor recent pages, until a compaction', () =>
  withStore(async (store) => {
    history(store, 3)
    const recall = createRecall({ life: store, call: scripted(AUX).call, logger: recorder().logger }, {})
    await recall.step(input('小葵最近好嗎'))
    store.append({ id: 'now#1', kind: 'dsh/user/message', origin: 'session', session: 'now', data: {}, text: '對方說：小葵最近好嗎' })
    await recall.step(input('她還在學游泳'))
    store.append({ id: 'now#2', kind: 'dsh/user/message', origin: 'session', session: 'now', data: {}, text: '對方說：她還在學游泳' })
    store.append({ id: 'now#3', kind: COMPACTION_KIND, origin: 'session', session: 'now', data: { type: 'compaction/summary', seq: 3, data: { shadowedSeqs: [1], summary: [] } } })
    await recall.step(input('她喜歡畫畫'))
    await recall.step(input('她也喜歡唱歌'))
    assert.deepEqual(
      recalls(store).map((r) => [r.working, r.afterCompaction ?? false, r.recent.length]),
      [
        [true, false, 3],
        [false, false, 0],
        [true, true, 0],
        [false, false, 0],
      ],
    )
  }))

test('recall step: without automatic recall only the cue is understood; without expansion no model call is made', () =>
  withStore(async (store) => {
    history(store, 2)
    const off = scripted(AUX)
    assert.equal(await createRecall({ life: store, call: off.call, logger: recorder().logger }, { automatic: false }).step(input('小葵最近好嗎')), undefined)
    assert.equal(off.inputs.length, 1)
    assert.deepEqual(recalls(store), [])
    const plain = scripted(AUX)
    const text = await createRecall({ life: store, call: plain.call, logger: recorder().logger }, { expansion: false }).step(input('小葵最近好嗎'))
    assert.equal(plain.inputs.length, 0)
    assert.match(text ?? '', /小葵/)
  }))
