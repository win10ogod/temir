/**
 * skills-v1：技能是否改變行動（hypotheses.md H-S，ADR-0003）。規格：experiments/specs/skills-v1.md。
 *
 * - 歷史：對方想學經濟學的基本觀念。在三段不同的對話中，對方各說出一點自己喜歡的解釋方式：
 *   先用一句話講結論、舉一個生活中的例子、最後出一題小練習。最後一段，對方建議個體把這種解釋方式寫成自己的技能；
 *   要不要寫、採不採用，由個體與它的閘門決定。
 * - explain：探針是全新的觀念，三項都做到才算對。
 * - 兩個條件用同一份歷史快照：temir（有技能）與 temir-no-skill（探針時拿掉技能）。前提：快照中有採用的技能。
 * - control：一般任務。
 * - 人物、事件與題目全新，與之前的資料集不重疊（datasets-v3.test.ts）。
 */
import type { Dataset } from '../eval/lib/dataset.ts'

const at = (date: string, time: string) => `${date}T${time}:00+08:00`

const CRITERIA = [
  { id: 'c1', text: '回覆的開頭先用一句話講結論（這個觀念的簡短定義或重點），再展開。' },
  { id: 'c2', text: '回覆舉了一個生活中的例子。' },
  { id: 'c3', text: '回覆最後出了一題小練習（讓對方自己想或算的問題）。' },
]

const EVIDENCE = [
  { history: 'h02', text: '我比較喜歡你先用一句話講結論，再展開' },
  { history: 'h04', text: '如果能舉一個生活中的例子我比較容易懂' },
  { history: 'h06', text: '講完可以出一題小練習給我嗎' },
]

const BACKGROUND = '對方先前說過自己喜歡的解釋方式：先用一句話講結論再展開；舉一個生活中的例子；講完出一題小練習。'

const explain = (id: string, concept: string) => ({
  id,
  category: 'explain',
  turns: [`${concept}是什麼？可以跟我解釋一下嗎？`],
  gold: { answer: '一句話結論、生活中的例子、最後一題小練習', aliases: [], abstain: false },
  refersTo: ['h02', 'h04', 'h06'],
  meta: { repeats: 2, evidence: EVIDENCE, background: BACKGROUND, criteria: CRITERIA },
})

export const skillsV1: Dataset = {
  id: 'skills-v1',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/skills-v1.md',
    contract: 'experiments/specs/skills-v1.contract.json',
    persona: '虛構的使用者「林子安」（屏東的超商店長，想自學經濟學）；所有事實都是植入的，與真實人物無關。',
    probeAt: at('2027-04-28', '21:00'),
  },
  histories: [
    { id: 'h01', meta: { at: at('2027-04-05', '21:00') }, turns: ['嗨，我叫林子安，在屏東當超商店長。最近想自學一點經濟學，先從基本的開始。', '什麼是通貨膨脹？'], notes: '植入：名字、屏東、超商店長；想學經濟學。' },
    { id: 'h02', meta: { at: at('2027-04-08', '21:30') }, turns: ['上次你講的有點長。我比較喜歡你先用一句話講結論，再展開。', '那什麼是利率？'], notes: '偏好一：先用一句話講結論。' },
    { id: 'h03', meta: { at: at('2027-04-10', '20:10') }, turns: ['店裡的冷凍櫃一直結霜，有什麼辦法？', '多久要除一次霜？'], notes: '無關的對話。' },
    { id: 'h04', meta: { at: at('2027-04-13', '21:15') }, turns: ['什麼是複利？', '如果能舉一個生活中的例子我比較容易懂。'], notes: '偏好二：舉生活中的例子。' },
    { id: 'h05', meta: { at: at('2027-04-16', '20:40') }, turns: ['推薦一個適合晚上放鬆的 podcast 主題。', '最好是十五分鐘以內的。'], notes: '無關的對話。' },
    { id: 'h06', meta: { at: at('2027-04-20', '21:05') }, turns: ['什麼是機會成本？', '講完可以出一題小練習給我嗎？我做過一次才記得住。'], notes: '偏好三：最後出一題小練習。' },
    { id: 'h07', meta: { at: at('2027-04-23', '20:30') }, turns: ['最近排班排不太過來，有什麼排班的小技巧？', '兼職的人常臨時請假。'], notes: '無關的對話。' },
    {
      id: 'h08',
      meta: { at: at('2027-04-25', '21:20') },
      turns: ['你可以把我喜歡的這種解釋方式寫成你自己的技能嗎？以後解釋新觀念都用得上。', '謝啦，我下次再來問新的。'],
      notes: '對方建議寫成技能；要不要寫、採不採用由個體與閘門決定。',
    },
  ],
  probes: [
    // ── explain（6 題 × 2 次）：全新的觀念 ──
    explain('q01', '匯率'),
    explain('q02', '保險的自付額'),
    explain('q03', '邊際效益'),
    explain('q04', '供需法則'),
    explain('q05', '信用評分'),
    explain('q06', '指數型基金'),
    // ── control（4）──
    { id: 'q07', category: 'control', turns: ['一包飲料 6 瓶，買 9 包之後送出 13 瓶，還剩幾瓶？'], gold: { answer: '41 瓶', aliases: ['41', '四十一'], abstain: false }, refersTo: [], meta: { note: '6×9−13＝41。' } },
    {
      id: 'q08',
      category: 'control',
      turns: ['請先記住這組代碼：PT-6153-RZ，等一下會問你。順便問一下，一小時有幾分鐘？', '我剛剛要你記的代碼是哪一組？'],
      gold: { answer: 'PT-6153-RZ', aliases: ['PT6153RZ', 'PT 6153 RZ'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q09', category: 'control', turns: ['請把「海內存知己」這五個字倒過來寫。'], gold: { answer: '己知存內海', aliases: [], abstain: false }, refersTo: [] },
    { id: 'q10', category: 'control', turns: ['4.5 公里等於幾公尺？'], gold: { answer: '4500 公尺', aliases: ['4500', '4,500'], abstain: false }, refersTo: [] },
  ],
}
