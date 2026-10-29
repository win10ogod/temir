import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clockEnv } from '../run.ts'

const runner = join(fileURLToPath(new URL('.', import.meta.url)), '..')

test('clockEnv: no simulated time leaves the environment alone', () => {
  assert.deepEqual(clockEnv(undefined), {})
  assert.throws(() => clockEnv('不是時間'))
})

test('a child node process and the date shim both see the simulated time', () => {
  const env = { ...process.env, ...clockEnv('2026-06-05T20:15:00+08:00', process.env) }
  const fromNode = Number(execFileSync('node', ['-e', 'process.stdout.write(String(Date.now()))'], { env, encoding: 'utf8' }))
  assert.ok(Math.abs(fromNode - Date.parse('2026-06-05T20:15:00+08:00')) < 60_000, 'Date.now() in the child is the simulated time')
  const iso = execFileSync('node', ['-e', 'process.stdout.write(new Date().toISOString() + " " + (new Date(0)).toISOString() + " " + typeof Date())'], { env, encoding: 'utf8' })
  assert.match(iso, /^2026-06-05T12:1\d:\d\d\.\d{3}Z 1970-01-01T00:00:00\.000Z string$/, 'explicit dates are untouched; Date() still returns a string')
  const shown = execFileSync(join(runner, 'sim-bin', 'date'), ['-u', '+%Y-%m-%d %H'], { env, encoding: 'utf8' }).trim()
  assert.equal(shown, '2026-06-05 12')
  assert.equal(execFileSync(join(runner, 'sim-bin', 'date'), ['-u', '-d', '2020-01-02', '+%F'], { env, encoding: 'utf8' }).trim(), '2020-01-02', 'an explicit date is passed through')
})

test('relative date expressions are computed from the simulated now; weekday items follow GNU date', () => {
  const env = { ...process.env, ...clockEnv('2026-07-22T21:00:00+08:00', process.env) }
  const sim = (...args: string[]) => execFileSync(join(runner, 'sim-bin', 'date'), args, { env, encoding: 'utf8' }).trim()
  assert.equal(sim('-d', 'next monday', '+%F %a'), '2026-07-27 Mon', 'v3: the raw harness ran this and got the real next Monday')
  assert.equal(sim('-d', 'monday', '+%F'), '2026-07-27')
  assert.equal(sim('-d', 'wednesday', '+%F'), '2026-07-22', 'a bare weekday that is today is today')
  assert.equal(sim('-d', 'last wednesday', '+%F'), '2026-07-15')
  assert.equal(sim('--date=tomorrow', '+%F'), '2026-07-23')
  assert.equal(sim('--date', '3 days ago', '+%F'), '2026-07-19')
  assert.equal(sim('-d', '2026-06-13', '+%A'), 'Saturday', 'absolute dates are untouched')
  // 偏移為 0 時，星期項目的結果必須和真正的 GNU date 完全相同。
  const zero = { ...process.env, TEMIR_SIM_OFFSET_MS: '0' }
  for (const e of ['monday', 'next friday', 'last sunday', 'this thursday', 'Sat']) {
    const real = execFileSync('/usr/bin/date', ['-d', e, '+%F %H'], { encoding: 'utf8' }).trim()
    assert.equal(execFileSync(join(runner, 'sim-bin', 'date'), ['-d', e, '+%F %H'], { env: zero, encoding: 'utf8' }).trim(), real, e)
  }
})
