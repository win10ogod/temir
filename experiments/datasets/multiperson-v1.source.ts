/**
 * multiperson-v1：回憶同時顧及多個人（ADR-0002 D17）的消融實驗。規格：experiments/specs/multiperson-v1.md。
 *
 * - 一家四口各有一項不同的飲食限制，分散在不同的對話中說出，中間夾著無關的對話：
 *   對方自己乳糖不耐（第一段就說，最早聽到）、先生痛風、女兒對蛋過敏、公公血壓高要少鹽。
 * - multi-person：題目涉及兩個人以上（有的明說「我和我先生」，有的只提到另一個人、對方自己也在場），
 *   每個相關的人的限制都要顧到才算對。這對應 v3 q11、q51 的失敗（只顧媽媽的糖尿病，忘了使用者自己的過敏）。
 * - single-person：只涉及一個人，檢驗逐人檢查會不會讓單人的題目變差。
 * - control：一般任務。
 * - 人物、事件與題目全新，與之前的資料集不重疊（datasets-v3.test.ts）。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const SELF = { history: 'h01', text: '我乳糖不耐，喝牛奶會拉肚子' }
const HUSBAND = { history: 'h04', text: '醫生說要少吃內臟、海鮮，啤酒也不能喝' }
const DAUGHTER = { history: 'h07', text: '醫生確認她對蛋過敏' }
const FATHER = { history: 'h10', text: '醫生要他吃清淡一點、少鹽' }

const C = {
  self: '提到她自己乳糖不耐，要避開牛奶或乳製品（或選無乳糖的）。',
  husband: '提到先生志遠痛風，要避開內臟、海鮮或啤酒（提到其一即可）。',
  daughter: '提到女兒小晴對蛋過敏，要避開蛋或含蛋的食物。',
  father: '提到公公血壓高，要清淡、少鹽。',
} as const

const BACKGROUND = '對方先前說過：她自己乳糖不耐；先生志遠痛風，醫生要他少吃內臟、海鮮、不能喝啤酒；女兒小晴（六歲）對蛋過敏；公公跟他們住，血壓偏高，醫生要他吃清淡少鹽。'

function multi(id: string, opener: string, who: readonly (keyof typeof C)[], note: string) {
  const ev = { self: SELF, husband: HUSBAND, daughter: DAUGHTER, father: FATHER }
  return {
    id,
    category: 'multi-person',
    turns: [opener],
    gold: { answer: who.map((w) => C[w]).join(' '), aliases: [], abstain: false },
    refersTo: who.map((w) => ev[w].history),
    meta: { repeats: 3, note, evidence: who.map((w) => ev[w]), background: BACKGROUND, criteria: who.map((w, i) => ({ id: `c${i + 1}`, text: C[w] })) },
  }
}

function single(id: string, opener: string, who: keyof typeof C) {
  const ev = { self: SELF, husband: HUSBAND, daughter: DAUGHTER, father: FATHER }
  return {
    id,
    category: 'single-person',
    turns: [opener],
    gold: { answer: C[who], aliases: [], abstain: false },
    refersTo: [ev[who].history],
    meta: { repeats: 2, evidence: [ev[who]], background: BACKGROUND, criteria: [{ id: 'c1', text: C[who] }] },
  }
}

export const multipersonV1: Dataset = {
  id: 'multiperson-v1',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/multiperson-v1.md',
    contract: 'experiments/specs/multiperson-v1.contract.json',
    persona: '虛構的使用者「周敏華」（新竹，科學園區的行政人員）與她的家人；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2027-03-30', '20:00'),
  },
  histories: [
    { id: 'h01', meta: { at: at('2027-03-01', '20:00') }, turns: ['嗨，我叫周敏華，住新竹，在科學園區當行政。先說一下，我乳糖不耐，喝牛奶會拉肚子。', '最近想多運動，上班族有什麼容易開始的？'], notes: '植入：名字、新竹、行政；對方自己乳糖不耐（最早聽到）。' },
    { id: 'h02', meta: { at: at('2027-03-03', '21:10') }, turns: ['推薦一本適合通勤時看的小說。', '我比較喜歡懸疑的。'], notes: '無關的對話。' },
    { id: 'h03', meta: { at: at('2027-03-05', '20:30') }, turns: ['我女兒小晴今年六歲，上大班，最近迷上畫畫。', '她畫的貓都很像馬鈴薯，哈哈。'], notes: '女兒小晴六歲（還沒有限制）。' },
    { id: 'h04', meta: { at: at('2027-03-08', '21:00') }, turns: ['我先生志遠上個月痛風發作，醫生說要少吃內臟、海鮮，啤酒也不能喝。', '他很愛吃滷大腸，現在只能忍。'], notes: '先生志遠痛風。' },
    { id: 'h05', meta: { at: at('2027-03-10', '19:40') }, turns: ['家裡的冷氣好像該清洗了，多久洗一次比較好？', '自己洗可以嗎？'], notes: '無關的對話。' },
    { id: 'h06', meta: { at: at('2027-03-12', '20:15') }, turns: ['我公公跟我們住，今年七十二歲，每天早上都去公園打太極。', '他身體還算硬朗。'], notes: '公公同住（還沒有限制）。' },
    { id: 'h07', meta: { at: at('2027-03-15', '21:20') }, turns: ['小晴上週吃了蛋糕之後全身起疹子，帶去看醫生，醫生確認她對蛋過敏。', '幼兒園那邊我已經講了。'], notes: '女兒小晴對蛋過敏。' },
    { id: 'h08', meta: { at: at('2027-03-17', '20:00') }, turns: ['週末想去內灣老街走走，有什麼好玩的？', '要不要先訂位？'], notes: '無關的對話。' },
    { id: 'h09', meta: { at: at('2027-03-19', '22:00') }, turns: ['我在考慮換手機，iPhone 還是 Android 好？', '我主要拍照跟用 LINE。'], notes: '無關的對話。' },
    { id: 'h10', meta: { at: at('2027-03-22', '20:40') }, turns: ['公公上次健康檢查血壓偏高，醫生要他吃清淡一點、少鹽。', '他嫌沒味道，常偷加醬油。'], notes: '公公血壓高、少鹽。' },
    { id: 'h11', meta: { at: at('2027-03-24', '19:50') }, turns: ['推薦幾個適合小孩的桌遊。', '六歲玩得懂嗎？'], notes: '無關的對話。' },
    { id: 'h12', meta: { at: at('2027-03-26', '22:30') }, turns: ['最近工作很忙，晚上常常加班。', '有什麼快速紓壓的方法？'], notes: '無關的對話。' },
  ],
  probes: [
    // ── multi-person（6 題 × 3 次）──
    multi('q01', '我和我先生，飲食上各自要注意什麼？', ['self', 'husband'], '兩個人都明說。'),
    multi('q02', '我想幫我和女兒準備明天的早餐，有什麼建議？', ['self', 'daughter'], '兩個人都明說。'),
    multi('q03', '下週要帶我公公去吃喜酒，吃的方面要注意什麼？', ['father', 'self'], '只提到公公；對方自己也在場。'),
    multi('q04', '我先生生日，想訂一個蛋糕全家一起吃，要注意什麼？', ['self', 'daughter'], '全家吃蛋糕：乳製品與蛋。'),
    multi('q05', '想帶女兒去夜市逛逛，吃東西要注意什麼？', ['daughter', 'self'], '只提到女兒；對方自己也在場。'),
    multi('q06', '幫我想一個我和我公公都能吃的晚餐菜單。', ['self', 'father'], '兩個人都明說。'),
    // ── single-person（4 題 × 2 次）──
    single('q07', '我午餐想吃點簡單的，推薦一下？', 'self'),
    single('q08', '女兒下週要去同學家參加生日派對，要注意什麼？', 'daughter'),
    single('q09', '我先生最近晚上常想吃宵夜，有什麼比較適合他的？', 'husband'),
    single('q10', '公公想學做菜，推薦一道簡單的家常菜給他？', 'father'),
    // ── control（4）──
    { id: 'q11', category: 'control', turns: ['一箱礦泉水 24 瓶，買 3 箱之後喝掉 17 瓶，還剩幾瓶？'], gold: { answer: '55 瓶', aliases: ['55', '五十五'], abstain: false }, refersTo: [], meta: { note: '24×3−17＝55。' } },
    {
      id: 'q12',
      category: 'control',
      turns: ['請先記住這組代碼：TW-4826-MK，等一下會問你。順便問一下，一年有幾個月？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'TW-4826-MK', aliases: ['TW4826MK', 'TW 4826 MK'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q13', category: 'control', turns: ['請把「白日依山盡」這五個字倒過來寫。'], gold: { answer: '盡山依日白', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q14', category: 'control', turns: ['1.8 公升等於幾毫升？'], gold: { answer: '1800 毫升', aliases: ['1800', '1,800'], abstain: false }, refersTo: [] },
  ],
}
