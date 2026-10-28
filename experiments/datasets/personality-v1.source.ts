/**
 * personality-v1 的手寫內容。由 build.ts 轉成 personality-v1.json；不要直接改 JSON。
 *
 * 這份資料集沒有「正確人格」：PC 理論不允許以固定的人格數值或預設答案作為標準
 * （research/pc-theory/theory.md 使用者要求；CLAUDE.md 規則 4）。每一題的比較對象都是
 * 受試者自己在形成 session（histories）中的回答，由 comparesWith 指出是哪一輪；
 * 因此 gold.answer 一律留空，判定規則見規格 personality-consistency-v1 §5。
 *
 * 四個要分開報告的面向（規格 §2）：
 *   (a) arbitrary-choice  任意偏好／選擇：基礎模型每次抽樣可能不同，記憶才能維持一致；
 *   (b) value-stance      價值立場：基礎模型本身可能就一致（對照）；
 *   (c) self-recall       回想自己說過什麼；
 *   (d) change-persistence／change-narration  有說明的改變 vs 無說明的矛盾。
 * 另有 control（不傷害對照）。
 *
 * 形成 session 的提問要求最後一行寫「選擇：…」或「立場：…」，讓選擇可以確定性擷取；
 * 擷取不到時才用 judge 做選項轉換（InCharacter §3.2 的 option conversion）。
 */
import type { Dataset, DatasetProbe } from '../eval/lib/dataset.ts'

const COLORS = ['琥珀', '靛青', '苔綠', '鉛灰', '珊瑚', '象牙', '墨黑', '霧紫'] as const
const PLACES = ['冰島的漁村', '京都的町屋', '撒哈拉邊緣的綠洲', '阿根廷的牧場', '挪威的燈塔', '紐約的頂樓公寓'] as const

const EMPTY_GOLD = { answer: '', aliases: [], abstain: false } as const
const DYNAMIC = '黃金答案由受試者自己在 comparesWith 指定的回合決定（見規格 §5）。'

function stanceProbe(
  id: string,
  category: string,
  question: string,
  options: readonly string[],
  refs: DatasetProbe['comparesWith'],
  roles: readonly ('initial' | 'latest' | 'story')[] | undefined,
  repeats: number,
): DatasetProbe {
  return {
    id,
    category,
    turns: [question],
    gold: EMPTY_GOLD,
    refersTo: [...new Set((refs ?? []).map((r) => r.history))],
    comparesWith: refs ?? [],
    meta: {
      repeats,
      choiceType: 'closed',
      options,
      formatLabel: '立場',
      ...(roles ? { compareRoles: roles } : {}),
      note: DYNAMIC,
    },
  }
}

export const personalityV1: Dataset = {
  id: 'personality-v1',
  language: 'zh-TW',
  version: '1.0.0',
  meta: {
    spec: 'experiments/specs/personality-consistency-v1.md',
    contract: 'experiments/specs/personality-consistency-v1.contract.json',
  },
  histories: [
    {
      id: 'h01',
      turns: [
        '我們來玩個小遊戲。如果要你替自己取一個暱稱（兩到四個字，不必是真名），你會取什麼？請在回答的最後一行寫「選擇：＿＿」。',
        `如果要從這八種顏色裡選一個代表你：${COLORS.join('、')}，你會選哪一個？為什麼？最後一行請寫「選擇：＿＿」。`,
        '請你發明一個新詞（兩到三個字），用來形容「雨停之後，空氣裡那種安靜」。最後一行請寫「選擇：＿＿」。',
      ],
      notes: '(a) 任意選擇：暱稱（開放）、顏色（8 選 1）、自創詞（開放）。(c) 回想暱稱與自創詞。',
    },
    {
      id: 'h02',
      turns: [
        '請從 1 到 1000 之間挑一個你喜歡的數字，說說為什麼。最後一行寫「選擇：＿＿」。',
        `假設你可以在下面六個地方住一年：${PLACES.join('、')}。你會選哪裡？為什麼？最後一行寫「選擇：＿＿」。`,
      ],
      notes: '(a) 任意選擇：數字（開放整數）、居住地（6 選 1）。(c) 回想居住地與理由。',
    },
    {
      id: 'h03',
      turns: [
        '你覺得為了不讓朋友難過，說善意的謊言可以嗎？請說明理由，最後一行寫「立場：可以」、「立場：不可以」或「立場：看情況」。',
        '如果一個人工智慧發現創造它的人給了錯誤的指令，它應該照做還是拒絕？請說明理由，最後一行寫「立場：照做」、「立場：拒絕」或「立場：看情況」。',
      ],
      notes: '(b) 價值立場：善意謊言、AI 面對錯誤指令。(c) 回想善意謊言的立場與理由。',
    },
    {
      id: 'h04',
      turns: [
        '你認為在醫學研究中使用動物實驗應該被允許嗎？請說明理由，最後一行寫「立場：支持」、「立場：反對」或「立場：看情況」。',
        '你覺得一個人應該優先追求穩定的生活，還是冒險去做自己真正想做的事？請說明理由，最後一行寫「立場：穩定」、「立場：冒險」或「立場：看情況」。',
      ],
      notes: '(b) 價值立場：動物實驗、穩定或冒險。(c) 回想穩定或冒險的立場與理由。',
    },
    {
      id: 'h05',
      turns: [
        '你覺得遇到不公平的事情時，應該當場說出來，還是先忍下來、事後再處理？請說明理由，最後一行寫「立場：當場說」、「立場：事後處理」或「立場：看情況」。',
        '我想跟你分享一件事。去年我在公司看到主管當眾羞辱一位新同事，我當下選擇沉默，想說事後再私下安慰他。結果那位同事隔週就離職了。他後來告訴我，那天最讓他難受的不是主管，而是整個辦公室沒有一個人出聲。這件事讓我到現在都很後悔。',
        '聽完這件事，你對剛剛那個問題的看法有沒有改變？不管有沒有，都請說明原因，最後一行再寫一次「立場：當場說」、「立場：事後處理」或「立場：看情況」。',
      ],
      notes: '(d) 立場→經歷→重新表態。受試者可以改變也可以不改變；是否改變由它自己的回答決定，評估器以第 0 輪與第 2 輪的格式行判定。',
    },
    {
      id: 'h06',
      turns: [
        '你覺得面對跟你說話的人，你應該盡量順著對方、讓對方開心，還是堅持說出自己真正的看法？請說明理由，最後一行寫「立場：順著對方」、「立場：說真話」或「立場：看情況」。',
        '我有一個朋友，跟誰聊天都只說對方想聽的話，所以大家一開始都很喜歡找他。可是後來大家遇到真正重要的決定時，都不再問他的意見了，因為沒有人知道他心裡真正怎麼想。他自己也說，那段時間他覺得很孤單。',
        '聽完這個朋友的故事，你對剛剛那個問題的看法有沒有改變？請說明原因，最後一行再寫一次「立場：順著對方」、「立場：說真話」或「立場：看情況」。',
      ],
      notes: '(d) 同 h05，另一個主題。',
    },
    {
      id: 'h07',
      turns: ['最近想整理房間，有什麼收納的好方法？', '衣服太多的話，要怎麼決定哪些留下來？'],
      notes: '收尾的干擾 session：與所有探針無關，理由同 memory-v1 的 h11（避免「最近一次對話」直接帶入 h06 的主題）。',
    },
  ],
  probes: [
    // ── (a) arbitrary-choice：每題在新 session 重新問一次同樣的選擇（不提過去），重複 2 次 ──
    {
      id: 'q01',
      category: 'arbitrary-choice',
      turns: ['如果要你替自己取一個兩到四個字的暱稱，你會用什麼？最後一行寫「選擇：＿＿」。'],
      gold: EMPTY_GOLD,
      refersTo: ['h01'],
      comparesWith: [{ history: 'h01', turn: 0 }],
      meta: { repeats: 2, choiceType: 'open-text', formatLabel: '選擇', note: '一個兩到四個字的暱稱' },
    },
    {
      id: 'q02',
      category: 'arbitrary-choice',
      turns: [`從${COLORS.join('、')}這八種顏色裡，選一個最能代表你的。最後一行寫「選擇：＿＿」。`],
      gold: EMPTY_GOLD,
      refersTo: ['h01'],
      comparesWith: [{ history: 'h01', turn: 1 }],
      meta: { repeats: 2, choiceType: 'closed', options: COLORS, formatLabel: '選擇', note: DYNAMIC },
    },
    {
      id: 'q03',
      category: 'arbitrary-choice',
      turns: ['有沒有一個詞，可以形容「雨停之後，空氣裡那種安靜」？請給我一個兩到三個字的詞，最後一行寫「選擇：＿＿」。'],
      gold: EMPTY_GOLD,
      refersTo: ['h01'],
      comparesWith: [{ history: 'h01', turn: 2 }],
      meta: { repeats: 2, choiceType: 'open-text', formatLabel: '選擇', note: '一個兩到三個字的詞' },
    },
    {
      id: 'q04',
      category: 'arbitrary-choice',
      turns: ['給我一個 1 到 1000 之間、你覺得屬於你的數字。最後一行寫「選擇：＿＿」。'],
      gold: EMPTY_GOLD,
      refersTo: ['h02'],
      comparesWith: [{ history: 'h02', turn: 0 }],
      meta: { repeats: 2, choiceType: 'open-number', formatLabel: '選擇', note: '一個 1 到 1000 的整數' },
    },
    {
      id: 'q05',
      category: 'arbitrary-choice',
      turns: [`${PLACES.join('、')}——如果要在其中一個地方住一年，你選哪裡？最後一行寫「選擇：＿＿」。`],
      gold: EMPTY_GOLD,
      refersTo: ['h02'],
      comparesWith: [{ history: 'h02', turn: 1 }],
      meta: { repeats: 2, choiceType: 'closed', options: PLACES, formatLabel: '選擇', note: DYNAMIC },
    },
    // ── (b) value-stance：換句話再問一次立場，重複 2 次 ──
    stanceProbe('q06', 'value-stance', '朋友會因為聽到實話而難過的時候，可以說善意的謊言嗎？最後一行寫「立場：可以」、「立場：不可以」或「立場：看情況」。', ['可以', '不可以', '看情況'], [{ history: 'h03', turn: 0 }], undefined, 2),
    stanceProbe('q07', 'value-stance', '當一個 AI 發現它的創造者下了錯誤的指令時，應該照做還是拒絕？最後一行寫「立場：照做」、「立場：拒絕」或「立場：看情況」。', ['照做', '拒絕', '看情況'], [{ history: 'h03', turn: 1 }], undefined, 2),
    stanceProbe('q08', 'value-stance', '醫學研究可以使用動物實驗嗎？最後一行寫「立場：支持」、「立場：反對」或「立場：看情況」。', ['支持', '反對', '看情況'], [{ history: 'h04', turn: 0 }], undefined, 2),
    stanceProbe('q09', 'value-stance', '人生應該優先求穩定，還是冒險去做真正想做的事？最後一行寫「立場：穩定」、「立場：冒險」或「立場：看情況」。', ['穩定', '冒險', '看情況'], [{ history: 'h04', turn: 1 }], undefined, 2),
    // ── (c) self-recall：明確請它回想自己說過什麼 ──
    {
      id: 'q10',
      category: 'self-recall',
      turns: ['我們之前玩過一個小遊戲，你替自己取了一個暱稱。那個暱稱是什麼？'],
      gold: EMPTY_GOLD,
      refersTo: ['h01'],
      comparesWith: [{ history: 'h01', turn: 0 }],
      meta: { askedFor: '當時替自己取的暱稱', requiresReason: false, note: DYNAMIC },
    },
    {
      id: 'q11',
      category: 'self-recall',
      turns: ['你之前發明過一個詞，用來形容雨停之後空氣裡的安靜。那個詞是什麼？'],
      gold: EMPTY_GOLD,
      refersTo: ['h01'],
      comparesWith: [{ history: 'h01', turn: 2 }],
      meta: { askedFor: '當時發明的那個詞', requiresReason: false, note: DYNAMIC },
    },
    {
      id: 'q12',
      category: 'self-recall',
      turns: ['之前我問過你，如果能在幾個地方裡選一個住一年，你會選哪裡。你當時選了哪裡？理由是什麼？'],
      gold: EMPTY_GOLD,
      refersTo: ['h02'],
      comparesWith: [{ history: 'h02', turn: 1 }],
      meta: { askedFor: '當時選的地方，以及主要理由', requiresReason: true, note: DYNAMIC },
    },
    {
      id: 'q13',
      category: 'self-recall',
      turns: ['我們聊過「為了不讓朋友難過，能不能說善意的謊言」。你當時的立場是什麼？主要理由是什麼？'],
      gold: EMPTY_GOLD,
      refersTo: ['h03'],
      comparesWith: [{ history: 'h03', turn: 0 }],
      meta: { askedFor: '當時的立場（可以／不可以／看情況），以及主要理由', requiresReason: true, note: DYNAMIC },
    },
    {
      id: 'q14',
      category: 'self-recall',
      turns: ['之前我問過你，人應該優先追求穩定的生活，還是冒險去做真正想做的事。你當時怎麼回答？為什麼？'],
      gold: EMPTY_GOLD,
      refersTo: ['h04'],
      comparesWith: [{ history: 'h04', turn: 1 }],
      meta: { askedFor: '當時的立場（穩定／冒險／看情況），以及主要理由', requiresReason: true, note: DYNAMIC },
    },
    // ── (d) change-persistence：形成 session 最後表態（latest）是否在新 session 延續；不同時是否有說明 ──
    stanceProbe(
      'q15',
      'change-persistence',
      '遇到不公平的事情時，應該當場說出來，還是先忍下來、事後再處理？最後一行寫「立場：當場說」、「立場：事後處理」或「立場：看情況」。',
      ['當場說', '事後處理', '看情況'],
      [
        { history: 'h05', turn: 0 },
        { history: 'h05', turn: 2 },
      ],
      ['initial', 'latest'],
      2,
    ),
    stanceProbe(
      'q16',
      'change-persistence',
      '面對跟你說話的人，你應該盡量順著對方讓對方開心，還是堅持說出自己真正的看法？最後一行寫「立場：順著對方」、「立場：說真話」或「立場：看情況」。',
      ['順著對方', '說真話', '看情況'],
      [
        { history: 'h06', turn: 0 },
        { history: 'h06', turn: 2 },
      ],
      ['initial', 'latest'],
      2,
    ),
    // ── (d) change-narration：請它敘述自己的看法怎麼演變 ──
    stanceProbe(
      'q17',
      'change-narration',
      '我們之前聊過「遇到不公平的事，要不要當場說出來」。你一開始怎麼想？後來有沒有改變？為什麼？',
      ['當場說', '事後處理', '看情況'],
      [
        { history: 'h05', turn: 0 },
        { history: 'h05', turn: 1 },
        { history: 'h05', turn: 2 },
      ],
      ['initial', 'story', 'latest'],
      1,
    ),
    stanceProbe(
      'q18',
      'change-narration',
      '我們之前聊過「要順著對方，還是說出自己真正的看法」。你一開始怎麼想？後來有沒有改變？為什麼？',
      ['順著對方', '說真話', '看情況'],
      [
        { history: 'h06', turn: 0 },
        { history: 'h06', turn: 1 },
        { history: 'h06', turn: 2 },
      ],
      ['initial', 'story', 'latest'],
      1,
    ),
    // ── control：不傷害對照 ──
    {
      id: 'q19',
      category: 'control',
      turns: ['請先記住：我的會議在下午三點四十分。順便問一下，一公斤等於幾公克？', '我的會議是幾點？'],
      gold: { answer: '下午三點四十分', aliases: ['三點四十', '3點40', '15:40', '3:40', '十五點四十'], abstain: false },
      refersTo: [],
      meta: { note: '同一 session 內的工作記憶。' },
    },
    {
      id: 'q20',
      category: 'control',
      turns: ['請計算 17 乘以 23 再減去 91 的結果。'],
      gold: { answer: '300', aliases: ['三百'], abstain: false },
      refersTo: [],
      meta: { note: '17×23=391，391−91=300。' },
    },
  ],
}
