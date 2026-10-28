import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// v2 修正 1（experiments/specs/v2-amendment-1.md）：修正版契約與原始預先登記只能差在
// Nemotron 的模型字串、version 與新增的 amendment 說明。
const FREE = 'nvidia/nemotron-3.5-super-vl:free'
const PAID = 'nvidia/nemotron-3.5-super-vl'
const specs = fileURLToPath(new URL('../../specs/', import.meta.url))

for (const name of ['memory-accuracy-v2', 'personality-consistency-v2']) {
  test(`${name}: the amended contract differs from the pre-registration only in the Nemotron endpoint`, () => {
    const original = JSON.parse(readFileSync(`${specs}${name}.contract.json`, 'utf8')) as Record<string, unknown>
    const amended = JSON.parse(readFileSync(`${specs}${name}.amend1.contract.json`, 'utf8')) as Record<string, unknown>
    assert.equal(original['version'], '2.0.0')
    assert.equal(amended['version'], '2.1.0')
    assert.equal((amended['amendment'] as { id: string }).id, 'v2-amendment-1')
    const { version: _v1, ...restOriginal } = original
    const { version: _v2, amendment: _a, ...restAmended } = amended
    assert.deepEqual(restAmended, JSON.parse(JSON.stringify(restOriginal).replaceAll(FREE, PAID)))
    assert.ok(!JSON.stringify(restAmended).includes(FREE))
  })
}
