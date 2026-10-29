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
