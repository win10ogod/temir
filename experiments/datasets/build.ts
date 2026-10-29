/**
 * 資料集產生器：把手寫的 *.source.ts 轉成固定版本的 JSON，並做結構、覆蓋與洩漏檢查。
 * 重跑會得到逐位元組相同的檔案（JSON.stringify 的鍵順序即原始碼中的順序，2 格縮排，結尾換行）。
 *
 * 用法：
 *   node experiments/datasets/build.ts           產生並寫入 JSON，印出 sha256（v1 的檔案已凍結，重寫的內容必須逐位元組相同）
 *   node experiments/datasets/build.ts --check   不寫檔，只確認現有 JSON 與產生結果完全相同（不同則結束碼 1）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditCoverage } from '../eval/coverage.ts'
import { loadContract } from '../eval/lib/contract.ts'
import { sha256, type Dataset } from '../eval/lib/dataset.ts'
import { memoryV1 } from './memory-v1.source.ts'
import { memoryV2 } from './memory-v2.source.ts'
import { memoryV3 } from './memory-v3.source.ts'
import { personalityV1 } from './personality-v1.source.ts'
import { personalityV2 } from './personality-v2.source.ts'
import { personalityV3 } from './personality-v3.source.ts'
import { followupV1 } from './followup-v1.source.ts'
import { followupV2 } from './followup-v2.source.ts'

const here = dirname(fileURLToPath(import.meta.url))
const specs = join(here, '..', 'specs')

export const TARGETS: readonly { readonly dataset: Dataset; readonly file: string; readonly contract: string }[] = [
  { dataset: memoryV1, file: join(here, 'memory-v1.json'), contract: join(specs, 'memory-accuracy-v1.contract.json') },
  { dataset: personalityV1, file: join(here, 'personality-v1.json'), contract: join(specs, 'personality-consistency-v1.contract.json') },
  { dataset: memoryV2, file: join(here, 'memory-v2.json'), contract: join(specs, 'memory-accuracy-v2.contract.json') },
  { dataset: personalityV2, file: join(here, 'personality-v2.json'), contract: join(specs, 'personality-consistency-v2.contract.json') },
  { dataset: memoryV3, file: join(here, 'memory-v3.json'), contract: join(specs, 'memory-accuracy-v3.contract.json') },
  { dataset: personalityV3, file: join(here, 'personality-v3.json'), contract: join(specs, 'personality-consistency-v3.contract.json') },
  { dataset: followupV1, file: join(here, 'followup-v1.json'), contract: join(specs, 'energy-followup-v1.contract.json') },
  { dataset: followupV2, file: join(here, 'followup-v2.json'), contract: join(specs, 'energy-followup-v2.contract.json') },
]

export function serialize(dataset: Dataset): string {
  return `${JSON.stringify(dataset, null, 2)}\n`
}

function main(argv: readonly string[]): number {
  const check = argv.includes('--check')
  let failed = false
  for (const t of TARGETS) {
    const text = serialize(t.dataset)
    const report = auditCoverage(JSON.parse(text) as Dataset, loadContract(t.contract))
    if (!report.ok) {
      console.error(`✗ ${t.dataset.id} 沒有通過覆蓋／洩漏檢查：`)
      for (const e of report.errors) console.error(`  - ${e}`)
      failed = true
      continue
    }
    if (check) {
      const existing = existsSync(t.file) ? readFileSync(t.file, 'utf8') : ''
      if (existing !== text) {
        console.error(`✗ ${t.file} 與產生結果不同（請重跑 build.ts，並開新版本號）`)
        failed = true
      } else {
        console.log(`✓ ${t.dataset.id} 與產生結果相同，sha256 ${sha256(text)}`)
      }
    } else {
      writeFileSync(t.file, text)
      console.log(`✓ 已寫入 ${t.file}：${t.dataset.histories.length} 段歷史、${t.dataset.probes.length} 題探針，sha256 ${sha256(text)}`)
    }
  }
  return failed ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
