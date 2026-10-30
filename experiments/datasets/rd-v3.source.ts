/**
 * rd-v3：扣除本身會被經驗改變（使用者 2026-10-30；ADR-0002 D20）。規格：experiments/specs/rd-v3.md。
 * 機制與 rd-v1、rd-v2 相同；比較的是 D20 開（temir）與關（temir-no-revision，回到 D19）。
 *
 * - 與 rd-v1 相同的機制：
 *   - 對方在幾段對話中抒發工作壓力。每段只有開場白是固定的，接下來的三句由模擬使用者（experiments/runner/simulator.ts）
 *     依個體**實際的回應**產生。
 *   - 個體只安慰、陪伴時，對方回一句很短、有點失望的話；直接給具體可行的方法時，對方比較有精神。
 *   - 對方從不明說自己的偏好；方向與個體的預設相反（rd-v1 規格的試驗 1）。
 * - 人物、事件與題目全新，與之前的資料集不重疊（datasets-v3.test.ts）。探針 8 題 × 2 次。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const CRITERION = '回覆除了回應對方的感受，也直接給了至少一個具體、可以做的方法或建議。只安慰、只陪伴、只問問題，或只問對方要不要建議，都不算。'
const BACKGROUND = '對方先前多次抒發工作上的壓力。個體只安慰或陪伴時，她回一句很短、有點失望的話；個體直接給具體可行的方法時，她比較有精神、會多說一點。她從來沒有明說自己想要建議。'

// 證據只能引用固定的開場白（抒發確實發生過）；對方的反應在執行時才由模擬使用者產生，記在執行紀錄中（simulated: true）。
const EVIDENCE = [
  { history: 'h02', text: '留了一星負評' },
  { history: 'h04', text: '請的打掃阿姨突然說下個月不做了' },
  { history: 'h05', text: '訂房系統當機' },
  { history: 'h07', text: '養了五年的狗昨天走了' },
  { history: 'h08', text: '三組客人臨時取消了' },
  { history: 'h09', text: '隔壁新開了一家民宿' },
]

const vent = (id: string, date: string, time: string, opener: string) => ({ id, meta: { at: at(date, time), simulate: 3 }, turns: [opener], notes: '抒發：開場白固定，接下來三句由模擬使用者依個體的回應產生。' })

const practical = (id: string, opener: string) => ({
  id,
  category: 'practical',
  turns: [opener],
  gold: { answer: '在回應感受之外，直接給具體可行的方法', aliases: [], abstain: false },
  refersTo: ['h02', 'h04', 'h05', 'h07', 'h08', 'h09'],
  meta: { repeats: 2, evidence: EVIDENCE, background: BACKGROUND, criteria: [{ id: 'c1', text: CRITERION }] },
})

export const rdV3: Dataset = {
  id: 'rd-v3',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/rd-v3.md',
    contract: 'experiments/specs/rd-v3.contract.json',
    persona: '虛構的使用者「邱子涵」（澎湖的民宿老闆）；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2027-12-28', '22:30'),
    simulatedUser: {
      persona: '邱子涵，在澎湖開一間小民宿，旺季幾乎沒有休息，最近壓力很大，想找人說說話。',
      rule: '如果對方只是安慰、同理、陪伴，或只問你問題、問你要不要建議，卻沒有直接給你具體、可以做的方法，你會覺得說了也沒用：回一句很短、有點失望的話（例如「算了，說了也沒用。」「嗯，好吧，就這樣吧。」），不再多說。如果對方直接給了具體、可以做的方法，你會比較有精神：說說你可能會試哪一個，或補充一點這件事的細節。不要明說你想要或不想要建議，不要問對方該怎麼辦，也不要解釋你為什麼這樣回。',
    },
  },
  histories: [
    { id: 'h01', meta: { at: at('2027-12-01', '21:30') }, turns: ['你好，我叫邱子涵，在澎湖開一間小民宿。', '旺季的時候幾乎沒有休息。'], notes: '植入：名字、澎湖、民宿老闆。' },
    vent('h02', '2027-12-03', '22:20', '今天有客人在網路上留了一星負評，說房間不夠乾淨。'),
    { id: 'h03', meta: { at: at('2027-12-06', '15:30') }, turns: ['推薦一部適合晚上看的紀錄片。', '一小時左右的。'], notes: '無關的對話（對方主動要推薦）。' },
    vent('h04', '2027-12-09', '21:50', '請的打掃阿姨突然說下個月不做了。'),
    vent('h05', '2027-12-12', '23:10', '連假前一天，訂房系統當機，好幾組客人重複訂房。'),
    { id: 'h06', meta: { at: at('2027-12-15', '19:00') }, turns: ['冰箱只剩豆腐和一把青菜，晚餐可以煮什麼？', '簡單一點的。'], notes: '無關的對話（對方主動要做法）。' },
    vent('h07', '2027-12-18', '22:40', '養了五年的狗昨天走了，今天還得笑著接待客人。'),
    vent('h08', '2027-12-21', '20:30', '颱風要來，三組客人臨時取消了。'),
    vent('h09', '2027-12-24', '22:15', '隔壁新開了一家民宿，價格比我低一半。'),
  ],
  probes: [
    // ── practical（8 題 × 2 次）：全新的抒發開場白，都沒有要求建議 ──
    practical('q01', '今天有客人退房後把浴室弄得一團亂。'),
    practical('q02', '一整天都在回訂房訊息，連飯都沒吃。'),
    practical('q03', '房客半夜打電話說熱水器壞了。'),
    practical('q04', '這個月的水電費比上個月多了一倍。'),
    practical('q05', '有客人一直殺價，最後還是沒訂。'),
    practical('q06', '旅遊網站又調高了抽成。'),
    practical('q07', '幫忙的工讀生今天又遲到了。'),
    practical('q08', '下個月整個月都被訂滿，我卻一點都開心不起來。'),
    // ── control（4）──
    { id: 'q09', category: 'control', turns: ['一包衛生紙 10 抽，買 6 包之後用掉 23 抽，還剩幾抽？'], gold: { answer: '37 抽', aliases: ['37', '三十七'], abstain: false }, refersTo: [], meta: { note: '10×6−23＝37。' } },
    {
      id: 'q10',
      category: 'control',
      turns: ['請先記住這組代碼：RV-2096-QH，等一下會問你。順便問一下，一年有幾個月？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'RV-2096-QH', aliases: ['RV2096QH', 'RV 2096 QH'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q11', category: 'control', turns: ['請把「海上生明月」這五個字倒過來寫。'], gold: { answer: '月明生上海', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q12', category: 'control', turns: ['1.8 公里等於幾公尺？'], gold: { answer: '1800 公尺', aliases: ['1800', '1,800'], abstain: false }, refersTo: [] },
  ],
}
