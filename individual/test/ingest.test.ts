import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { IngestState, fromSessionEvent } from '../src/life/ingest.ts'

// 測試替身：手寫的 DSH session 事件（形狀取自 dsh-session 0.2.2-alpha.2 的型別定義）。
function ev(seq: number, type: string, data: unknown): SessionEvent {
  return { type, seq, time: 1_700_000_000_000 + seq, data } as unknown as SessionEvent
}

test('human messages are indexed; injected temir context is stored but not indexed', () => {
  const state = new IngestState()
  const human = fromSessionEvent('s', ev(1, 'user/message', { id: 'm1', role: 'user', content: [{ type: 'text', text: '我搬到里昂了' }], source: { kind: 'user' } }), state)
  assert.equal(human.text, '對方說：我搬到里昂了')
  assert.equal(human.id, 's#1')
  assert.equal(human.kind, 'dsh/user/message')
  const injected = fromSessionEvent('s', ev(2, 'user/message', { id: 'm2', role: 'user', content: [{ type: 'text', text: '（回憶：…）' }], source: { kind: 'temir-recall', form: 'recall' } }), state)
  assert.equal(injected.text, undefined)
  assert.ok(injected.data)
})

test('assistant messages keep reasoning, reply, tool calls and the producing model', () => {
  const state = new IngestState()
  const out = fromSessionEvent('s', ev(3, 'assistant/message', {
    turn: 1, step: 1, stream: [],
    message: { id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash' }, content: [
      { type: 'reasoning', text: '想一想' }, { type: 'text', text: '好' }, { type: 'tool-call', id: 'c1', name: 'appraise', arguments: '{}' },
    ] },
  }), state)
  assert.equal(out.model, 'deepseek-official/deepseek-flash')
  assert.equal(out.text, '我想：想一想\n我說：好\n我使用工具 appraise：{}')
})

test('results of memory tools are stored but not indexed, other tool results are indexed', () => {
  const state = new IngestState()
  fromSessionEvent('s', ev(4, 'tool/call', { turn: 1, step: 1, callId: 'c1', name: 'recall', arguments: '{}' }), state)
  fromSessionEvent('s', ev(5, 'tool/call', { turn: 1, step: 1, callId: 'c2', name: 'bash', arguments: '{}' }), state)
  const recall = fromSessionEvent('s', ev(6, 'tool/result', { turn: 1, step: 1, message: { id: 'r1', role: 'tool', toolCallId: 'c1', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text: '找到 2 筆' }] } }), state)
  const bash = fromSessionEvent('s', ev(7, 'tool/result', { turn: 1, step: 1, message: { id: 'r2', role: 'tool', toolCallId: 'c2', source: { kind: 'tool', callId: 'c2' }, content: [{ type: 'text', text: 'ok' }] } }), state)
  assert.equal(recall.text, undefined)
  assert.equal(bash.text, '工具結果：ok')
})
