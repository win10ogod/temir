import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createProxy, pinBody, servedProvider } from '../openrouter-pin.ts'

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
}

test('chat completions get the bf16 provider routing; other paths are untouched', () => {
  const pinned = JSON.parse(pinBody('/api/v1/chat/completions', Buffer.from('{"model":"m"}')).toString()) as { provider: { quantizations: string[] } }
  assert.deepEqual(pinned.provider.quantizations, ['bf16'])
  assert.equal(pinBody('/api/v1/models', Buffer.from('x')).toString(), 'x')
  assert.equal(servedProvider('data: {"id":"1","provider":"Crusoe","choices":[]}'), 'Crusoe')
})

test('an upstream that dies mid-stream ends that response only; the proxy keeps serving', async () => {
  let calls = 0
  const upstream = createServer((_req, res) => {
    calls++
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"provider":"Crusoe"}\n\n')
    if (calls === 1) setTimeout(() => res.socket?.destroy(), 20) // 第一個請求：串流中途斷線
    else res.end('data: [DONE]\n\n')
  })
  const logs: Record<string, unknown>[] = []
  const proxy = createProxy(`http://127.0.0.1:${await listen(upstream)}`, (e) => logs.push(e))
  const port = await listen(proxy)
  try {
    const first = await fetch(`http://127.0.0.1:${port}/openrouter.ai/api/v1/chat/completions`, { method: 'POST', body: '{}' })
    await assert.rejects(first.text(), 'the broken stream reaches the client as an error')
    const second = await fetch(`http://127.0.0.1:${port}/openrouter.ai/api/v1/chat/completions`, { method: 'POST', body: '{}' })
    assert.match(await second.text(), /\[DONE\]/, 'the proxy survived and serves the next request')
    assert.ok(logs.some((e) => String(e['error'] ?? '').startsWith('stream:')), 'the broken stream is logged')
    assert.ok(logs.some((e) => e['provider'] === 'Crusoe' && e['error'] === undefined))
  } finally {
    proxy.close()
    upstream.close()
  }
})
