/** 印出 DeepSeek 帳戶的 USD 餘額（只用於計算批次花費；不印出金鑰）。 */
const key = process.env['DEEPSEEK_API_KEY']
if (!key) throw new Error('DEEPSEEK_API_KEY 未設定（先 source scripts/env.sh）')
const res = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` } })
const body = (await res.json()) as { balance_infos?: { currency: string; total_balance: string }[] }
const usd = body.balance_infos?.find((b) => b.currency === 'USD')
if (!usd) throw new Error('沒有 USD 餘額資訊')
console.log(usd.total_balance)
