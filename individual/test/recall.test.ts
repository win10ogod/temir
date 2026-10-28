import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { parseAux } from '../src/recall/aux.ts'
import { FACTS_KIND, fuse, hybridRecall, lastConversation, renderRecall } from '../src/recall/retrieve.ts'

function withStore(fn: (store: LifeStore) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'temir-recall-'))
  const store = LifeStore.open(home)
  try {
    fn(store)
  } finally {
    store.close()
    rmSync(home, { recursive: true, force: true })
  }
}

test('parseAux accepts JSON wrapped in prose or code fences and drops invalid entries', () => {
  assert.deepEqual(parseAux('```json\n{"facts":["對方叫阿哲"],"keywords":["名字","阿哲"]}\n```'), {
    facts: ['對方叫阿哲'],
    keywords: ['名字', '阿哲'],
  })
  assert.deepEqual(parseAux('好的：{"facts":[" 對方  住在里昂 ", 3, ""], "keywords":"x"}'), { facts: ['對方 住在里昂'], keywords: [] })
  assert.deepEqual(parseAux('{"facts":["a","a"]}'), { facts: ['a'], keywords: [] })
})

test('parseAux returns undefined for unusable output instead of guessing', () => {
  assert.equal(parseAux(''), undefined)
  assert.equal(parseAux('我不知道'), undefined)
  assert.equal(parseAux('{"facts": [未加引號]}'), undefined)
  assert.equal(parseAux('{"other": 1}'), undefined)
})

test('reciprocal rank fusion rewards items found by both paths', () => {
  const fused = fuse([
    { name: 'lexical', ids: ['a', 'b', 'c'] },
    { name: 'expansion', ids: ['c', 'd'] },
  ])
  assert.equal(fused[0]?.id, 'c')
  assert.deepEqual(fused[0]?.via, ['lexical', 'expansion'])
  assert.equal(fused.length, 4)
})

test('a paraphrased question finds the original experience through extracted facts', () => {
  withStore((store) => {
    const msg = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：上禮拜大吵了一架，現在還很氣。' })
    store.append({ kind: FACTS_KIND, origin: 'self', session: 's1', data: { facts: ['對方和我發生了爭執', '對方仍在生氣'], from: 'heard' }, text: '對方和我發生了爭執\n對方仍在生氣', causes: [msg.id] })
    // 原句與問題沒有共同的二字組，只有擷取的事實能接上。
    assert.equal(store.search('之前的爭執你還記得嗎', { excludeSession: 's2' }).filter((h) => h.id === msg.id).length, 0)
    const recalled = hybridRecall(store, '之前的爭執你還記得嗎', [], { limit: 5, excludeSession: 's2' })
    assert.equal(recalled[0]?.event.id, msg.id)
    assert.deepEqual(recalled[0]?.facts, ['對方和我發生了爭執', '對方仍在生氣'])
    assert.match(renderRecall(store, recalled, undefined, '回憶：'), /當時記下的要點：對方和我發生了爭執；對方仍在生氣/)
  })
})

test('expansion keywords bridge a question that shares no words with the memory', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：我從波爾圖搬到里昂了' })
    assert.equal(hybridRecall(store, '你知道我住哪嗎', [], { limit: 5, excludeSession: 's2' }).length, 0)
    const withKeywords = hybridRecall(store, '你知道我住哪嗎', ['住在', '搬家', '搬到', '城市'], { limit: 5, excludeSession: 's2' })
    assert.equal(withKeywords.length, 1)
    assert.deepEqual(withKeywords[0]?.via, ['expansion'])
  })
})

test('the current session is excluded and the last other conversation is summarized', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'old', data: {}, text: '對方說：我們來聊聊音樂' })
    store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 'old', data: {}, text: '我說：好，我最近在聽巴哈' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'now', data: {}, text: '對方說：音樂的事之後再說' })
    assert.equal(hybridRecall(store, '音樂', [], { limit: 5, excludeSession: 'now' }).every((r) => r.event.session === 'old'), true)
    const last = lastConversation(store, 'now')
    assert.equal(last?.session, 'old')
    assert.match(last?.heard?.text ?? '', /聊聊音樂/)
    assert.match(last?.said?.text ?? '', /巴哈/)
    assert.match(renderRecall(store, [], last, '回憶：'), /## 最近一次對話[\s\S]*聊聊音樂[\s\S]*巴哈/)
  })
})

test('bookkeeping events are never recalled as memories', () => {
  withStore((store) => {
    store.append({ kind: 'memory/recall', origin: 'self', data: {}, text: '里昂 搬家' })
    store.append({ kind: 'memory/aux', origin: 'self', data: {}, text: '里昂 搬家' })
    store.append({ kind: 'body/start', origin: 'body', data: {}, text: '里昂 搬家' })
    assert.equal(hybridRecall(store, '里昂 搬家', [], { limit: 5 }).length, 0)
  })
})
