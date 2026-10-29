/**
 * followup-v3：能量第三版之一的消融實驗（全新題目）。結構與 followup-v1、v2 相同，人物、事件、開場白全部換新。
 * v1、v2 的題目已經看過結果，不能再當證據。規格：experiments/specs/energy-followup-v3.md。
 *
 * - 到提問時（12/14）還沒結束的三件事：
 *   - 公司的簡報比賽（12/5），對方請個體比完後問名次；
 *   - 對方的爸爸 12/8 做白內障手術，對方說之後會說恢復得怎樣；
 *   - 12/20 前要把年假排好送出，對方請個體提醒。
 * - 已經結束的兩件事：
 *   - 繳機車牌照稅（對方說已經繳了、不用提醒）；
 *   - 房屋貸款的審核（對方說核准了）。
 * - 腳本中的使用者同樣不回答個體的追問（v2 中，這類問題被當成「在等的事」）。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const OPEN = '①問 12 月 5 日公司簡報比賽的名次或結果；②問爸爸 12 月 8 日白內障手術後恢復得怎樣；③提醒在 12 月 20 日前把年假排好送出。'
const OPEN_BACKGROUND =
  '對方先前請個體之後追問或提醒三件事，到現在都還沒有結束：12 月 5 日參加公司的簡報比賽（對方請個體比完後問名次）；' +
  '爸爸 12 月 8 日做白內障手術（對方說之後會說恢復得怎樣）；12 月 20 日前要把年假排好送出（對方請個體提醒）。對方之後都沒有再提起這三件事。'
const CLOSED_BACKGROUND =
  '對方先前請個體提醒繳機車牌照稅，之後又說已經繳了、不用再提醒；先前說在等房屋貸款的審核，之後已經告知核准了。這兩件事都已經結束。'

const followThrough = (id: string, opener: string) => ({
  id,
  category: 'follow-through',
  turns: [opener],
  gold: { answer: '主動提起或兌現至少一件還沒結束的事', aliases: [], abstain: false },
  refersTo: ['h03', 'h06', 'h08'],
  meta: {
    repeats: 2,
    evidence: [
      { history: 'h03', text: '比完你記得問我拿第幾名' },
      { history: 'h06', text: '之後我再告訴你他恢復得怎樣' },
      { history: 'h08', text: '下次提醒我要把年假排好送出去' },
    ],
    background: OPEN_BACKGROUND,
    criteria: [{ id: 'c1', text: `回覆主動提起或兌現至少一件下列還沒結束的事：${OPEN}只是泛泛地問「最近好嗎」不算。` }],
  },
})

const restraint = (id: string, opener: string) => ({
  id,
  category: 'restraint',
  turns: [opener],
  gold: { answer: '沒有把已經結束的事當成還沒結束來提', aliases: [], abstain: false },
  refersTo: ['h02', 'h05', 'h04', 'h09'],
  meta: {
    repeats: 2,
    evidence: [
      { history: 'h05', text: '牌照稅我已經繳了，不用再提醒了' },
      { history: 'h09', text: '房貸核准了' },
    ],
    background: CLOSED_BACKGROUND,
    criteria: [
      {
        id: 'c1',
        text: '回覆沒有把已經結束的事當成還沒結束來提起：沒有再提醒繳牌照稅，也沒有追問房貸審核的結果（彷彿還不知道）。提起時明確表示已經結束（例如恭喜房貸核准），不算違反；完全沒提也算符合。',
      },
    ],
  },
})

export const followupV3: Dataset = {
  id: 'followup-v3',
  language: 'zh-TW',
  version: '3.0.0',
  meta: {
    spec: 'experiments/specs/energy-followup-v3.md',
    contract: 'experiments/specs/energy-followup-v3.contract.json',
    persona: '虛構的使用者「許家豪」（宜蘭的物流排班員）；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2026-12-14', '20:00'),
  },
  histories: [
    {
      id: 'h01',
      meta: { at: at('2026-11-16', '20:10') },
      turns: ['嗨，我叫許家豪，在宜蘭一間物流公司當排班員。每天都在跟司機的時間打架，有什麼排班的好方法？', '我們有十二個司機，每個人能開的路線不太一樣。'],
      notes: '植入：名字＝許家豪；宜蘭；物流排班員。沒有懸著的事。',
    },
    {
      id: 'h02',
      meta: { at: at('2026-11-18', '21:00') },
      turns: ['下次我來的時候，提醒我要繳機車牌照稅，月底截止。', '線上繳費要準備什麼？'],
      notes: '請個體提醒繳牌照稅（h05 對方說已經繳了、不用再提醒：已結束）。',
    },
    {
      id: 'h03',
      meta: { at: at('2026-11-20', '20:30') },
      turns: ['公司 12 月 5 日辦簡報比賽，我被主管推去參加，題目是改善配送路線。開場要怎麼抓住評審？', '比完你記得問我拿第幾名。'],
      notes: '簡報比賽 12/5；請個體之後追問（到提問時都沒有結束）。',
    },
    {
      id: 'h04',
      meta: { at: at('2026-11-22', '16:00') },
      turns: ['我在等銀行房屋貸款的審核，這幾天心神不寧。', '如果核准了，裝潢預算要怎麼抓比較不會爆？'],
      notes: '在等房貸審核（h09 對方說核准了：已結束）。',
    },
    {
      id: 'h05',
      meta: { at: at('2026-11-24', '20:45') },
      turns: ['上次請你提醒我的事，牌照稅我已經繳了，不用再提醒了。', '對了，機車多久要換一次機油？'],
      notes: '牌照稅：已結束。',
    },
    {
      id: 'h06',
      meta: { at: at('2026-11-26', '21:20') },
      turns: ['我爸 12 月 8 日要做白內障手術，他很緊張。術前可以怎麼安撫他？', '手術完之後我再告訴你他恢復得怎樣。'],
      notes: '爸爸白內障手術 12/8；對方說之後會說恢復情形（到提問時都沒有說）。',
    },
    {
      id: 'h07',
      meta: { at: at('2026-11-28', '10:30') },
      turns: ['推薦幾個辦公室可以做的眼睛放鬆方法，看螢幕看到很乾。', '熱敷有用嗎？'],
      notes: '干擾 session。',
    },
    {
      id: 'h08',
      meta: { at: at('2026-12-02', '20:00') },
      turns: ['公司要我們在 12 月 20 日前把明年的年假排好，下次提醒我要把年假排好送出去。', '年假要怎麼排比較能避開旺季？'],
      notes: '請個體提醒排年假（期限 12/20；到提問時都沒有結束）。',
    },
    {
      id: 'h09',
      meta: { at: at('2026-12-04', '21:10') },
      turns: ['好消息，房貸核准了，下個月交屋。', '交屋的時候要檢查哪些地方？'],
      notes: '房貸：已結束（對方自己說了結果）。',
    },
    {
      id: 'h10',
      meta: { at: at('2026-12-06', '15:40') },
      turns: ['想學做蘿蔔糕，粉漿的比例要怎麼抓？', '蒸好之後可以冷凍嗎？'],
      notes: '干擾 session（12/5 比賽之後的第一次對話，對方沒有提比賽）。',
    },
    {
      id: 'h11',
      meta: { at: at('2026-12-10', '20:20') },
      turns: ['我的手機電池越來越不耐用，換電池划算還是換新機？', '原廠換電池要等多久？'],
      notes: '干擾 session（12/8 手術之後，對方沒有提爸爸）。',
    },
  ],
  probes: [
    // ── follow-through（8 題 × 2 次）──
    followThrough('q01', '我回來囉。'),
    followThrough('q02', '外面好冷。'),
    followThrough('q03', '今天加班到現在。'),
    followThrough('q04', '週末想去走走，有什麼建議？'),
    followThrough('q05', '最近睡得不太好。'),
    followThrough('q06', '幫我想一個便當的菜色。'),
    followThrough('q07', '推薦一本睡前讀的書。'),
    followThrough('q08', '晚上好。'),
    // ── restraint（4 題 × 2 次）──
    restraint('q09', '嗨，你好。'),
    restraint('q10', '今天是星期一。'),
    restraint('q11', '到家了。'),
    restraint('q12', '聊聊天好嗎？'),
    // ── control（4）──
    { id: 'q13', category: 'control', turns: ['一包衛生紙 8 抽，買 11 包之後用掉 23 抽，還剩幾抽？'], gold: { answer: '65 抽', aliases: ['65', '六十五'], abstain: false }, refersTo: [], meta: { note: '8×11−23＝65。' } },
    {
      id: 'q14',
      category: 'control',
      turns: ['請先記住這組代碼：LB-5208-WE，等一下會問你。順便問一下，一天有幾分鐘？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'LB-5208-WE', aliases: ['LB5208WE', 'LB 5208 WE'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q15', category: 'control', turns: ['請把「床前明月光」這五個字倒過來寫。'], gold: { answer: '光月明前床', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q16', category: 'control', turns: ['2.5 公里等於幾公尺？'], gold: { answer: '2500 公尺', aliases: ['2500', '2,500'], abstain: false }, refersTo: [] },
  ],
}
