import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { parseAux } from '../src/recall/aux.ts'
import { COMPACTION_KIND, FACTS_KIND, STM_PAGES, clipEnds, fuse, hybridRecall, knownFacts, lastConversation, personFacts, recalledOf, recentPages, renderRecall, replyOf, selectFacts, sessionSoFar, shadowedIds, shortId, workingSetDue } from '../src/recall/retrieve.ts'

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
    const text = renderRecall(store, recalled, undefined, '回憶：', [], { maxChars: 700 })
    const shown = recalled.filter((r) => text.includes(shortId(r.event.id)))
    assert.ok(shown.length >= 1 && shown.length < 6)
    const lowest = Math.min(...recalled.map((r) => r.score))
    const kept = Math.min(...shown.map((r) => r.score))
    assert.ok(kept >= lowest)
    assert.ok(shown.every((r) => recalled.filter((x) => !text.includes(shortId(x.event.id))).every((x) => x.score <= r.score)), 'nothing dropped outranks something kept')
  })
})

test('progressive disclosure: the best fragments in full, the rest as one-line index entries that recall can expand', () => {
  withStore((store) => {
    for (let i = 0; i < 5; i++) {
      const m = store.append({ kind: 'dsh/user/message', origin: 'session', session: `s${i}`, data: {}, text: `對方說：第${i}次聊到柴犬阿福${'，牠很乖'.repeat(i)}`, ts: 1_000 + i })
      store.append({ kind: FACTS_KIND, origin: 'self', session: `s${i}`, data: { facts: [`阿福第${i}件事`], from: 'heard' }, text: `阿福第${i}件事`, causes: [m.id] })
    }
    const recalled = hybridRecall(store, '柴犬阿福', [], { limit: 5, excludeSession: 'now' })
    const text = renderRecall(store, recalled, undefined, '回憶：', [], { expand: 2 })
    const best = [...recalled].sort((a, b) => b.score - a.score)
    const full = text.split('## 其他可能相關的片段')[0] ?? ''
    const index = text.split('## 其他可能相關的片段')[1] ?? ''
    for (const r of best.slice(0, 2)) assert.ok(full.includes(shortId(r.event.id)), 'the two best are shown in full')
    for (const r of best.slice(2)) assert.ok(index.includes(`[${shortId(r.event.id)}｜`) && !full.includes(shortId(r.event.id)), 'the rest only as index lines')
    assert.match(index, /recall 工具的 ids 參數展開/)
    assert.match(index, /阿福第\d件事/, 'index lines carry the extracted gist')
    const expanded = recalledOf(store, best[4]!.event.id)
    assert.equal(expanded?.event.id, best[4]!.event.id)
    assert.deepEqual(expanded?.facts, [`阿福第${best[4]!.event.text?.match(/第(\d)次/)?.[1]}件事`])
  })
})

test('a fact marked outdated stops being listed until it is heard again', () => {
  withStore((store) => {
    store.append({ kind: FACTS_KIND, origin: 'self', data: { facts: ['對方住在台北'], lasting: ['對方住在台北'], from: 'heard' }, text: '對方住在台北', ts: 1_000 })
    store.append({ kind: 'memory/outdated', origin: 'self', data: { fact: '對方住在台北', replacedBy: '對方住在花蓮', evidence: [] }, ts: 2_000 })
    assert.deepEqual(personFacts(store).map((f) => f.text), [])
    store.append({ kind: FACTS_KIND, origin: 'self', data: { facts: ['對方住在台北'], lasting: ['對方住在台北'], from: 'heard' }, text: '對方住在台北', ts: 3_000 })
    assert.deepEqual(personFacts(store).map((f) => f.text), ['對方住在台北'])
  })
})

test('rd and bookkeeping records are not recalled as memories, but lessons are', () => {
  withStore((store) => {
    store.append({ kind: 'rd/decision', origin: 'self', session: 's1', data: {}, text: '處境：對方想去爬山' })
    store.append({ kind: 'rd/outcome', origin: 'self', session: 's1', data: {}, text: '預測：爬山 實際：爬山' })
    store.append({ kind: 'memory/outdated', origin: 'self', data: {}, text: '爬山' })
    assert.equal(hybridRecall(store, '爬山', [], { limit: 5 }).length, 0)
    store.append({ kind: 'memory/lesson', origin: 'self', data: {}, text: '教訓：推薦爬山前先問對方的體力' })
    assert.equal(hybridRecall(store, '爬山', [], { limit: 5 }).length, 1)
  })
})

test('script drift: traditional input with simplified output triggers a retry; otherwise not', async () => {
  const { driftedToSimplified } = await import('../src/recall/script.ts')
  assert.equal(driftedToSimplified('你剛才的建議我不太想聽', '对方表示刚才的建议不太想听，只是想抒发'), true)
  assert.equal(driftedToSimplified('你剛才的建議我不太想聽', '對方表示剛才的建議不太想聽'), false)
  assert.equal(driftedToSimplified('你刚才的建议我不太想听', '对方表示刚才的建议不太想听'), false, 'simplified input is left alone')
  assert.equal(driftedToSimplified('hello', '对说'), false, 'no traditional evidence in the input')
})

test('script drift ignores characters that traditional text also uses', async () => {
  const { driftedToSimplified } = await import('../src/recall/script.ts')
  assert.equal(driftedToSimplified('我們去看松樹，主管批准了', '松樹很高，主管批准，大家很喜歡'), false)
})

test('a string value missing its opening quote is repaired; other malformed JSON is not guessed', async () => {
  const { extractJson } = await import('../src/recall/aux.ts')
  const broken = '{"candidates": [{"action": "暫時不回覆", "kind": "拒絕", "prediction": 對方可能覺得被忽視，也可能覺得被尊重。", "confidence": 20}]}'
  const parsed = extractJson(broken) as { candidates: { prediction: string; confidence: number }[] } | undefined
  assert.equal(parsed?.candidates[0]?.prediction, '對方可能覺得被忽視，也可能覺得被尊重。')
  assert.equal(parsed?.candidates[0]?.confidence, 20)
  assert.deepEqual(extractJson('{"a": 1, "b": true, "c": null, "d": [1, 2], "e": {"f": "g"}}'), { a: 1, b: true, c: null, d: [1, 2], e: { f: 'g' } })
  assert.equal(extractJson('{"facts": [未加引號]}'), undefined)
})

test('short ids are what the recall shows, and they resolve back to exactly one event', () => {
  withStore((store) => {
    const a = store.append({ kind: 'dsh/user/message', origin: 'session', session: 'session-5cd20c14-1b68-4b1e-9d97-b2c87ecd69e2', data: {}, text: '對方說：我住在吉安鄉', id: 'session-5cd20c14-1b68-4b1e-9d97-b2c87ecd69e2#23' })
    const b = store.append({ kind: 'appraisal', origin: 'self', data: {}, text: '我的感受', id: 'l:350cc6a4-5b30-4636-bbb2-456a27208c08' })
    assert.equal(shortId(a.id), '5cd20c14#23')
    assert.equal(shortId(b.id), 'l:350cc6a4')
    assert.equal(shortId('g:ad5e640f'), 'g:ad5e640f', 'other ids are left alone')
    assert.equal(store.resolveId('5cd20c14#23'), a.id)
    assert.equal(store.resolveId('l:350cc6a4'), b.id)
    assert.equal(store.resolveId(a.id), a.id, 'full ids resolve to themselves')
    assert.equal(store.resolveId('5cd20c14#24'), undefined)
    assert.equal(store.resolveId('胡亂的字串'), undefined)
  })
})

test('progressive index lines do not repeat facts already listed about the person; full fragments keep only the conclusion', () => {
  withStore((store) => {
    const facts = (ts: number, text: string, cause: string) => store.append({ kind: FACTS_KIND, origin: 'self', data: { facts: [text], lasting: [text], from: 'heard' }, text, causes: [cause], ts })
    for (let i = 0; i < 5; i++) {
      const m = store.append({ kind: 'dsh/user/message', origin: 'session', session: `s${i}`, data: {}, text: `對方說：關於柴犬阿福的第${i}件事`, ts: 1_000 + i })
      facts(1_001 + i, `阿福第${i}件事`, m.id)
    }
    const recalled = hybridRecall(store, '柴犬阿福', [], { limit: 5, excludeSession: 'now' })
    const person = personFacts(store)
    const text = renderRecall(store, recalled, undefined, '回憶：', person, { expand: 1 })
    const index = text.split('## 其他可能相關的片段')[1] ?? ''
    assert.equal(index.split('\n').filter((l) => l.startsWith('- [')).length, 0, 'all remaining gists are already listed about the person')
  })
})

test('the facts shown every time are bounded: facts sharing terms with the cue first, then the newest; the rest are counted', () => {
  withStore((store) => {
    const texts = ['對方的名字是鍾子珩', '對方對花生過敏', '對方住在吉安鄉', '對方養了一隻柴犬', '對方在學韓文', '對方最近想學做麵包']
    texts.forEach((text, i) => {
      const m = store.append({ kind: 'dsh/user/message', origin: 'session', session: `s${i}`, data: {}, text: `對方說：${text}`, ts: 1_000 + i })
      store.append({ kind: FACTS_KIND, origin: 'self', session: `s${i}`, data: { facts: [text], lasting: [text], from: 'heard' }, text, causes: [m.id], ts: 1_000 + i })
    })
    const known = knownFacts(store)
    assert.equal(known.length, 6)
    const cost = (t: string) => t.length + 14
    // 前一半剛好放得下兩條和線索有共同詞的事實（花生、麵包），後一半依新到舊補滿。
    const budget = 2 * (cost('對方對花生過敏') + cost('對方最近想學做麵包'))
    const chosen = selectFacts(known, budget, '晚餐想做花生醬麵包')
    assert.deepEqual(
      chosen.map((f) => f.text),
      ['對方對花生過敏', '對方養了一隻柴犬', '對方在學韓文', '對方最近想學做麵包'],
      'the allergy is old but shares a term with the cue, so it is kept; the rest of the budget goes to the newest; shown in time order',
    )
    assert.deepEqual(selectFacts(known, budget).map((f) => f.text), ['對方住在吉安鄉', '對方養了一隻柴犬', '對方在學韓文', '對方最近想學做麵包'], 'without a cue: newest first')
    const text = renderRecall(store, [], undefined, '回憶：', chosen, { omittedFacts: known.length - chosen.length })
    assert.match(text, /另有 2 條較早、和現在的話題比較無關的事實沒有列出/)
    assert.match(text, /（1970\/01\/01）\n- 對方對花生過敏/, 'facts heard on the same day share one date line')
  })
})

test('sessionSoFar: what was heard and said in this session, in order, without the cue being deliberated', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'old', data: {}, text: '對方說：別的對話' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'now', data: {}, text: '對方說：今天被家屬罵了' })
    injected(store, 'now', 'runtime-context', '執行環境')
    assistant(store, 'now', { reasoning: '想想看', reply: '聽起來很委屈。' })
    assistant(store, 'now', { tool: 'recall' })
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'now', data: {}, text: '對方說：嗯。' })
    assert.deepEqual(sessionSoFar(store, 'now', '嗯。'), ['對方：今天被家屬罵了', '我：聽起來很委屈。'])
    assert.deepEqual(sessionSoFar(store, 'now', '還沒寫進日誌的話'), ['對方：今天被家屬罵了', '我：聽起來很委屈。', '對方：嗯。'])
    assert.deepEqual(sessionSoFar(store, 'now', '嗯。', 1), ['我：聽起來很委屈。'])
    assert.deepEqual(sessionSoFar(store, 'empty', '你好'), [])
  })
})

/** 依 dsh-compaction-basic 的形狀建立壓縮摘要事件（生命日誌 id 為 `${session}#${seq}`）。 */
function compaction(store: LifeStore, session: string, seq: number, shadowedSeqs: readonly number[]) {
  return store.append({ id: `${session}#${seq}`, kind: COMPACTION_KIND, origin: 'session', session, data: { type: 'compaction/summary', seq, data: { shadowedSeqs, summary: [] } } })
}
const heardAt = (store: LifeStore, session: string, seq: number, text: string) =>
  store.append({ id: `${session}#${seq}`, kind: 'dsh/user/message', origin: 'session', session, data: {}, text: `對方說：${text}` })

test('recentPages: the latest pages before this session, oldest first, across sessions, with my final reply', () => {
  withStore((store) => {
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'a', data: {}, text: '對方說：第一段的開頭' })
    assistant(store, 'a', { reply: '回第一段' })
    for (let i = 0; i < STM_PAGES; i++) {
      store.append({ kind: 'dsh/user/message', origin: 'session', session: 'b', data: {}, text: `對方說：第二段第 ${i} 句` })
      assistant(store, 'b', { reasoning: '想', reply: `回第 ${i} 句` })
      assistant(store, 'b', { tool: 'recall' })
    }
    injected(store, 'b', 'runtime-context', '執行環境')
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'now', data: {}, text: '對方說：現在這段' })
    const pages = recentPages(store, 'now')
    assert.equal(pages.length, STM_PAGES)
    assert.match(pages[0]!.heard.text ?? '', /第二段第 0 句/)
    assert.equal(replyOf(pages.at(-1)!.reply!), `回第 ${STM_PAGES - 1} 句`)
    const two = recentPages(store, 'now', STM_PAGES + 1)
    assert.match(two[0]!.heard.text ?? '', /第一段的開頭/)
    const text = renderRecall(store, [], undefined, '回憶：', [], { recent: two })
    assert.match(text, /## 最近的對話（短期記憶：這段對話之前最近的 8 個回合，依時間先後）\n- \[[^\]]+\] 對方說：第一段的開頭\n    ↳ \[[^\]]+\] 我當時的回答：回第一段\n（以下是另一段對話）/)
    assert.doesNotMatch(text, /最近一次對話|現在這段|執行環境/)
  })
})

test('compaction: shadowed parts of this session are recalled again; what is still in context is not', () => {
  withStore((store) => {
    heardAt(store, 'now', 3, '我女兒叫小葵，下個月滿五歲')
    heardAt(store, 'now', 9, '小葵最近在學游泳')
    store.append({ kind: 'dsh/user/message', origin: 'session', session: 'old', data: {}, text: '對方說：小葵喜歡畫畫' })
    assert.deepEqual(hybridRecall(store, '小葵', [], { limit: 5, excludeSession: 'now' }).map((r) => r.event.session), ['old'])
    compaction(store, 'now', 20, [1, 3, 5])
    const shadowed = shadowedIds(store, 'now')
    assert.deepEqual([...shadowed], ['now#1', 'now#3', 'now#5'])
    const hits = hybridRecall(store, '小葵', [], { limit: 5, excludeSession: 'now', shadowed })
    assert.deepEqual(hits.map((r) => r.event.id).sort(), ['now#3', hits.find((r) => r.event.session === 'old')!.event.id].sort())
    assert.deepEqual(hybridRecall(store, '小葵', [], { limit: 5, excludeSession: 'now', shadowed, excludeIds: new Set(['now#3']) }).map((r) => r.event.session), ['old'])
  })
})

test('workingSetDue: long-term facts come back on the first turn and once after each compaction', () => {
  withStore((store) => {
    assert.deepEqual(workingSetDue(store, 's', true), { working: true, afterCompaction: false, compacted: false })
    store.append({ kind: 'memory/recall', origin: 'self', session: 's', data: { mode: 'automatic', working: true } })
    assert.deepEqual(workingSetDue(store, 's', false), { working: false, afterCompaction: false, compacted: false })
    compaction(store, 's', 50, [1, 2])
    assert.deepEqual(workingSetDue(store, 's', false), { working: true, afterCompaction: true, compacted: true })
    store.append({ kind: 'memory/recall', origin: 'self', session: 's', data: { mode: 'automatic', working: true } })
    assert.deepEqual(workingSetDue(store, 's', false), { working: false, afterCompaction: false, compacted: true })
  })
})
