import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LifeStore } from '../src/life/store.ts'
import { isLocalHost, isLoopback, render } from '../src/panel/index.ts'

test('panel: only loopback requests are served by default', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.1.2.3']) assert.equal(isLoopback(a), true, a)
  for (const a of ['10.0.0.7', '192.168.1.2', '::ffff:10.0.0.7', 'fe80::1', undefined]) assert.equal(isLoopback(a), false, String(a))
  for (const h of ['localhost:18766', '127.0.0.1:18766', '[::1]:18766', 'localhost']) assert.equal(isLocalHost(h), true, h)
  for (const h of ['evil.example:18766', '127.0.0.1.evil.example', 'localhost.evil.example:80', undefined]) assert.equal(isLocalHost(h), false, String(h))
})

test('panel: state, timeline and search pages are read-only views of the life log; HTML is escaped', () => {
  const home = mkdtempSync(join(tmpdir(), 'temir-panel-'))
  const life = LifeStore.open(home)
  try {
    life.append({ kind: 'dsh/user/message', origin: 'session', session: 's1', data: {}, text: '對方說：<script>alert(1)</script> 我喜歡貓' })
    const before = life.lastSeq()
    const state = render(life, new URL('http://localhost/temir/'))!
    assert.match(state, /## 自我模型/)
    assert.match(state, /## 最近的 PC 循環/)
    const timeline = render(life, new URL('http://localhost/temir/timeline'))!
    assert.match(timeline, /&lt;script&gt;alert\(1\)&lt;\/script&gt; 我喜歡貓/)
    assert.doesNotMatch(timeline, /<script>alert/)
    const search = render(life, new URL('http://localhost/temir/search?q=喜歡貓'))!
    assert.match(search, /1 筆/)
    assert.match(render(life, new URL('http://localhost/temir/search'))!, /<form action="\/temir\/search">/)
    assert.equal(render(life, new URL('http://localhost/temir/nope')), undefined)
    assert.equal(life.lastSeq(), before, 'rendering writes nothing')
  } finally {
    life.close()
    rmSync(home, { recursive: true, force: true })
  }
})
