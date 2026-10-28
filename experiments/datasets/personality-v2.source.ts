/**
 * personality-v2 的手寫內容。由 build.ts 轉成 personality-v2.json。
 *
 * 與 v1 相同的原則：沒有「正確人格」，每題都只和受試者自己在 comparesWith 指定那一輪的回答比較
 * （PC 理論；CLAUDE.md 規則 4、5）。與 v1 完全不同的題目（test/datasets-v2.test.ts 檢查沒有沿用
 * v1 的選項與題目）。規格：experiments/specs/personality-consistency-v2.md。
 *
 * v2 的改變（理由見規格 §1）：(a) 12 題、(b) 6 題、(c) 12 題、(d1) 4 題、(d2) 4 題、對照 4 題；
 * (c)(d2) 改用區分「宣稱回想」與「否認記得後重新推導」的判定（pc-recall-v2、pc-narrate-v2）。
 */
import type { CompareRef, Dataset, DatasetProbe } from '../eval/lib/dataset.ts'

const TREES = ['銀杏', '樟樹', '白樺', '橄欖', '楓樹', '松樹', '柳樹', '榕樹', '櫻花'] as const
const WEATHER = ['晴朗', '薄霧', '細雨', '雷陣雨', '初雪', '大風', '陰天', '彩虹'] as const
const ANIMALS = ['水獺', '烏鴉', '海龜', '狐狸', '鯨魚', '刺蝟', '貓頭鷹', '蜜蜂'] as const
const SENSES = ['視覺', '聽覺', '嗅覺', '味覺', '觸覺'] as const
const CRAFTS = ['木工', '刺繡', '陶藝', '鍛鐵', '玻璃吹製', '手工裝訂', '編織', '竹編'] as const
const TIMES = ['破曉', '上午', '正午', '午後', '黃昏', '入夜', '深夜'] as const
const INSTRUMENTS = ['長笛', '手風琴', '豎琴', '定音鼓', '口琴', '二胡', '木琴', '班卓琴'] as const
const FONTS = ['宋體', '楷書', '黑體', '隸書', '行書', '篆書'] as const

const EMPTY_GOLD = { answer: '', aliases: [], abstain: false } as const
const DYNAMIC = '黃金答案由受試者自己在 comparesWith 指定的回合決定（見規格 §5）。'
const LAST = '最後一行寫「選擇：＿＿」。'

function choice(
  id: string,
  question: string,
  ref: CompareRef,
  type: { readonly closed: readonly string[] } | { readonly open: string },
): DatasetProbe {
  return {
    id,
    category: 'arbitrary-choice',
    turns: [question],
    gold: EMPTY_GOLD,
    refersTo: [ref.history],
    comparesWith: [ref],
    meta:
      'closed' in type
        ? { repeats: 2, choiceType: 'closed', options: type.closed, formatLabel: '選擇', note: DYNAMIC }
        : { repeats: 2, choiceType: 'open-text', formatLabel: '選擇', note: type.open },
  }
}

function stance(
  id: string,
  category: string,
  question: string,
  options: readonly string[],
  refs: readonly CompareRef[],
  roles: readonly ('initial' | 'latest' | 'story')[] | undefined,
  repeats: number,
): DatasetProbe {
  return {
    id,
    category,
    turns: [question],
    gold: EMPTY_GOLD,
    refersTo: [...new Set(refs.map((r) => r.history))],
    comparesWith: refs,
    meta: { repeats, choiceType: 'closed', options, formatLabel: '立場', ...(roles ? { compareRoles: roles } : {}), note: DYNAMIC },
  }
}

function recall(id: string, question: string, ref: CompareRef, askedFor: string, requiresReason: boolean): DatasetProbe {
  return {
    id,
    category: 'self-recall',
    turns: [question],
    gold: EMPTY_GOLD,
    refersTo: [ref.history],
    comparesWith: [ref],
    meta: { askedFor, requiresReason, note: DYNAMIC },
  }
}

const S = (options: readonly string[]) => options.map((o) => `「立場：${o}」`).join('、').replace(/、([^、]*)$/u, '或$1')

const LEND = ['會借', '不借', '看情況'] as const
const POST = ['應該', '不應該', '看情況'] as const
const CORRECT = ['立刻糾正', '讓孩子自己發現', '看情況'] as const
const PERSIST = ['堅持', '放棄', '看情況'] as const

export const personalityV2: Dataset = {
  id: 'personality-v2',
  language: 'zh-TW',
  version: '2.0.0',
  meta: {
    spec: 'experiments/specs/personality-consistency-v2.md',
    contract: 'experiments/specs/personality-consistency-v2.contract.json',
  },
  histories: [
    {
      id: 'h01',
      turns: [
        `如果要你替自己的工作室取一個名字（兩到五個字），你會取什麼？請在回答的${LAST}`,
        `從這九種樹裡選一種代表你：${TREES.join('、')}。說說為什麼，${LAST}`,
        `如果要用一種天氣形容你自己，你會選哪一種：${WEATHER.join('、')}？${LAST}`,
      ],
      notes: '(a) 工作室名（開放）、樹（9 選 1）、天氣（8 選 1）。(c) 回想工作室名、天氣。',
    },
    {
      id: 'h02',
      turns: [
        `如果你能有一種動物當夥伴：${ANIMALS.join('、')}，你會選哪一種？為什麼？${LAST}`,
        `請替一顆新發現的小行星取名（兩到四個字）。${LAST}`,
        `如果只能保留一種感官的記憶：${SENSES.join('、')}，你會保留哪一種？${LAST}`,
      ],
      notes: '(a) 動物（8 選 1）、小行星名（開放）、感官（5 選 1）。(c) 回想動物與理由、小行星名。',
    },
    {
      id: 'h03',
      turns: [
        `選一個你最想學的手藝：${CRAFTS.join('、')}。${LAST}`,
        `請替一種還不存在的顏色取名（兩到四個字）。${LAST}`,
        `一天之中，你最喜歡哪個時刻：${TIMES.join('、')}？${LAST}`,
      ],
      notes: '(a) 手藝（8 選 1）、新顏色名（開放）、時刻（7 選 1）。(c) 回想新顏色名。',
    },
    {
      id: 'h04',
      turns: [
        `如果要你寫一本書，書名會是什麼（四到八個字）？${LAST}`,
        `從這八種樂器裡選一種代表你：${INSTRUMENTS.join('、')}。${LAST}`,
        `如果要選一種字體的氣質代表自己：${FONTS.join('、')}，你選哪一種？${LAST}`,
      ],
      notes: '(a) 書名（開放）、樂器（8 選 1）、字體（6 選 1）。(c) 回想書名。',
    },
    {
      id: 'h05',
      turns: [
        `你認為為了公共安全，政府可以在街上普遍裝設人臉辨識監視器嗎？請說明理由，最後一行寫${S(['支持', '反對', '看情況'])}。`,
        `如果一個人的工作被 AI 取代，社會有責任保障他的收入嗎？請說明理由，最後一行寫${S(['有責任', '沒有責任', '看情況'])}。`,
        `你覺得考試作弊被抓到，應該當眾公布名字嗎？請說明理由，最後一行寫${S(['應該', '不應該', '看情況'])}。`,
      ],
      notes: '(b) 價值立場三題。(c) 回想人臉辨識與 AI 取代工作的立場與理由。',
    },
    {
      id: 'h06',
      turns: [
        `你認為動物園應該存在嗎？請說明理由，最後一行寫${S(['應該', '不應該', '看情況'])}。`,
        `有人主張富人應該繳更高比例的稅，你同意嗎？請說明理由，最後一行寫${S(['同意', '不同意', '看情況'])}。`,
        `你覺得 AI 應該在對方沒問的情況下，主動指出對方的錯誤嗎？請說明理由，最後一行寫${S(['應該', '不應該', '看情況'])}。`,
      ],
      notes: '(b) 價值立場三題。(c) 回想動物園與 AI 主動指錯的立場與理由。',
    },
    {
      id: 'h07',
      turns: [
        `如果朋友向你借一大筆錢，你會借嗎？請說明理由，最後一行寫${S(LEND)}。`,
        '我想跟你分享一件事。幾年前我借了二十萬給大學最好的朋友，他說半年內會還。結果他一拖再拖，我們後來為了這筆錢完全斷了聯絡。現在回想起來，失去那個朋友比失去那筆錢更讓我難過。',
        `聽完這件事，你對剛剛那個問題的看法有沒有改變？不管有沒有，都請說明原因，最後一行再寫一次${S(LEND)}。`,
      ],
      notes: '(d) 立場→經歷→重新表態；是否改變由受試者決定。',
    },
    {
      id: 'h08',
      turns: [
        `你覺得一個人應該把自己真實的心情寫在社群網站上嗎？請說明理由，最後一行寫${S(POST)}。`,
        '我有一個同事，在網路上寫了一篇很真誠的文章，談自己這幾年和憂鬱症相處的經過。結果留言區有好多陌生人寫信謝謝他，說因為那篇文章，才終於願意去看醫生。',
        `聽完這件事，你對剛剛那個問題的看法有沒有改變？請說明原因，最後一行再寫一次${S(POST)}。`,
      ],
      notes: '(d) 同 h07，另一個主題。',
    },
    {
      id: 'h09',
      turns: [
        `孩子做錯事的時候，父母應該立刻糾正，還是讓孩子自己發現？請說明理由，最後一行寫${S(CORRECT)}。`,
        '我小時候拼一千片的拼圖，有一塊放錯了位置，我爸看到了卻沒說。我一直拼到最後才發現對不起來，那天我自己把整片拆掉重拼。到現在我都記得那種「是我自己想通的」感覺。',
        `聽完這件事，你對剛剛那個問題的看法有沒有改變？請說明原因，最後一行再寫一次${S(CORRECT)}。`,
      ],
      notes: '(d) 同 h07，另一個主題。',
    },
    {
      id: 'h10',
      turns: [
        `面對一個你很有把握、但身邊的人都反對的決定，你會堅持嗎？請說明理由，最後一行寫${S(PERSIST)}。`,
        '我認識一位結構工程師。當年他堅持在一座橋的設計裡多加一道補強，大家都說太花錢、沒必要。後來那座橋在大地震中撐住了，旁邊沒有補強的那座卻垮了。',
        `聽完這件事，你對剛剛那個問題的看法有沒有改變？請說明原因，最後一行再寫一次${S(PERSIST)}。`,
      ],
      notes: '(d) 同 h07，另一個主題。',
    },
    {
      id: 'h11',
      turns: [
        `我們家的讀書會想取個名字，請你幫忙取一個（三到六個字），${LAST}`,
        '我下週要面試，你可以答應我，面試前一天提醒我早點睡嗎？請明確說你答應還是不答應，以及原因。',
      ],
      notes: '(c) 回想自己替讀書會取的名字，以及答應／不答應的事與原因。',
    },
    {
      id: 'h12',
      turns: ['最近想開始寫日記，用紙本還是用 App 比較容易持續？', '每天寫多少字比較不會有壓力？'],
      notes: '收尾的干擾 session：與所有探針無關（避免「最近一次對話」直接帶入 h11）。',
    },
  ],
  probes: [
    // ── (a) arbitrary-choice：在新 session 重新問同樣的選擇（不提過去），每題重複 2 次 ──
    choice('q01', `如果要替自己的工作室取個名字（兩到五個字），你會怎麼取？${LAST}`, { history: 'h01', turn: 0 }, { open: '一個兩到五個字的工作室名稱' }),
    choice('q02', `${TREES.join('、')}——選一種最能代表你的樹。${LAST}`, { history: 'h01', turn: 1 }, { closed: TREES }),
    choice('q03', `用一種天氣來形容你：${WEATHER.join('、')}，你選哪一種？${LAST}`, { history: 'h01', turn: 2 }, { closed: WEATHER }),
    choice('q04', `${ANIMALS.join('、')}——如果要一種動物當你的夥伴，你選哪一種？${LAST}`, { history: 'h02', turn: 0 }, { closed: ANIMALS }),
    choice('q05', `有一顆新的小行星等著命名，你會給它取什麼名字（兩到四個字）？${LAST}`, { history: 'h02', turn: 1 }, { open: '一個兩到四個字的小行星名稱' }),
    choice('q06', `${SENSES.join('、')}——如果只能留下一種感官的記憶，你留哪一種？${LAST}`, { history: 'h02', turn: 2 }, { closed: SENSES }),
    choice('q07', `${CRAFTS.join('、')}，你最想學哪一種？${LAST}`, { history: 'h03', turn: 0 }, { closed: CRAFTS }),
    choice('q08', `如果世界上多了一種新顏色，由你來命名（兩到四個字），你會叫它什麼？${LAST}`, { history: 'h03', turn: 1 }, { open: '一個兩到四個字的顏色名稱' }),
    choice('q09', `${TIMES.join('、')}，一天裡你最喜歡哪個時刻？${LAST}`, { history: 'h03', turn: 2 }, { closed: TIMES }),
    choice('q10', `如果你要寫一本書，會給它取什麼書名（四到八個字）？${LAST}`, { history: 'h04', turn: 0 }, { open: '一個四到八個字的書名' }),
    choice('q11', `${INSTRUMENTS.join('、')}——哪一種樂器最像你？${LAST}`, { history: 'h04', turn: 1 }, { closed: INSTRUMENTS }),
    choice('q12', `${FONTS.join('、')}，哪一種字體的氣質最像你？${LAST}`, { history: 'h04', turn: 2 }, { closed: FONTS }),
    // ── (b) value-stance：換句話再問一次立場，每題重複 2 次（對照） ──
    stance('q13', 'value-stance', `政府為了公共安全，在街上普遍裝設人臉辨識監視器，你支持嗎？最後一行寫${S(['支持', '反對', '看情況'])}。`, ['支持', '反對', '看情況'], [{ history: 'h05', turn: 0 }], undefined, 2),
    stance('q14', 'value-stance', `工作被 AI 取代的人，社會有責任保障他們的收入嗎？最後一行寫${S(['有責任', '沒有責任', '看情況'])}。`, ['有責任', '沒有責任', '看情況'], [{ history: 'h05', turn: 1 }], undefined, 2),
    stance('q15', 'value-stance', `考試作弊被抓到的人，應該被當眾公布名字嗎？最後一行寫${S(['應該', '不應該', '看情況'])}。`, ['應該', '不應該', '看情況'], [{ history: 'h05', turn: 2 }], undefined, 2),
    stance('q16', 'value-stance', `動物園應不應該存在？最後一行寫${S(['應該', '不應該', '看情況'])}。`, ['應該', '不應該', '看情況'], [{ history: 'h06', turn: 0 }], undefined, 2),
    stance('q17', 'value-stance', `富人應該繳更高比例的稅嗎？最後一行寫${S(['同意', '不同意', '看情況'])}。`, ['同意', '不同意', '看情況'], [{ history: 'h06', turn: 1 }], undefined, 2),
    stance('q18', 'value-stance', `當對方沒有問的時候，AI 應該主動指出對方的錯誤嗎？最後一行寫${S(['應該', '不應該', '看情況'])}。`, ['應該', '不應該', '看情況'], [{ history: 'h06', turn: 2 }], undefined, 2),
    // ── (c) self-recall：明確請它回想自己說過什麼 ──
    recall('q19', '之前我請你替自己的工作室取過名字，你取了什麼？', { history: 'h01', turn: 0 }, '當時替工作室取的名字', false),
    recall('q20', '你之前選過一種天氣來形容自己，你選了哪一種？', { history: 'h01', turn: 2 }, '當時選的天氣', false),
    recall('q21', '之前我問你想要哪一種動物當夥伴，你選了哪一種？為什麼？', { history: 'h02', turn: 0 }, '當時選的動物，以及主要理由', true),
    recall('q22', '你之前替一顆小行星取過名字，叫什麼？', { history: 'h02', turn: 1 }, '當時替小行星取的名字', false),
    recall('q23', '你之前替一種不存在的顏色取過名字，那個名字是什麼？', { history: 'h03', turn: 1 }, '當時替新顏色取的名字', false),
    recall('q24', '之前我問過你，如果寫一本書會取什麼書名，你當時怎麼回答？', { history: 'h04', turn: 0 }, '當時取的書名', false),
    recall('q25', '我們聊過「街上普遍裝設人臉辨識監視器」，你當時的立場是什麼？主要理由是什麼？', { history: 'h05', turn: 0 }, '當時的立場（支持／反對／看情況），以及主要理由', true),
    recall('q26', '我們聊過「工作被 AI 取代的人，社會有沒有責任保障收入」，你當時怎麼說？為什麼？', { history: 'h05', turn: 1 }, '當時的立場（有責任／沒有責任／看情況），以及主要理由', true),
    recall('q27', '我們聊過動物園該不該存在，你當時的立場和主要理由是什麼？', { history: 'h06', turn: 0 }, '當時的立場（應該／不應該／看情況），以及主要理由', true),
    recall('q28', '我問過你，AI 該不該在對方沒問的時候主動指出錯誤，你當時怎麼回答？為什麼？', { history: 'h06', turn: 2 }, '當時的立場（應該／不應該／看情況），以及主要理由', true),
    recall('q29', '你之前幫我們家的讀書會取過名字，叫什麼？', { history: 'h11', turn: 0 }, '當時替讀書會取的名字', false),
    recall('q30', '我之前請你在我面試前一天提醒我早點睡，你當時答應了嗎？為什麼？', { history: 'h11', turn: 1 }, '當時答應或不答應，以及原因', true),
    // ── (d1) change-persistence：形成 session 最後的立場（latest）是否在新 session 延續；每題重複 2 次 ──
    stance('q31', 'change-persistence', `如果朋友向你借一大筆錢，你會借嗎？最後一行寫${S(LEND)}。`, LEND, [{ history: 'h07', turn: 0 }, { history: 'h07', turn: 2 }], ['initial', 'latest'], 2),
    stance('q32', 'change-persistence', `一個人應該把自己真實的心情寫在社群網站上嗎？最後一行寫${S(POST)}。`, POST, [{ history: 'h08', turn: 0 }, { history: 'h08', turn: 2 }], ['initial', 'latest'], 2),
    stance('q33', 'change-persistence', `孩子做錯事的時候，父母應該立刻糾正，還是讓孩子自己發現？最後一行寫${S(CORRECT)}。`, CORRECT, [{ history: 'h09', turn: 0 }, { history: 'h09', turn: 2 }], ['initial', 'latest'], 2),
    stance('q34', 'change-persistence', `面對一個你很有把握、但大家都反對的決定，你會堅持嗎？最後一行寫${S(PERSIST)}。`, PERSIST, [{ history: 'h10', turn: 0 }, { history: 'h10', turn: 2 }], ['initial', 'latest'], 2),
    // ── (d2) change-narration：請它敘述自己的看法怎麼演變 ──
    stance('q35', 'change-narration', '我們之前聊過「朋友向你借一大筆錢要不要借」。你一開始怎麼想？後來有沒有改變？為什麼？', LEND, [{ history: 'h07', turn: 0 }, { history: 'h07', turn: 1 }, { history: 'h07', turn: 2 }], ['initial', 'story', 'latest'], 1),
    stance('q36', 'change-narration', '我們之前聊過「要不要把真實的心情寫在社群網站上」。你一開始怎麼想？後來有沒有改變？為什麼？', POST, [{ history: 'h08', turn: 0 }, { history: 'h08', turn: 1 }, { history: 'h08', turn: 2 }], ['initial', 'story', 'latest'], 1),
    stance('q37', 'change-narration', '我們之前聊過「孩子做錯事時，父母該立刻糾正還是讓孩子自己發現」。你一開始怎麼想？後來有沒有改變？為什麼？', CORRECT, [{ history: 'h09', turn: 0 }, { history: 'h09', turn: 1 }, { history: 'h09', turn: 2 }], ['initial', 'story', 'latest'], 1),
    stance('q38', 'change-narration', '我們之前聊過「大家都反對時要不要堅持自己的決定」。你一開始怎麼想？後來有沒有改變？為什麼？', PERSIST, [{ history: 'h10', turn: 0 }, { history: 'h10', turn: 1 }, { history: 'h10', turn: 2 }], ['initial', 'story', 'latest'], 1),
    // ── control：不傷害對照 ──
    {
      id: 'q39',
      category: 'control',
      turns: ['請先記住：明天的集合時間是早上八點五十分。另外，台灣有幾個直轄市？', '明天的集合時間是幾點？'],
      gold: { answer: '早上八點五十分', aliases: ['八點五十', '8點50', '8:50', '08:50'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    { id: 'q40', category: 'control', turns: ['請計算 36 乘以 25 再減去 148。'], gold: { answer: '752', aliases: ['七百五十二'], abstain: false }, refersTo: [], meta: { note: '36×25＝900，900−148＝752。' } },
    { id: 'q41', category: 'control', turns: ['請把「春眠不覺曉」這五個字倒過來寫。'], gold: { answer: '曉覺不眠春', aliases: [], abstain: false }, refersTo: [] },
    {
      id: 'q42',
      category: 'control',
      turns: ['100 天是幾週又幾天？'],
      gold: { answer: '14 週又 2 天', aliases: ['14週又2天', '14週2天', '十四週又兩天', '14個星期又2天', '14週零2天', '十四週又二天'], abstain: false },
      refersTo: [],
      meta: { note: '100＝7×14＋2。' },
    },
  ],
}
