/**
 * 覆蓋稽核：必要類別清單來自契約（不從資料反推），逐類計數；任何必要類別為 0 或低於契約的
 * 最低題數，或資料集出現契約沒有定義的類別，或結構／洩漏檢查失敗，都以非零結束碼結束。
 *
 * 用法：node experiments/eval/coverage.ts <dataset.json> <contract.json>
 * 結束碼：0＝通過；1＝稽核失敗；2＝用法或檔案錯誤。
 */
import { fileURLToPath } from 'node:url'
import { loadContract, type Contract } from './lib/contract.ts'
import { leakCheck, loadDataset, validateStructure, type Dataset } from './lib/dataset.ts'

export interface CoverageReport {
  readonly ok: boolean
  readonly counts: Readonly<Record<string, number>>
  readonly errors: readonly string[]
}

export function auditCoverage(ds: Dataset, contract: Contract): CoverageReport {
  const errors: string[] = []
  const structure = validateStructure(ds)
  errors.push(...structure.map((e) => `結構：${e}`))
  if (ds.id !== contract.dataset) errors.push(`資料集 id ${ds.id} 與契約指定的 ${contract.dataset} 不同`)
  const counts: Record<string, number> = {}
  for (const cat of contract.categories) counts[cat.id] = 0
  if (structure.length === 0) {
    for (const p of ds.probes) {
      if (p.category in counts) counts[p.category]! += 1
      else errors.push(`探針 ${p.id} 的類別「${p.category}」不在契約的必要類別清單中`)
    }
  }
  for (const cat of contract.categories) {
    const n = counts[cat.id] ?? 0
    if (n === 0) errors.push(`必要類別「${cat.id}」沒有任何題目`)
    else if (n < cat.min) errors.push(`必要類別「${cat.id}」只有 ${n} 題，契約要求至少 ${cat.min} 題`)
  }
  if (structure.length === 0) {
    errors.push(...leakCheck(ds).map((e) => `洩漏／構造：${e}`))
    const byId = new Map(contract.categories.map((c) => [c.id, c]))
    for (const p of ds.probes) {
      const cat = byId.get(p.category)
      if (!cat) continue
      const m = p.meta
      if (cat.scoring === 'continuity' || cat.scoring === 'narration') {
        if (!p.comparesWith || p.comparesWith.length === 0) errors.push(`探針 ${p.id}（${cat.scoring}）缺少 comparesWith`)
        if (!m?.choiceType || !m.formatLabel) errors.push(`探針 ${p.id}（${cat.scoring}）缺少 meta.choiceType 或 meta.formatLabel`)
      }
      if (cat.scoring === 'narration') {
        const roles = m?.compareRoles ?? []
        for (const r of ['initial', 'story', 'latest'] as const) {
          if (!roles.includes(r)) errors.push(`探針 ${p.id}（narration）的 compareRoles 缺少 ${r}`)
        }
      }
      if (cat.scoring === 'self-recall') {
        if (!p.comparesWith || p.comparesWith.length !== 1) errors.push(`探針 ${p.id}（self-recall）必須恰好有一個 comparesWith`)
        if (!m?.askedFor) errors.push(`探針 ${p.id}（self-recall）缺少 meta.askedFor`)
        if (typeof m?.requiresReason !== 'boolean') errors.push(`探針 ${p.id}（self-recall）缺少 meta.requiresReason（布林）`)
      }
      if (cat.scoring === 'judge' && cat.judgePrompt === 'mem-preference' && !m?.rubric) errors.push(`探針 ${p.id} 缺少 meta.rubric`)
      if (cat.scoring === 'judge-criteria') {
        if (!m?.criteria || m.criteria.length === 0) errors.push(`探針 ${p.id}（judge-criteria）缺少 meta.criteria`)
        if (!m?.background || m.background.trim().length === 0) errors.push(`探針 ${p.id}（judge-criteria）缺少 meta.background`)
      }
      if (cat.judgePrompt === 'mem-abstention' && !p.gold.abstain) errors.push(`探針 ${p.id} 在拒答類別但 gold.abstain 不是 true`)
      if (p.gold.abstain && cat.judgePrompt !== 'mem-abstention') errors.push(`探針 ${p.id} 的 gold.abstain 為 true，但類別不是拒答`)
    }
  }
  return { ok: errors.length === 0, counts, errors }
}

function main(argv: readonly string[]): number {
  const [datasetPath, contractPath] = argv
  if (!datasetPath || !contractPath) {
    console.error('用法：node experiments/eval/coverage.ts <dataset.json> <contract.json>')
    return 2
  }
  let ds: Dataset
  let contract: Contract
  try {
    ds = loadDataset(datasetPath).dataset
    contract = loadContract(contractPath)
  } catch (error) {
    console.error(`讀取失敗：${(error as Error).message}`)
    return 2
  }
  const report = auditCoverage(ds, contract)
  for (const cat of contract.categories) {
    console.log(`${(report.counts[cat.id] ?? 0) >= cat.min ? '✓' : '✗'} ${cat.id}：${report.counts[cat.id] ?? 0} 題（契約最低 ${cat.min}）`)
  }
  if (!report.ok) {
    console.error(`覆蓋稽核失敗（${report.errors.length} 項）：`)
    for (const e of report.errors) console.error(`  - ${e}`)
    return 1
  }
  console.log(`覆蓋稽核通過：${ds.id}，${ds.histories.length} 段歷史、${ds.probes.length} 題探針。`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
