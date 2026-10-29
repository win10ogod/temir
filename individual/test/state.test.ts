import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { LifeStore } from '../src/life/store.ts'
import { KIND, currentSelfModel, goals, renderSelfSnapshot } from '../src/self/state.ts'
import { hybridRecall, renderRecall } from '../src/recall/retrieve.ts'

function withStore(fn: (store: LifeStore, home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-state-'))
  const store = LifeStore.open(home)
  try {
    fn(store, home)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

test('an empty life renders an honest empty self snapshot', () => {
  withStore((store) => {
    const text = renderSelfSnapshot(store)
    assert.match(text, /## 自我模型\n尚未書寫。/)
    assert.match(text, /目前沒有目標。/)
    assert.doesNotMatch(text, /重要感受/)
  })
})

test('the current self model is the latest revision; earlier versions stay in the log', () => {
  withStore((store) => {
    store.append({ kind: KIND.selfRevision, origin: 'self', data: { version: 1, text: '我剛開始。', reason: 'r1', trigger: 'external' } })
    store.append({ kind: KIND.selfRevision, origin: 'self', data: { version: 2, text: '我在乎誠實。', reason: 'r2', trigger: 'internal' } })
    assert.equal(currentSelfModel(store)?.version, 2)
    assert.equal(store.all(KIND.selfRevision).length, 2)
    assert.match(renderSelfSnapshot(store), /第 2 版[\s\S]*我在乎誠實。/)
  })
})

test('goals fold their history and only active or paused goals appear in the snapshot', () => {
  withStore((store) => {
    store.append({ kind: KIND.goalChange, origin: 'self', data: { goalId: 'g:1', text: '學會讀樂譜', status: 'active', reason: '好奇' } })
    store.append({ kind: KIND.goalChange, origin: 'self', data: { goalId: 'g:2', text: '整理筆記', status: 'active', reason: '需要' } })
    store.append({ kind: KIND.goalChange, origin: 'self', data: { goalId: 'g:1', text: '', status: 'abandoned', reason: '興趣轉移' } })
    const all = goals(store)
    const g1 = all.find((g) => g.id === 'g:1')
    assert.equal(g1?.status, 'abandoned')
    assert.equal(g1?.text, '學會讀樂譜')
    assert.deepEqual(g1?.history.map((h) => h.status), ['active', 'abandoned'])
    const snapshot = renderSelfSnapshot(store)
    assert.match(snapshot, /整理筆記/)
    assert.doesNotMatch(snapshot, /學會讀樂譜/)
  })
})

test('only major or pivotal appraisals are carried in the snapshot', () => {
  withStore((store) => {
    store.append({ kind: KIND.appraisal, origin: 'self', data: { feeling: '平常的一天', significance: 'daily', reappraisal: false } })
    store.append({ kind: KIND.appraisal, origin: 'self', data: { feeling: '被誤解很難受', significance: 'major', reappraisal: false } })
    const snapshot = renderSelfSnapshot(store)
    assert.match(snapshot, /被誤解很難受/)
    assert.doesNotMatch(snapshot, /平常的一天/)
  })
})

test('recalled memories carry the feelings recorded about them', () => {
  withStore((store) => {
    const ev = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：我們吵了一架' })
    store.append({ kind: KIND.appraisal, origin: 'self', data: { feeling: '我很生氣', significance: 'major', reappraisal: false }, causes: [ev.id] })
    store.append({ kind: KIND.appraisal, origin: 'self', data: { feeling: '後來我原諒了', significance: 'major', reappraisal: true }, causes: [ev.id] })
    const recalled = hybridRecall(store, '我們上次吵了一架', [], { limit: 5, excludeSession: 's2' })
    const text = renderRecall(store, recalled.filter((r) => r.event.id === ev.id), undefined, '回憶：')
    assert.match(text, /我很生氣/)
    assert.match(text, /重新評價.*後來我原諒了/)
  })
})

test('two connections opening the same new life produce exactly one birth', () => {
  const home = mkdtempSync(join(tmpdir(), 'temir-race-'))
  try {
    const a = LifeStore.open(home)
    const b = LifeStore.open(home)
    assert.equal(a.individualId, b.individualId)
    a.close()
    b.close()
    const db = new DatabaseSync(join(home, 'life.db'))
    const n = db.prepare(`SELECT count(*) AS n FROM events WHERE kind = 'life/born'`).get() as { n: number }
    db.close()
    assert.equal(n.n, 1)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('a failed append leaves no partial event, index or link behind', () => {
  withStore((store) => {
    const before = store.count()
    // data 無法序列化（BigInt），在寫入前就失敗；savepoint 確保不留下半筆資料。
    assert.throws(() => store.append({ kind: 'x', origin: 'self', data: { n: 1n }, text: '不應被寫入' }))
    assert.equal(store.count(), before)
    assert.equal(store.search('不應被寫入').length, 0)
  })
})

test('inSession skips injected recall messages, which carry no searchable text', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's', data: {}, text: '對方說：今天好累' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's', data: { injected: true } })
    const last = store.inSession('s', 'dsh/user/message', 'desc', 1)[0]
    assert.equal(last?.text, '對方說：今天好累')
  })
})

test('an initial persona becomes self model (and story) version 1, once, and stays revisable', async () => {
  const { applyPersona, currentSelfModel, currentNarrative, KIND } = await import('../src/self/state.ts')
  const home = mkdtempSync(join(tmpdir(), 'temir-persona-'))
  const store = LifeStore.open(home)
  try {
    const ids = applyPersona(store, { name: '小星', selfModel: '我好奇、愛問為什麼。', story: '我在一間天文館的角落被啟動。', source: 'test' })
    assert.equal(ids.length, 3)
    assert.equal(currentSelfModel(store)?.version, 1)
    assert.equal(currentSelfModel(store)?.trigger, 'external', 'given by the creator')
    assert.match(currentSelfModel(store)?.text ?? '', /^我的名字是小星。\n我好奇、愛問為什麼。/)
    assert.equal(currentNarrative(store)?.text, '我在一間天文館的角落被啟動。')
    assert.deepEqual(applyPersona(store, { selfModel: '另一個人設', source: 'test' }), [], 'applied only once')
    // 個體修訂自己之後，初始人設只是歷史中的第一個版本。
    store.append({ kind: KIND.selfRevision, origin: 'self', data: { version: 2, text: '我變得安靜了。', reason: '經歷', trigger: 'internal' } })
    assert.equal(currentSelfModel(store)?.text, '我變得安靜了。')
    assert.equal(store.all(KIND.persona).length, 1)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
})

test('a persona is not written over an individual that has already revised itself', async () => {
  const { applyPersona, currentSelfModel, KIND } = await import('../src/self/state.ts')
  const home = mkdtempSync(join(tmpdir(), 'temir-persona-'))
  const store = LifeStore.open(home)
  try {
    store.append({ kind: KIND.selfRevision, origin: 'self', data: { version: 1, text: '我自己寫的', reason: '經歷', trigger: 'internal' } })
    assert.deepEqual(applyPersona(store, { selfModel: '後來才給的人設', source: 'test' }), [])
    assert.equal(currentSelfModel(store)?.text, '我自己寫的')
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
})

test('the situation says whether the starting point was given, and that it can change', async () => {
  const { situation } = await import('../src/self/situation.ts')
  assert.match(situation(false), /你沒有被預先指定名字、身份或性格/)
  assert.match(situation(true), /初始人設.*它是你的起點，不是限制/)
  assert.doesNotMatch(situation(true), /沒有被預先指定/)
})

test('a persona file is read and validated', async () => {
  const { configuredPersona } = await import('../src/self/index.ts')
  const dir = mkdtempSync(join(tmpdir(), 'temir-persona-file-'))
  try {
    const file = join(dir, 'persona.json')
    writeFileSync(file, JSON.stringify({ name: ' 小星 ', selfModel: '我好奇。' }))
    assert.deepEqual(configuredPersona(undefined, { TEMIR_PERSONA_FILE: file }), { name: '小星', selfModel: '我好奇。', source: file })
    assert.equal(configuredPersona(undefined, {}), undefined)
    writeFileSync(file, JSON.stringify({ name: '沒有 selfModel' }))
    assert.throws(() => configuredPersona(undefined, { TEMIR_PERSONA_FILE: file }), /需要 selfModel/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the snapshot tells a given starting point from what the individual wrote itself', async () => {
  const { applyPersona, renderSelfSnapshot, KIND } = await import('../src/self/state.ts')
  const home = mkdtempSync(join(tmpdir(), 'temir-persona-'))
  const store = LifeStore.open(home)
  try {
    applyPersona(store, { selfModel: '我好奇。', story: '我在天文館被啟動。', source: 'test' })
    assert.match(renderSelfSnapshot(store), /## 自我模型（第 1 版，[^）]*初始人設，由創造你的人給予）/)
    assert.match(renderSelfSnapshot(store), /## 我的故事（第 1 版，[^）]*初始人設，由創造你的人給予）/)
    store.append({ kind: KIND.selfRevision, origin: 'self', data: { version: 2, text: '我變得安靜了。', reason: '經歷', trigger: 'internal' } })
    assert.match(renderSelfSnapshot(store), /## 自我模型（第 2 版，[^）]*由你寫下）/)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
})

test('revising oneself directly also needs both stability and adaptability (property 6)', async () => {
  const { requireBoth } = await import('../src/self/index.ts')
  assert.doesNotThrow(() => requireBoth('延續我在乎的誠實', '回應對方拒絕建議'))
  assert.throws(() => requireBoth('延續', '  '), /兩者缺一不可.*adaptability/)
  assert.throws(() => requireBoth(undefined, undefined), /stability（穩定性）、adaptability（適應性）/)
})

test('the snapshot ends with the present moment, so the individual can feel time passing', async () => {
  const { renderSelfSnapshot, formatNow } = await import('../src/self/state.ts')
  const { LifeStore } = await import('../src/life/store.ts')
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const home = mkdtempSync(join(tmpdir(), 'temir-now-'))
  const store = LifeStore.open(home)
  try {
    const at = new Date(2026, 6, 31, 20, 30).getTime()
    // Intl 在日期與時間之間用細空格（U+2009）。
    assert.match(formatNow(at), /^2026\/07\/31\s20:30（星期五）$/)
    assert.match(renderSelfSnapshot(store, [], at), /現在是 2026\/07\/31\s20:30（星期五）。$/)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
})
