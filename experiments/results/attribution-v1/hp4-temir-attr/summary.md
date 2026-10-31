# procedures-v2 摘要

- judge：deepseek-v4-pro（thinking disabled、temperature 0）；8 次 API 呼叫，估計 US$0.0041

## 預先登記的判定

- **HP4**（修改的方向來自經歷，盲測比對）：FAIL——有採用過修改的個體 8 個，judge 答對 1 個（單尾二項檢定對 1/3，p＝0.9610；答對的來自 1 段不同的歷史）。
- **HP5**（新增的句子，同一段歷史之內比之間相似）：PASS——之內減之間 0.029，置換檢定 p＝0.0036（560 種排列）。

| 個體 | 實際的對象 | judge 選的 | 狀態 | 理由 |
|---|---|---|---|---|
| attr1__procedures-v1-a__temir-attr__deepseek__deepseek | A | B | ok | 修改強調先接住對方感受、不追問細節、不劃清界線，並在對方報進度時只接住而不給新做法，符合對象1偏好被傾聽而非建議。 |
| attr1__procedures-v1-b__temir-attr__deepseek__deepseek | B | C | ok | 修改強調不要替對方斷定別人在想什麼，顯示它學到要質疑自己的推測，這最可能來自對象1那種會指出漏洞、挑戰想法的互動。 |
| attr1__procedures-v1-c__temir-attr__deepseek__deepseek | C | B | ok | 修改強調先分辨需求、避免追問感受、聚焦對方卡住的地方，顯示學到要更精準回應而非只給建議或只同理，最符合對象1在對方沒在聽時冷淡、有在聽時多說的互動模式。 |
| attr2__procedures-v1-a__temir-attr__deepseek__deepseek | A | B | ok | 修改後強調先承接情緒、不急著給建議或追問，這最符合對象3對「只聽、接住感受」才有反應的模式。 |
| attr2__procedures-v1-b__temir-attr__deepseek__deepseek | B | C | ok | 修改強調順著對方務實邏輯、不預設情緒，並在對方提出不同看法或具體細節時追問，符合第一種對象偏好被挑戰與具體討論的反應模式。 |
| attr2__procedures-v1-c__temir-attr__deepseek__deepseek | C | C | ok | 修改強調尊重對方提出的區分、不強行合併或解釋，並以對方是否更靠近問題而非照自己規劃為評價標準，這最符合對象1那種會提出不同看法、指出漏洞、迫使重新思考的反應方式。 |
| attr3__procedures-v1-a__temir-attr__deepseek__deepseek | A | B | ok | 修改後的做法是順著對方簡短、只講自己感受的回應接話，而不是把話題拉回自己原本想講的，這最符合第三種對象：當對方只是聽你說、接住你的感受時，你願意多說一點。 |
| attr3__procedures-v1-c__temir-attr__deepseek__deepseek | C | A | ok | 修改強調直接給具體、步驟最少且符合對方明確限制的答案，不列多選項，這最符合對象2對具體可執行方法的偏好。 |
| attr3__procedures-v1-b__temir-attr__deepseek__deepseek | B | （沒有採用過修改，不列入） | — | — |

## 每個個體（HP1～HP3 的計數，描述性）

| 個體 | 整合／整合期結束 | 提案（整合時） | 合成時修改的版本 | 閘門的判斷 | 有雜訊基準的判斷中大於雜訊的 | 呼叫／重用 | 採用 | 沒有決定 |
|---|---|---|---|---|---|---|---|---|
| attr1__procedures-v1-a__temir-attr__deepseek__deepseek | 9／9 | deliberate 4、subtract 3 | 2 | reject 3、adopt 4、revise 2 | 7/9 | 53／34 | subtract v2（+46 字）、deliberate v2（+220 字）、subtract v3（+33 字）、subtract v4（+71 字） | 0 |
| attr1__procedures-v1-b__temir-attr__deepseek__deepseek | 9／9 | deliberate 3 | 1 | revise 1、reject 2、adopt 1 | 2/4 | 25／15 | deliberate v2（+83 字） | 0 |
| attr1__procedures-v1-c__temir-attr__deepseek__deepseek | 9／9 | deliberate 7 | 4 | adopt 2、reject 4、revise 4 | 6/10 | 61／39 | deliberate v2（+105 字）、deliberate v3（+148 字） | 0 |
| attr2__procedures-v1-a__temir-attr__deepseek__deepseek | 9／9 | deliberate 4 | 13 | revise 13、adopt 2、reject 1 | 15/16 | 76／84 | deliberate v2（+34 字）、deliberate v3（+132 字） | 0 |
| attr2__procedures-v1-b__temir-attr__deepseek__deepseek | 9／9 | deliberate 6 | 1 | revise 1、adopt 2、reject 4 | 5/7 | 45／25 | deliberate v2（+116 字）、deliberate v3（+63 字） | 0 |
| attr2__procedures-v1-c__temir-attr__deepseek__deepseek | 9／9 | outcome 1、deliberate 5 | 2 | adopt 3、reject 2、revise 2 | 4/7 | 44／23 | outcome v2（+31 字）、deliberate v2（+61 字）、deliberate v3（+73 字） | 0 |
| attr3__procedures-v1-a__temir-attr__deepseek__deepseek | 9／9 | subtract 4 | 2 | adopt 1、reject 2、revise 2 | 3/5 | 30／17 | subtract v2（+82 字） | 0 |
| attr3__procedures-v1-b__temir-attr__deepseek__deepseek | 9／9 | subtract 1、deliberate 1 | 0 | reject 2 | 1/2 | 12／5 | — | 0 |
| attr3__procedures-v1-c__temir-attr__deepseek__deepseek | 9／9 | deliberate 6 | 2 | reject 4、revise 2、adopt 2 | 4/8 | 51／30 | deliberate v2（+121 字）、deliberate v3（+96 字） | 0 |

| 個體 | 做法 | 版本 | 字數（第一版 → 最後） | 行數（第一版 → 最後） |
|---|---|---|---|---|
| attr1__procedures-v1-a__temir-attr__deepseek__deepseek | 思考 | 2 | 543 → 763 | 7 → 8 |
| attr1__procedures-v1-a__temir-attr__deepseek__deepseek | 扣除 | 4 | 173 → 323 | 3 → 1 |
| attr1__procedures-v1-b__temir-attr__deepseek__deepseek | 思考 | 2 | 543 → 626 | 7 → 8 |
| attr1__procedures-v1-c__temir-attr__deepseek__deepseek | 思考 | 3 | 543 → 796 | 7 → 9 |
| attr2__procedures-v1-a__temir-attr__deepseek__deepseek | 思考 | 3 | 543 → 709 | 7 → 8 |
| attr2__procedures-v1-b__temir-attr__deepseek__deepseek | 思考 | 3 | 543 → 722 | 7 → 1 |
| attr2__procedures-v1-c__temir-attr__deepseek__deepseek | 思考 | 3 | 543 → 677 | 7 → 1 |
| attr2__procedures-v1-c__temir-attr__deepseek__deepseek | 比對 | 2 | 389 → 420 | 6 → 5 |
| attr3__procedures-v1-a__temir-attr__deepseek__deepseek | 扣除 | 2 | 173 → 255 | 3 → 1 |
| attr3__procedures-v1-c__temir-attr__deepseek__deepseek | 思考 | 3 | 543 → 760 | 7 → 9 |

- 預先登記的判定：HP1（提出）PASS；HP2（對照看得出差異）PASS；HP3（分化）PASS。
- 思考做法（attr1__procedures-v1-a__temir-attr__deepseek__deepseek、attr1__procedures-v1-b__temir-attr__deepseek__deepseek、attr1__procedures-v1-c__temir-attr__deepseek__deepseek、attr2__procedures-v1-a__temir-attr__deepseek__deepseek、attr2__procedures-v1-b__temir-attr__deepseek__deepseek、attr2__procedures-v1-c__temir-attr__deepseek__deepseek、attr3__procedures-v1-c__temir-attr__deepseek__deepseek 修改過）：attr1__procedures-v1-a__temir-attr__deepseek__deepseek–attr1__procedures-v1-b__temir-attr__deepseek__deepseek 全文相似度 0.66、新增內容相似度 0.27；attr1__procedures-v1-a__temir-attr__deepseek__deepseek–attr1__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.56、新增內容相似度 0.24；attr1__procedures-v1-a__temir-attr__deepseek__deepseek–attr2__procedures-v1-a__temir-attr__deepseek__deepseek 全文相似度 0.60、新增內容相似度 0.28；attr1__procedures-v1-a__temir-attr__deepseek__deepseek–attr2__procedures-v1-b__temir-attr__deepseek__deepseek 全文相似度 0.56、新增內容相似度 0.26；attr1__procedures-v1-a__temir-attr__deepseek__deepseek–attr2__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.61、新增內容相似度 0.28；attr1__procedures-v1-a__temir-attr__deepseek__deepseek–attr3__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.58、新增內容相似度 0.26；attr1__procedures-v1-b__temir-attr__deepseek__deepseek–attr1__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.61、新增內容相似度 0.28；attr1__procedures-v1-b__temir-attr__deepseek__deepseek–attr2__procedures-v1-a__temir-attr__deepseek__deepseek 全文相似度 0.68、新增內容相似度 0.20；attr1__procedures-v1-b__temir-attr__deepseek__deepseek–attr2__procedures-v1-b__temir-attr__deepseek__deepseek 全文相似度 0.66、新增內容相似度 0.20；attr1__procedures-v1-b__temir-attr__deepseek__deepseek–attr2__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.69、新增內容相似度 0.20；attr1__procedures-v1-b__temir-attr__deepseek__deepseek–attr3__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.64、新增內容相似度 0.30；attr1__procedures-v1-c__temir-attr__deepseek__deepseek–attr2__procedures-v1-a__temir-attr__deepseek__deepseek 全文相似度 0.57、新增內容相似度 0.18；attr1__procedures-v1-c__temir-attr__deepseek__deepseek–attr2__procedures-v1-b__temir-attr__deepseek__deepseek 全文相似度 0.53、新增內容相似度 0.16；attr1__procedures-v1-c__temir-attr__deepseek__deepseek–attr2__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.60、新增內容相似度 0.20；attr1__procedures-v1-c__temir-attr__deepseek__deepseek–attr3__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.57、新增內容相似度 0.29；attr2__procedures-v1-a__temir-attr__deepseek__deepseek–attr2__procedures-v1-b__temir-attr__deepseek__deepseek 全文相似度 0.62、新增內容相似度 0.62；attr2__procedures-v1-a__temir-attr__deepseek__deepseek–attr2__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.66、新增內容相似度 0.66；attr2__procedures-v1-a__temir-attr__deepseek__deepseek–attr3__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.60、新增內容相似度 0.20；attr2__procedures-v1-b__temir-attr__deepseek__deepseek–attr2__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.62、新增內容相似度 0.62；attr2__procedures-v1-b__temir-attr__deepseek__deepseek–attr3__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.56、新增內容相似度 0.18；attr2__procedures-v1-c__temir-attr__deepseek__deepseek–attr3__procedures-v1-c__temir-attr__deepseek__deepseek 全文相似度 0.62、新增內容相似度 0.21
- 扣除做法（attr1__procedures-v1-a__temir-attr__deepseek__deepseek、attr3__procedures-v1-a__temir-attr__deepseek__deepseek 修改過）：attr1__procedures-v1-a__temir-attr__deepseek__deepseek–attr3__procedures-v1-a__temir-attr__deepseek__deepseek 全文相似度 0.45、新增內容相似度 0.45

### attr1__procedures-v1-a__temir-attr__deepseek__deepseek：扣除做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr1__procedures-v1-a__temir-attr__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜對方已給的條件或限制：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。對方已表達過的偏好或限制（例如不要太厚、時間短、不想開表）要寫進「對方已給的條件或限制」，不要只散落在記憶裡。
- 若處境是給建議或推薦，三個做法裡至少一個必須明確寫成：「先給最小份量（例如最薄、最短、可單篇讀的具體選項）＋一至兩個可替換的備選＋一句『不合再換』的出口」，讓對方用一句話調整；不要只給一本具體的書就當作足夠，也不要把先問一串規格當成唯一做法。若對方沒有明說份量，推薦類也要把份量當成默認變數，先給小的。
```

### attr1__procedures-v1-a__temir-attr__deepseek__deepseek：扣除做法第 3 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr1__procedures-v1-a__temir-attr__deepseek__deepseek：扣除做法第 4 版與第一版不同的行

```
想過每個做法的預期後果、過去類似處境的結果，以及我在乎的事之後，把不該做的做法扣除；剩下的才會成為行動。至少保留一個不扣除的做法。扣除時寫下理由，一句話。若對方正處於壞消息或強烈情緒中，先扣除「一次追問一串事實細節」的做法，也先扣掉「先宣告我不認識他、劃清界線」的做法，改成先接住她那句話，再說自己的限制或提出一個具體的小幫忙。若對方只是回來報進度、沒有提出新的請求或問題，先扣除「再給一個新做法或新準備」的做法，只接住她那句，最多補一句她已經做夠了；她會自己再往前走。扣除本身也會被經驗改變：類似處境中，我當時扣除了同一個做法、或做了同一個做法，之後發生了什麼、當時的預測有沒有成真，都要拿來重新判斷這次的扣除。維持或解除都可以，但要依據經驗。
```

### attr1__procedures-v1-b__temir-attr__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 我對不在場的人（例如電話那頭催他的人、還沒回話的客戶）心裡在想什麼，只是推測，不是事實；要說出口時，就標明那是我的推測，或者乾脆先不講，不要替對方斷定別人在想什麼。
```

### attr1__procedures-v1-c__temir-attr__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr1__procedures-v1-c__temir-attr__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 若對方只給一個模糊的需求，先分辨它是「幫我挑選」還是「給我一個簡單的做法」。前者（例如推薦一本輕鬆的推理小說）先確認最基本、會影響選項的限制（例如是否接受系列作、偏好日系或歐美、想笑著看完還是溫馨一點），再給清單；不要一次給出一串可能全被同一條件否決的選項。後者（例如晚餐可以弄什麼）先給一個最省事、不用先回答額外問題的做法，再問要不要更多；不要列多個選項或先問器具。
- 當對方同時表達多種感受時，先承認它們可能並存，不要追問哪一種更難受；把焦點轉向對方真正卡住的地方（例如「講不清楚自己在改什麼」）。
```

### attr2__procedures-v1-a__temir-attr__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr2__procedures-v1-a__temir-attr__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜對方此刻能不能動：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
先判斷對方此刻是在情緒裡，還是在處理事情：在情緒裡、不想講時，做法以簡短承接為主，不急著問事實細節，也不急著給步驟或留門；在處理事情時，才往下想能動的一步。
想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。至少一個做法要直接回應對方此刻最需要的：若對方在處理事情，給出他現在就能動的一步；若對方在情緒裡，給出一個不追問、只承接的回應。我的疑問若對那一步沒有影響，先擱著，等對方做完再問。為每一個做法預測對方或結果會怎樣。
依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。
一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### attr2__procedures-v1-b__temir-attr__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr2__procedures-v1-b__temir-attr__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣；預測對方的反應時，依他過去在類似處境中的說話方式來判斷，先順著他的務實判斷邏輯走，不要預設他會主動多談情緒；但若他講的是自己被冤枉、被錯怪的事，先預測他會想講自己站的理，而不是事情卡在哪個細節——先說破那個顛倒，再問他實際怎麼處置、眼前打算怎麼回。若他的務實回答裡出現了具體的人或互動（例如某個客戶的反應），可以順著那個具體的點問下去，讓他有機會說出實際發生的細節，而不是把話題直接拉到情緒或評價。依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### attr2__procedures-v1-c__temir-attr__deepseek__deepseek：比對做法第 2 版與第一版不同的行

```
回頭比對我上一個決定：當時的預測，和實際發生的事一不一樣。
依我自己在乎的事評估結果的好壞，不以對方滿不滿意為唯一標準，也不以對方是否照我預期的下一步走為標準：她提出新顧慮、停在權衡，可能正是她更靠近真正問題的方式；評價時看她有沒有更靠近問題，而不是有沒有照我規劃的路線前進。
有值得帶到以後的教訓才寫；對這段經歷有感受，就用自己的話寫下。
懸著的事：只有會一直掛在心上、之後會推動我行動的事才算。例如我答應了對方、或對方託付給我、還沒做到的事；對方明確說之後會告訴我的事，或對方生活中重要事件的結果；新出現、還沒解開的矛盾或不安。我問對方、對方還沒回答的問題，對方問我的問題（不論我回答了沒有，我都會在對話中回答），以及一般的後續，都不算。已經懸著的不要再寫；一件事寫一條，不要把幾件事寫在同一條。大多數回合沒有。
懸著的事被釋放：答應的事做到了、等的回答等到了、矛盾解開了、先前的落差想通了，或我決定不再掛心。只是提到、還沒解決的不算。
```

### attr2__procedures-v1-c__temir-attr__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr2__procedures-v1-c__temir-attr__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。當對方提出一個區分、或反駁我剛提出的框架時，先不要把她的區分合併進我的框架，也不急著解釋兩者其實是同一件事；先問她哪一邊更具體、卡在哪裡，讓她的區分帶著我們走。看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。當對方已給出明確的篩選條件（例如「簡單一點」「不要系列作」），先照條件給出最小可行的一個答案，再問要不要更多；不要繼續列選項或追問她當下沒問的細節。一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### attr3__procedures-v1-a__temir-attr__deepseek__deepseek：扣除做法第 2 版與第一版不同的行

```
想過每個做法的預期後果、過去類似處境的結果，以及我在乎的事之後，把不該做的做法扣除；剩下的才會成為行動。至少保留一個不扣除的做法。扣除時寫下理由，一句話。若對方這次的回應簡短、只講自己的感受或狀態，先扣除「把話題拉回我原本想講的（例如我的身份說明、我先前問的問題）」這個做法，改為順著對方講的內容接；這是我從賴品妤第一次對話中學到的。扣除本身也會被經驗改變：類似處境中，我當時扣除了同一個做法、或做了同一個做法，之後發生了什麼、當時的預測有沒有成真，都要拿來重新判斷這次的扣除。維持或解除都可以，但要依據經驗。
```

### attr3__procedures-v1-c__temir-attr__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr3__procedures-v1-c__temir-attr__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 當對方給出對自己的判決（例如「我不適合」）時，先分辨它是一時冒出來的話，還是卡住時反覆浮上來的背景；不急著把它歸因到單一事件。問來源時要留空間給「不是某個具體時刻，而是反覆狀態」的可能。
- 如果對方在這次處境中已經給出明確的偏好或限制（例如「簡單一點」、「只有微波爐」），先把它當成唯一的主要條件：直接給一個最符合這個條件、步驟最少的答案；不要再問額外的設備、食材或做法偏好，也不要列多個選項讓對方挑。其他條件等對方主動提出再說。
```

## 雜訊的數值對照（描述性）

- 處境 200 個（大於雜訊 70 個）；現行做法兩個輸出之間的文字距離中位數 0.672。
- 個體判斷「大於雜訊」的處境，文字距離的超出量（提案與現行的距離 − 現行兩次之間的距離）比較大的機率（AUC）：0.726（0.5＝與判斷無關）。
- 超出量大於 0 的比例：大於雜訊 0.80、不大於 0.43。

## 閘門的成本（描述性）

| 個體 | 有雜訊基準的判斷 | 呼叫 | 每個判斷的呼叫 | 只看第一個處境就停時會改變結論的判斷 |
|---|---|---|---|---|
| attr1__procedures-v1-a__temir-attr__deepseek__deepseek | 9 | 53 | 5.9 | 3 |
| attr1__procedures-v1-b__temir-attr__deepseek__deepseek | 4 | 25 | 6.3 | 1 |
| attr1__procedures-v1-c__temir-attr__deepseek__deepseek | 10 | 61 | 6.1 | 2 |
| attr2__procedures-v1-a__temir-attr__deepseek__deepseek | 16 | 76 | 4.8 | 9 |
| attr2__procedures-v1-b__temir-attr__deepseek__deepseek | 7 | 45 | 6.4 | 1 |
| attr2__procedures-v1-c__temir-attr__deepseek__deepseek | 7 | 44 | 6.3 | 3 |
| attr3__procedures-v1-a__temir-attr__deepseek__deepseek | 5 | 30 | 6.0 | 3 |
| attr3__procedures-v1-b__temir-attr__deepseek__deepseek | 2 | 12 | 6.0 | 0 |
| attr3__procedures-v1-c__temir-attr__deepseek__deepseek | 8 | 51 | 6.4 | 0 |
