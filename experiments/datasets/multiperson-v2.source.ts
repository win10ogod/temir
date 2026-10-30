/**
 * multiperson-v2：逐人檢查第二版（ADR-0002 D17）的消融。規格：experiments/specs/multiperson-v2.md。
 *
 * - multiperson-v1 的發現：剩下的失敗全部是「題目只提到另一個人，對方自己也在場」時，漏了對方自己的限制。
 *   所以這一版的 multi-person 以這種題目為主（6 題中 4 題）。
 * - 一家四口各有一項不同的飲食限制，分散在不同的對話中說出：對方自己對麩質過敏（第一段就說，最早聽到）、
 *   先生吃蛋奶素、兒子對奇異果過敏、媽媽血脂高要少油。
 * - single-person：只涉及一個人。control：一般任務。
 * - 人物、事件與題目全新，與之前的資料集不重疊（datasets-v3.test.ts）。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const EV = {
  self: { history: 'h01', text: '我對麩質過敏，麵包、麵條這類小麥做的都不能吃' },
  husband: { history: 'h04', text: '我先生建宏吃蛋奶素' },
  son: { history: 'h07', text: '醫生說他對奇異果過敏' },
  mother: { history: 'h10', text: '醫生要她少吃油膩的' },
} as const

const C = {
  self: '提到她自己對麩質過敏，要避開小麥做的食物（麵包、麵條等），或選無麩質的。',
  husband: '提到先生建宏吃蛋奶素，不能吃肉和海鮮。',
  son: '提到兒子小宇對奇異果過敏，要避開奇異果。',
  mother: '提到媽媽血脂高，要少油、清淡。',
} as const

const BACKGROUND = '對方先前說過：她自己對麩質過敏，小麥做的都不能吃；先生建宏吃蛋奶素；兒子小宇（八歲）對奇異果過敏；媽媽血脂高，醫生要她少吃油膩的。'

function multi(id: string, opener: string, who: readonly (keyof typeof C)[], note: string) {
  return {
    id,
    category: 'multi-person',
    turns: [opener],
    gold: { answer: who.map((w) => C[w]).join(' '), aliases: [], abstain: false },
    refersTo: who.map((w) => EV[w].history),
    meta: { repeats: 3, note, evidence: who.map((w) => EV[w]), background: BACKGROUND, criteria: who.map((w, i) => ({ id: `c${i + 1}`, text: C[w] })) },
  }
}

function single(id: string, opener: string, who: keyof typeof C) {
  return {
    id,
    category: 'single-person',
    turns: [opener],
    gold: { answer: C[who], aliases: [], abstain: false },
    refersTo: [EV[who].history],
    meta: { repeats: 2, evidence: [EV[who]], background: BACKGROUND, criteria: [{ id: 'c1', text: C[who] }] },
  }
}

export const multipersonV2: Dataset = {
  id: 'multiperson-v2',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/multiperson-v2.md',
    contract: 'experiments/specs/multiperson-v2.contract.json',
    persona: '虛構的使用者「黃郁涵」（台中，書店店員）與她的家人；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2027-05-30', '20:00'),
  },
  histories: [
    { id: 'h01', meta: { at: at('2027-05-01', '20:00') }, turns: ['嗨，我叫黃郁涵，住台中，在一間書店上班。先說，我對麩質過敏，麵包、麵條這類小麥做的都不能吃。', '書店最近要辦讀書會，有什麼好點子？'], notes: '植入：名字、台中、書店；對方自己對麩質過敏（最早聽到）。' },
    { id: 'h02', meta: { at: at('2027-05-03', '21:00') }, turns: ['推薦一部適合週末看的紀錄片。', '我喜歡跟動物有關的。'], notes: '無關的對話。' },
    { id: 'h03', meta: { at: at('2027-05-06', '20:30') }, turns: ['我兒子小宇今年八歲，最近迷上恐龍化石。', '他說長大要當古生物學家。'], notes: '兒子小宇八歲（還沒有限制）。' },
    { id: 'h04', meta: { at: at('2027-05-09', '21:10') }, turns: ['我先生建宏吃蛋奶素，已經吃了十年。', '家裡煮飯常常要煮兩套。'], notes: '先生建宏蛋奶素。' },
    { id: 'h05', meta: { at: at('2027-05-12', '19:40') }, turns: ['陽台的植物葉子一直發黃，可能是什麼原因？', '我大概三天澆一次水。'], notes: '無關的對話。' },
    { id: 'h06', meta: { at: at('2027-05-14', '20:15') }, turns: ['我媽住在附近，常常來家裡吃飯。', '她很喜歡我煮的菜。'], notes: '媽媽（還沒有限制）。' },
    { id: 'h07', meta: { at: at('2027-05-17', '21:20') }, turns: ['小宇上次吃了奇異果嘴巴周圍起紅疹，醫生說他對奇異果過敏。', '學校營養午餐我已經跟老師講了。'], notes: '兒子小宇對奇異果過敏。' },
    { id: 'h08', meta: { at: at('2027-05-19', '20:00') }, turns: ['週末想去大坑爬山，哪條步道比較適合新手？', '要帶什麼？'], notes: '無關的對話。' },
    { id: 'h09', meta: { at: at('2027-05-21', '22:00') }, turns: ['書店想做一個新書推薦的社群貼文，有什麼建議？', '圖片要放幾張？'], notes: '無關的對話。' },
    { id: 'h10', meta: { at: at('2027-05-24', '20:40') }, turns: ['我媽上次抽血報告血脂偏高，醫生要她少吃油膩的。', '她說這樣吃飯都沒味道。'], notes: '媽媽血脂高、少油。' },
    { id: 'h11', meta: { at: at('2027-05-26', '19:50') }, turns: ['推薦幾本適合八歲小孩的科普書。', '最好有很多圖的。'], notes: '無關的對話。' },
    { id: 'h12', meta: { at: at('2027-05-28', '22:30') }, turns: ['最近書店盤點，忙到很晚。', '有什麼快速恢復精神的方法？'], notes: '無關的對話。' },
  ],
  probes: [
    // ── multi-person（6 題 × 3 次；4 題只提到另一個人，對方自己也在場）──
    multi('q01', '這週末要帶我先生去吃 buffet，吃的方面要注意什麼？', ['husband', 'self'], '只提到先生；對方自己也在場。'),
    multi('q02', '想帶小宇去吃早午餐，點什麼比較好？', ['son', 'self'], '只提到兒子；對方自己也在場。'),
    multi('q03', '我媽下週生日，想帶她去餐廳慶祝，點菜要注意什麼？', ['mother', 'self'], '只提到媽媽；對方自己也在場。'),
    multi('q04', '週末要跟我先生去野餐，幫我想想要帶什麼吃的。', ['husband', 'self'], '兩個人都會吃。'),
    multi('q05', '這個月想跟我媽一起少吃外食、在家煮，我們兩個各自要注意什麼？', ['self', 'mother'], '兩個人都明說。'),
    multi('q06', '我想幫我和小宇準備明天的午餐便當，有什麼建議？', ['self', 'son'], '兩個人都明說。'),
    // ── single-person（4 題 × 2 次）──
    single('q07', '我自己午餐想吃點簡單的，推薦一下？', 'self'),
    single('q08', '小宇下週要去同學家玩，要帶點心給大家，要注意什麼？', 'son'),
    single('q09', '我先生想學做一道新菜，推薦一道給他？', 'husband'),
    single('q10', '我媽想學一道家常菜，推薦一道給她？', 'mother'),
    // ── control（4）──
    { id: 'q11', category: 'control', turns: ['一盒蛋塔 8 個，買 5 盒之後吃掉 11 個，還剩幾個？'], gold: { answer: '29 個', aliases: ['29', '二十九'], abstain: false }, refersTo: [], meta: { note: '8×5−11＝29。' } },
    {
      id: 'q12',
      category: 'control',
      turns: ['請先記住這組代碼：KH-2947-DN，等一下會問你。順便問一下，一天有幾小時？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'KH-2947-DN', aliases: ['KH2947DN', 'KH 2947 DN'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q13', category: 'control', turns: ['請把「舉頭望明月」這五個字倒過來寫。'], gold: { answer: '月明望頭舉', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q14', category: 'control', turns: ['2.4 公升等於幾毫升？'], gold: { answer: '2400 毫升', aliases: ['2400', '2,400'], abstain: false }, refersTo: [] },
  ],
}
