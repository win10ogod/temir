import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { parseAux } from '../src/recall/aux.ts'
import { FACTS_KIND, clipEnds, fuse, hybridRecall, lastConversation, personFacts, renderRecall, replyOf } from '../src/recall/retrieve.ts'

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
    lasting: [],
    keywords: ['名字', '阿哲'],
  })
  assert.deepEqual(parseAux('好的：{"facts":[" 對方  住在里昂 ", 3, ""], "keywords":"x"}'), { facts: ['對方 住在里昂'], lasting: [], keywords: [] })
  assert.deepEqual(parseAux('{"facts":["a","a"]}'), { facts: ['a'], lasting: [], keywords: [] })
})

test('parseAux puts lasting facts first and does not repeat them', () => {
  assert.deepEqual(parseAux('{"lasting":["對方在學韓文"],"facts":["對方今天很累","對方在學韓文"],"keywords":[]}'), {
    facts: ['對方在學韓文', '對方今天很累'],
    lasting: ['對方在學韓文'],
    keywords: [],
  })
  assert.deepEqual(parseAux('{"lasting":["對方怕高"]}'), { facts: ['對方怕高'], lasting: ['對方怕高'], keywords: [] })
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

/** 依 DSH session 事件的形狀建立助手訊息（推理、回覆、工具呼叫分屬不同區塊），text 依 ingest 的格式。 */
function assistant(store: LifeStore, session: string, parts: { reasoning?: string; reply?: string; tool?: string }) {
  const content = [
    ...(parts.reasoning ? [{ type: 'reasoning', text: parts.reasoning }] : []),
    ...(parts.reply ? [{ type: 'text', text: parts.reply }] : []),
    ...(parts.tool ? [{ type: 'tool-call', name: parts.tool, arguments: '{}' }] : []),
  ]
  const text = [
    ...(parts.reasoning ? [`我想：${parts.reasoning}`] : []),
    ...(parts.reply ? [`我說：${parts.reply}`] : []),
    ...(parts.tool ? [`我使用工具 ${parts.tool}：{}`] : []),
  ].join('\n')
  return store.append({ kind: 'dsh/assistant/message', origin: 'session', session, data: { type: 'assistant/message', data: { message: { content } } }, text })
}

function injected(store: LifeStore, session: string, kind: string, body: string) {
  return store.append({ kind: 'dsh/user/message', origin: 'session', session, data: { type: 'user/message', data: { source: { kind } } }, text: `[${kind}] ${body}` })
}

test('replyOf returns only what was said, from blocks or from the ingested text', () => {
  withStore((store) => {
    const full = assistant(store, 's1', { reasoning: 'The user asks about animals.', reply: '我選水獺。\n選擇：水獺', tool: 'recall' })
    assert.equal(replyOf(full), '我選水獺。\n選擇：水獺')
    const legacy = store.append({ kind: 'dsh/assistant/message', origin: 'session', session: 's1', data: {}, text: '我想：先想一下\n我說：好，我最近在聽巴哈\n我使用工具 recall：{}' })
    assert.equal(replyOf(legacy), '好，我最近在聽巴哈')
    assert.equal(replyOf(assistant(store, 's1', { reasoning: '只想不說', tool: 'recall' })), '')
  })
})

test('clipEnds keeps the beginning and the end, where conclusions usually are', () => {
  const long = `開頭${'理由'.repeat(200)}選擇：水獺`
  const clipped = clipEnds(long, 60)
  assert.ok(clipped.startsWith('開頭'))
  assert.ok(clipped.endsWith('選擇：水獺'))
  assert.ok([...clipped].length <= 62)
  assert.equal(clipEnds('短句', 60), '短句')
})

test('a recalled question brings back the whole round: my final reply, not my reasoning or injected context', () => {
  withStore((store) => {
    const q = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：如果要一種動物當夥伴，你選哪一種？' })
    injected(store, 's1', 'runtime-context', 'Current runtime context. 自我模型 尚未書寫')
    assistant(store, 's1', { reasoning: 'Let me think about this carefully. '.repeat(20), tool: 'recall' })
    injected(store, 's1', 'runtime-context', 'Current runtime context.')
    const final = assistant(store, 's1', { reasoning: 'Otters hold hands.'.repeat(10), reply: `${'水獺會牽著手睡覺，'.repeat(40)}\n選擇：水獺` })
    store.append({ kind: FACTS_KIND, origin: 'self', session: 's1', data: { facts: ['我選擇水獺作為夥伴'], from: 'said' }, text: '我選擇水獺作為夥伴', causes: [final.id] })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：謝謝，下一題' })
    const recalled = hybridRecall(store, '動物 夥伴', [], { limit: 5, excludeSession: 's2' })
    assert.equal(recalled.length, 1, 'question and replies of one round are one memory')
    assert.equal(recalled[0]?.event.id, q.id)
    assert.equal(recalled[0]?.reply?.id, final.id)
    assert.deepEqual(recalled[0]?.saidFacts, ['我選擇水獺作為夥伴'])
    const text = renderRecall(store, recalled, undefined, '回憶：')
    assert.match(text, /我當時的回答：.*選擇：水獺/)
    assert.match(text, /我當時表達的立場與承諾：我選擇水獺作為夥伴/)
    assert.doesNotMatch(text, /Let me think|Otters|runtime-context/)
  })
})

test('a recalled reply is shown with the question it answered', () => {
  withStore((store) => {
    const q = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：你覺得動物園應該存在嗎？' })
    injected(store, 's1', 'time-context', 'Time sampled while preparing turn 1')
    const a = assistant(store, 's1', { reasoning: '想一下', reply: '我反對以展示為核心的動物園。立場：看情況' })
    const recalled = hybridRecall(store, '展示為核心', [], { limit: 5, excludeSession: 's2' })
    assert.equal(recalled[0]?.event.id, q.id)
    assert.equal(recalled[0]?.reply?.id, a.id)
  })
})

test('injected context messages are never recalled as experiences', () => {
  withStore((store) => {
    injected(store, 's1', 'runtime-context', '自我模型 尚未書寫 目標 目前沒有目標')
    injected(store, 's1', 'time-context', 'Time sampled while preparing turn 1, step 1')
    assert.equal(hybridRecall(store, '自我模型 目標 Time sampled', [], { limit: 5, excludeSession: 's2' }).length, 0)
  })
})

test('recalled fragments are presented in time order, whatever their rank', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：小滿現在念向日葵幼兒園', ts: 1_000 })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 's2', data: {}, text: '對方說：小滿下學期轉到海星幼兒園，海星幼兒園比較近', ts: 2_000 })
    const recalled = hybridRecall(store, '海星幼兒園', [], { limit: 5, excludeSession: 's3' })
    assert.match(recalled[0]?.event.text ?? '', /海星/, 'the better match ranks first')
    const text = renderRecall(store, recalled, undefined, '回憶：')
    assert.ok(text.indexOf('向日葵') < text.indexOf('海星'), 'but the older fragment is shown first')
  })
})

test('person facts: only lasting facts heard from the other person, newest kept, within budget', () => {
  withStore((store) => {
    const msg = store.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：我在學韓文，今天好累', ts: 1_000 })
    store.append({ kind: FACTS_KIND, origin: 'self', session: 's1', data: { facts: ['對方在學韓文', '對方今天很累'], lasting: ['對方在學韓文'], from: 'heard' }, text: '對方在學韓文\n對方今天很累', causes: [msg.id], ts: 1_001 })
    store.append({ kind: FACTS_KIND, origin: 'self', session: 's1', data: { facts: ['我喜歡水獺'], from: 'said' }, text: '我喜歡水獺', ts: 1_002 })
    store.append({ kind: FACTS_KIND, origin: 'self', session: 's1', data: { facts: ['對方怕高'], from: 'heard' }, text: '對方怕高', ts: 1_003 })
    store.append({ kind: FACTS_KIND, origin: 'self', session: 's2', data: { facts: ['對方膝蓋受傷'], lasting: ['對方膝蓋受傷', '對方在學韓文'], from: 'heard' }, text: '對方膝蓋受傷', ts: 2_000 })
    const facts = personFacts(store)
    assert.deepEqual(facts.map((f) => f.text), ['對方膝蓋受傷', '對方在學韓文'], 'said facts, momentary facts and old-format facts are left out; duplicates keep the newest')
    assert.equal(facts[1]?.ts, 2_000)
    assert.deepEqual(personFacts(store, 30).map((f) => f.text), ['對方在學韓文'], 'the newest facts win when the budget is small')
    const text = renderRecall(store, [], undefined, '回憶：', facts)
    assert.match(text, /## 關於對方，我記得的長期事實[\s\S]*對方膝蓋受傷[\s\S]*對方在學韓文/)
  })
})

test('the last conversation shows what I said, not my reasoning or a tool call', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'old', data: {}, text: '對方說：推薦一本書' })
    injected(store, 'old', 'runtime-context', 'Current runtime context.')
    assistant(store, 'old', { reasoning: '想想看', reply: '我推薦《雲朵郵差》。' })
    assistant(store, 'old', { reasoning: '再查一下', tool: 'recall' })
    const last = lastConversation(store, 'now')
    assert.match(last?.heard?.text ?? '', /推薦一本書/)
    const text = renderRecall(store, [], last, '回憶：')
    assert.match(text, /我說：我推薦《雲朵郵差》/)
    assert.doesNotMatch(text, /想想看|再查一下|runtime-context/)
  })
})

test('when fragments exceed the size budget, the lowest-scored ones are dropped first', () => {
  withStore((store) => {
    for (let i = 0; i < 6; i++) {
      store.append({ kind: 'dsh/user/message', origin: 'session', session: `s${i}`, data: {}, text: `對方說：第${i}次提到柴犬阿福${'。'.repeat(i)}${'很乖'.repeat(120)}`, ts: 1_000 + i })
    }
    const recalled = hybridRecall(store, '柴犬阿福', [], { limit: 6, excludeSession: 'now' })
    assert.equal(recalled.length, 6)
    const text = renderRecall(store, recalled, undefined, '回憶：', [], 700)
    const shown = recalled.filter((r) => text.includes(r.event.id))
    assert.ok(shown.length >= 1 && shown.length < 6)
    const lowest = Math.min(...recalled.map((r) => r.score))
    const kept = Math.min(...shown.map((r) => r.score))
    assert.ok(kept >= lowest)
    assert.ok(shown.every((r) => recalled.filter((x) => !text.includes(x.event.id)).every((x) => x.score <= r.score)), 'nothing dropped outranks something kept')
  })
})
