import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { corruptFrame, createFaultProxy, splitFrames, type FaultState } from '../fault-proxy.ts'

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
}

const frame = (event: Record<string, unknown>) => `event: ${String(event['type'])}\ndata: ${JSON.stringify(event)}`
const start = (index: number, name: string) => frame({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `t${index}`, name, input: {} } })
const delta = (index: number, partial: string) => frame({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partial } })
const partialOf = (f: string) => (JSON.parse(f.split('\n')[1]!.slice(5)) as { delta: { partial_json: string } }).delta.partial_json

test('only the first input delta of the target tool block is corrupted, and only as many times as allowed', () => {
  const state: FaultState = { target: 'deliberate', remaining: 1 }
  assert.equal(corruptFrame(start(0, 'recall'), state), start(0, 'recall'), 'another tool is left alone')
  assert.equal(partialOf(corruptFrame(delta(0, '{"q":'), state)), '{"q":')
  corruptFrame(start(1, 'deliberate'), state)
  assert.equal(partialOf(corruptFrame(delta(1, '{"situation":'), state)), '#{"situation":', 'the tool input is no longer valid JSON')
  assert.equal(partialOf(corruptFrame(delta(1, '"x"}'), state)), '"x"}', 'later deltas of the same block are untouched')
  assert.equal(state.remaining, 0)
  const next: FaultState = { target: 'deliberate', remaining: state.remaining }
  corruptFrame(start(1, 'deliberate'), next)
  assert.equal(partialOf(corruptFrame(delta(1, '{"situation":'), next)), '{"situation":', 'no budget left: the retried response passes through')
})

test('frames are split on blank lines; an incomplete tail is kept', () => {
  assert.deepEqual(splitFrames('event: a\ndata: {}\n\nevent: b\r\ndata: {}\r\n\r\nevent: c\ndata: {'), { frames: ['event: a\ndata: {}', 'event: b\ndata: {}'], rest: 'event: c\ndata: {' })
})

test('the proxy corrupts one streamed tool call, then serves the next response unchanged', async () => {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    // 故意把一個 frame 切成兩個 chunk：代理要等到完整的 frame 才處理。
    const body = `${start(0, 'deliberate')}\n\n${delta(0, '{"a":1}')}\n\n`
    res.write(body.slice(0, 40))
    setTimeout(() => res.end(body.slice(40)), 10)
  })
  const logs: Record<string, unknown>[] = []
  const shared = { remaining: 1 }
  const proxy = createFaultProxy(`http://127.0.0.1:${await listen(upstream)}`, 'deliberate', shared, (e) => logs.push(e))
  const port = await listen(proxy)
  try {
    const first = await (await fetch(`http://127.0.0.1:${port}/anthropic/v1/messages`, { method: 'POST', body: '{}' })).text()
    assert.match(first, /"partial_json":"#\{\\"a\\":1\}"/)
    const second = await (await fetch(`http://127.0.0.1:${port}/anthropic/v1/messages`, { method: 'POST', body: '{}' })).text()
    assert.match(second, /"partial_json":"\{\\"a\\":1\}"/)
    assert.equal(shared.remaining, 0)
    assert.deepEqual(logs.filter((e) => e['corrupted']).map((e) => e['corrupted']), ['t0'])
  } finally {
    proxy.close()
    upstream.close()
  }
})
