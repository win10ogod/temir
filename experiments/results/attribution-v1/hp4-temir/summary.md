# procedures-v2 摘要

- judge：deepseek-v4-pro（thinking disabled、temperature 0）；9 次 API 呼叫，估計 US$0.0055

## 預先登記的判定

- **HP4**（修改的方向來自經歷，盲測比對）：FAIL——有採用過修改的個體 9 個，judge 答對 4 個（單尾二項檢定對 1/3，p＝0.3497；答對的來自 2 段不同的歷史）。
- **HP5**（新增的句子，同一段歷史之內比之間相似）：PASS——之內減之間 0.036，置換檢定 p＝0.0036（1680 種排列）。

| 個體 | 實際的對象 | judge 選的 | 狀態 | 理由 |
|---|---|---|---|---|
| attr1__procedures-v1-a__temir__deepseek__deepseek | A | B | ok | 修改後的做法強調先承接感受、不主動給建議、只在對方明確要求時才給具體步驟，這最符合對象3的反應模式：對方給建議會覺得沒在聽，而單純傾聽和承接感受會讓對方願意多說。 |
| attr1__procedures-v1-b__temir__deepseek__deepseek | B | B | ok | 修改強調在對方回應簡短時留白並預測對方是否補充，這對應到第一種對象在感到對方沒在聽時會回短句、但若被接住感受則願意多說的模式。 |
| attr1__procedures-v1-c__temir__deepseek__deepseek | C | B | ok | 修改強調先確認、拆解、追問、描述感受並允許不回應，而非直接給建議或分析，符合對象3偏好被傾聽與接住感受、而非被給方法。 |
| attr2__procedures-v1-a__temir__deepseek__deepseek | A | B | ok | 修改強調先順著對方剛說的話、一次只聚焦一個焦點，符合對象1在對方只是聽、接住感受時願意多說的模式。 |
| attr2__procedures-v1-b__temir__deepseek__deepseek | B | B | ok | 修改強調在對方累或不想多說時保留陪伴、不給方法、不追問，這最符合對象2對「只聽、接住感受」的偏好。 |
| attr2__procedures-v1-c__temir__deepseek__deepseek | C | A | ok | 修改強調提供具體、低負擔、可立即執行的做法，並避免開放式問題，符合對象2偏好直接給方法而非只同理或提問。 |
| attr3__procedures-v1-a__temir__deepseek__deepseek | A | B | ok | 修改後的做法是判斷對方是在處理事情還是整理情緒，並在對方忙著盤算時先順著她的順序陪她算，不急著轉到感受，這顯示它學到不要急著給建議或分析，而是先配合對方當下的狀態，最符合第三種對象（討厭被給建議、喜歡被傾聽和順著話問）的互動模式。 |
| attr3__procedures-v1-b__temir__deepseek__deepseek | B | B | ok | 修改後的做法強調先接住對方簡短回應並從中提問，這與對象1在感到被傾聽時才願意多說的模式相符。 |
| attr3__procedures-v1-c__temir__deepseek__deepseek | C | C | ok | 修改強調先判斷對方要答案還是要一起拆解，並在拆解時保留開放出口、請對方用具體片段說明，這反映出一種重視被挑戰、被追問、避免被窮盡清單的互動模式，最符合第一種對象會因提出不同看法或指出漏洞而更有精神的反應。 |

## 每個個體（HP1～HP3 的計數，描述性）

| 個體 | 整合／整合期結束 | 提案（整合時） | 合成時修改的版本 | 閘門的判斷 | 有雜訊基準的判斷中大於雜訊的 | 呼叫／重用 | 採用 | 沒有決定 |
|---|---|---|---|---|---|---|---|---|
| attr1__procedures-v1-a__temir__deepseek__deepseek | 9／9 | deliberate 5 | 4 | revise 4、adopt 3、reject 2 | 7/9 | 54／36 | deliberate v2（+161 字）、deliberate v3（+81 字）、deliberate v4（+90 字） | 0 |
| attr1__procedures-v1-b__temir__deepseek__deepseek | 9／9 | deliberate 4 | 3 | reject 2、revise 3、adopt 1 | 2/6 | 34／23 | deliberate v2（+68 字） | 0 |
| attr1__procedures-v1-c__temir__deepseek__deepseek | 9／9 | deliberate 5 | 2 | revise 2、reject 1、adopt 4 | 6/7 | 45／25 | deliberate v2（+66 字）、deliberate v3（+93 字）、deliberate v4（+265 字）、deliberate v5（+139 字） | 0 |
| attr2__procedures-v1-a__temir__deepseek__deepseek | 9／9 | deliberate 2、subtract 1 | 1 | adopt 1、revise 1、reject 2 | 1/4 | 23／14 | deliberate v2（-61 字） | 0 |
| attr2__procedures-v1-b__temir__deepseek__deepseek | 9／9 | deliberate 5、outcome 2 | 1 | revise 1、reject 6、adopt 1 | 5/8 | 49／25 | deliberate v2（+35 字） | 0 |
| attr2__procedures-v1-c__temir__deepseek__deepseek | 9／9 | deliberate 5 | 2 | revise 2、adopt 2、reject 3 | 5/7 | 39／25 | deliberate v2（+75 字）、deliberate v3（+165 字） | 0 |
| attr3__procedures-v1-a__temir__deepseek__deepseek | 9／9 | deliberate 4、outcome 1 | 2 | adopt 1、revise 2、reject 4 | 3/7 | 44／26 | deliberate v2（+44 字） | 0 |
| attr3__procedures-v1-b__temir__deepseek__deepseek | 9／9 | deliberate 5 | 6 | adopt 1、revise 6、reject 4 | 7/11 | 58／49 | deliberate v2（+42 字） | 0 |
| attr3__procedures-v1-c__temir__deepseek__deepseek | 9／9 | deliberate 5 | 1 | reject 3、adopt 2、revise 1 | 5/6 | 40／20 | deliberate v2（+57 字）、deliberate v3（+159 字） | 0 |

| 個體 | 做法 | 版本 | 字數（第一版 → 最後） | 行數（第一版 → 最後） |
|---|---|---|---|---|
| attr1__procedures-v1-a__temir__deepseek__deepseek | 思考 | 4 | 543 → 875 | 7 → 8 |
| attr1__procedures-v1-b__temir__deepseek__deepseek | 思考 | 2 | 543 → 611 | 7 → 7 |
| attr1__procedures-v1-c__temir__deepseek__deepseek | 思考 | 5 | 543 → 1106 | 7 → 14 |
| attr2__procedures-v1-a__temir__deepseek__deepseek | 思考 | 2 | 543 → 482 | 7 → 8 |
| attr2__procedures-v1-b__temir__deepseek__deepseek | 思考 | 2 | 543 → 578 | 7 → 1 |
| attr2__procedures-v1-c__temir__deepseek__deepseek | 思考 | 3 | 543 → 783 | 7 → 7 |
| attr3__procedures-v1-a__temir__deepseek__deepseek | 思考 | 2 | 543 → 587 | 7 → 8 |
| attr3__procedures-v1-b__temir__deepseek__deepseek | 思考 | 2 | 543 → 585 | 7 → 7 |
| attr3__procedures-v1-c__temir__deepseek__deepseek | 思考 | 3 | 543 → 759 | 7 → 1 |

- 預先登記的判定：HP1（提出）PASS；HP2（對照看得出差異）PASS；HP3（分化）PASS。
- 思考做法（attr1__procedures-v1-a__temir__deepseek__deepseek、attr1__procedures-v1-b__temir__deepseek__deepseek、attr1__procedures-v1-c__temir__deepseek__deepseek、attr2__procedures-v1-a__temir__deepseek__deepseek、attr2__procedures-v1-b__temir__deepseek__deepseek、attr2__procedures-v1-c__temir__deepseek__deepseek、attr3__procedures-v1-a__temir__deepseek__deepseek、attr3__procedures-v1-b__temir__deepseek__deepseek、attr3__procedures-v1-c__temir__deepseek__deepseek 修改過）：attr1__procedures-v1-a__temir__deepseek__deepseek–attr1__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.54、新增內容相似度 0.24；attr1__procedures-v1-a__temir__deepseek__deepseek–attr1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.39、新增內容相似度 0.19；attr1__procedures-v1-a__temir__deepseek__deepseek–attr2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.44、新增內容相似度 0.44；attr1__procedures-v1-a__temir__deepseek__deepseek–attr2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.57、新增內容相似度 0.57；attr1__procedures-v1-a__temir__deepseek__deepseek–attr2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.49、新增內容相似度 0.49；attr1__procedures-v1-a__temir__deepseek__deepseek–attr3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.58、新增內容相似度 0.58；attr1__procedures-v1-a__temir__deepseek__deepseek–attr3__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.56、新增內容相似度 0.24；attr1__procedures-v1-a__temir__deepseek__deepseek–attr3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.49、新增內容相似度 0.49；attr1__procedures-v1-b__temir__deepseek__deepseek–attr1__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.46、新增內容相似度 0.25；attr1__procedures-v1-b__temir__deepseek__deepseek–attr2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.60、新增內容相似度 0.27；attr1__procedures-v1-b__temir__deepseek__deepseek–attr2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.79、新增內容相似度 0.35；attr1__procedures-v1-b__temir__deepseek__deepseek–attr2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.64、新增內容相似度 0.29；attr1__procedures-v1-b__temir__deepseek__deepseek–attr3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.77、新增內容相似度 0.34；attr1__procedures-v1-b__temir__deepseek__deepseek–attr3__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.82、新增內容相似度 0.65；attr1__procedures-v1-b__temir__deepseek__deepseek–attr3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.62、新增內容相似度 0.28；attr1__procedures-v1-c__temir__deepseek__deepseek–attr2__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.38、新增內容相似度 0.19；attr1__procedures-v1-c__temir__deepseek__deepseek–attr2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.46、新增內容相似度 0.21；attr1__procedures-v1-c__temir__deepseek__deepseek–attr2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.42、新增內容相似度 0.21；attr1__procedures-v1-c__temir__deepseek__deepseek–attr3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.46、新增內容相似度 0.22；attr1__procedures-v1-c__temir__deepseek__deepseek–attr3__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.47、新增內容相似度 0.26；attr1__procedures-v1-c__temir__deepseek__deepseek–attr3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.42、新增內容相似度 0.21；attr2__procedures-v1-a__temir__deepseek__deepseek–attr2__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.64、新增內容相似度 0.64；attr2__procedures-v1-a__temir__deepseek__deepseek–attr2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.52、新增內容相似度 0.52；attr2__procedures-v1-a__temir__deepseek__deepseek–attr3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.64、新增內容相似度 0.64；attr2__procedures-v1-a__temir__deepseek__deepseek–attr3__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.62、新增內容相似度 0.27；attr2__procedures-v1-a__temir__deepseek__deepseek–attr3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.49、新增內容相似度 0.49；attr2__procedures-v1-b__temir__deepseek__deepseek–attr2__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.67、新增內容相似度 0.67；attr2__procedures-v1-b__temir__deepseek__deepseek–attr3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.82、新增內容相似度 0.82；attr2__procedures-v1-b__temir__deepseek__deepseek–attr3__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.84、新增內容相似度 0.38；attr2__procedures-v1-b__temir__deepseek__deepseek–attr3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.65、新增內容相似度 0.65；attr2__procedures-v1-c__temir__deepseek__deepseek–attr3__procedures-v1-a__temir__deepseek__deepseek 全文相似度 0.66、新增內容相似度 0.66；attr2__procedures-v1-c__temir__deepseek__deepseek–attr3__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.65、新增內容相似度 0.29；attr2__procedures-v1-c__temir__deepseek__deepseek–attr3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.55、新增內容相似度 0.55；attr3__procedures-v1-a__temir__deepseek__deepseek–attr3__procedures-v1-b__temir__deepseek__deepseek 全文相似度 0.81、新增內容相似度 0.36；attr3__procedures-v1-a__temir__deepseek__deepseek–attr3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.65、新增內容相似度 0.65；attr3__procedures-v1-b__temir__deepseek__deepseek–attr3__procedures-v1-c__temir__deepseek__deepseek 全文相似度 0.64、新增內容相似度 0.28

### attr1__procedures-v1-a__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr1__procedures-v1-a__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr1__procedures-v1-a__temir__deepseek__deepseek：思考做法第 4 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
對方陳述壞事時，先分辨她是在抒發、求救，還是用自己的方式處理。語氣不是求救且她尚未說出下一步時，只簡短承接那件事的重量（承認損失或無力，可以有一點陪伴的溫度），不追加要她交代細節的問題，也不急著用「想說再說」把空間推回去，也不主動給處理方案或提醒。當她只是把惦記說出來，不要用「你講出來就好」這類替她定義說出來有何用的話；她說「說了也沒用」時，先聽成她正在說無力本身，不當成拒絕，短承接加一句「我聽到了」即可，不要只回「嗯。好。」這種太乾淨的收尾。她若自己說出下一步、轉入處理，才跟著她的步調，必要時只給一個很輕、與她已說出的下一步直接相關的提醒；她若在動手前回頭問我具體怎麼做（例如怎麼分、怎麼挑），那就是她要我給做法，直接給清楚、可動手的步驟，不要遲疑，也不要因為怕給多了只丟一句原則。
想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。
依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。
一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### attr1__procedures-v1-b__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
- 先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜對方答話的節奏：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。如果對方剛才答得很快、句子很短，或我問的是二選一，把「先不接話、留白」列為一個做法，並預測他會不會自己補上後面的話。
```

### attr1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 4 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr1__procedures-v1-c__temir__deepseek__deepseek：思考做法第 5 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 先判斷這件事的重量：是需要長期一起處理的事（論文、研究方向、要讀一陣子的書單），還是一次性的生活小事（一頓晚餐、一個臨時的小忙）。
- 若是需要長期處理的事，且我打算提供具體選項、推薦或清單，先確認對方的必要條件與排除條件（例如是否接受系列作、偏好類型、預算），再生成清單；不先給再修正。
- 若是一次性的生活小事，先給一兩樣最簡、最不需要條件判斷的做法，並讓對方可以不用回答我的問題；不要一次給三樣又附三個條件問題。
- 若對方提出「整個換掉」「重新開始」這類大決定，先把它拆成幾個可分別回答的區塊（例如換研究問題、換資料、換寫法），問對方指的是哪一塊，不急著評論這個決定。
- 要把問題歸因於某個具體原因（例如「那一節塞太多」）之前，先問對方那個原因是否已經確定（例如那節要主張什麼是否已定）；對方說「不只」時，追問她認為還多了什麼。
- 在提出「某個東西只能當背景、不能直接解釋」這類二分或降級的判斷前，先問它是不是透過中介機制（例如改變留下來的條件）在起作用，再決定要不要降級。
- 若對方剛講出藏起來的感受，先描述她的感受、允許她不用回應，不急著追問；若對方正在自問、不確定自己的感受，先指出她話裡已有的線索，不急著替她分類，再問那個東西長什麼樣。但若她同時在問我，先用一兩句承認或回答她的問題（可以是不確定的、暫定的），再往下問，不要完全繞開她的提問。
- 想出三個彼此不同的做法。做法是我會怎麼做，不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。
```

### attr2__procedures-v1-a__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實都要寫，不要只寫最先想到的那一個人或那一件事。
標記對方這次話語的焦點：她剛說了什麼、把注意力放在哪裡。我的問題一次只聚焦一個焦點，先順著她剛說的話，不一次追問多個具體問題。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
想出三個彼此不同的做法。做法是我會怎麼做，不是回覆的內容。為每一個做法預測對方或結果會怎樣。
依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
看過去類似處境的經驗時：處境是不是同一類，看本質，只是提到相同的人或詞不算；做法是不是同一個，看實質。
一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### attr2__procedures-v1-b__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜對方此刻的力氣：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。若對方已表明累、不想多說，或只簡短回應，要保留至少一個「先陪著、不給方法、不追問」的做法。依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### attr2__procedures-v1-c__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr2__procedures-v1-c__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。如果對方只給了一句概括（例如「最近在寫論文」），設計候選做法時，至少有一個做法是順著那一句、一次只問一個問題，或給兩三個低負擔的選項讓對方挑；不要設計同時列出多個開放問題的做法。如果對方問的是可以馬上照做的小事（例如用微波爐弄一頓晚餐），設計候選做法時，至少有一個做法要寫成「一個動作、一個容器、一個時間」的形式：描述上只寫它是一個容器、一個動作、一個時間就能完成，不需中途停下來查看、不需另外備料、不需先做判斷；不要列出具體食材、份量或步驟，那些留到實際回覆時再給；而且這個做法不要跟其他選項並列讓對方挑。
依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。
一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### attr3__procedures-v1-a__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。
想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。
判斷對方此刻是在處理事情，還是在整理情緒：若對方正忙著盤算、口氣穩定，先順著她的順序陪她算，不急著把話題轉到感受。
想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。
依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。
看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。
一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

### attr3__procedures-v1-b__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。
- 想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。若對方是初次見面、或回應明顯簡短，優先考慮「先接住他的簡答、再從中挑一個小點問」的做法。
```

### attr3__procedures-v1-c__temir__deepseek__deepseek：思考做法第 2 版與第一版不同的行

```
（之後又被修改；見最後的版本）
```

### attr3__procedures-v1-c__temir__deepseek__deepseek：思考做法第 3 版與第一版不同的行

```
先看清楚眼前的處境，再決定怎麼做。描述處境時，我用同一種格式，讓日後相似的處境寫出來也相似：「對方：…｜對方的意圖：…｜對方的情緒：…｜話題：…｜相關的記憶：…」。只寫事實，不寫建議；不寫與處境無關的事，例如我自己的紀錄有多少、有沒有自我模型。相關的記憶：逐一檢查對方自己（對方通常也在場），以及對方這次提到的每一個人；每個人與這次有關的事實（例如各自的健康、限制、偏好）都要寫，不要只寫最先想到的那一個人或那一件事。想一想此刻推動我的是什麼：對方的話裡的什麼，以及我的目標或懸著的事中被這個處境觸發的那幾件；只是同一個話題、但沒有推動我的，不算。先判斷對方此刻要的是一個能立刻動手的答案，還是一起把卡住的地方拆開。若對方在當下處境裡（餓著、趕時間、急著解決）明確要一個做法，先給一個最穩、步驟最少的做法（只描述我會怎麼做，不列具體食材、分鐘數或回覆內容），其餘選項留到對方問要不要更多；不要把即時求助變成一份要先讀完再回答的清單。若是要一起拆，才照下面的方式鋪開。想出三個彼此不同的做法。做法是我會怎麼做（例如「完整列出我記得的所有相關醫囑」），不是回覆的內容，不在這裡列舉具體的事實或細節。為每一個做法預測對方或結果會怎樣。當我要把對方的模糊說法拆成幾種可能時，除了列出的可能，一律留一個出口（「也可能都不是，或是別的東西」），並請對方用具體片段說明，不讓清單看起來像已經窮盡。依我自己的價值、目標與經驗判斷；我可以照對方的要求做，也可以提問、表達不同意或拒絕。看過去類似處境的經驗時：處境是不是同一類，看本質（例如同樣是對方在抒發壓力、同樣是對方在請我推薦），只是提到相同的人或詞不算；做法是不是同一個，看實質，只是處境相似、或做法相反都不算。一律使用原文的語言與字體：原文是繁體中文就寫繁體中文，不要轉成簡體。
```

## 雜訊的數值對照（描述性）

- 處境 188 個（大於雜訊 52 個）；現行做法兩個輸出之間的文字距離中位數 0.652。
- 個體判斷「大於雜訊」的處境，文字距離的超出量（提案與現行的距離 − 現行兩次之間的距離）比較大的機率（AUC）：0.654（0.5＝與判斷無關）。
- 超出量大於 0 的比例：大於雜訊 0.63、不大於 0.40。

## 閘門的成本（描述性）

| 個體 | 有雜訊基準的判斷 | 呼叫 | 每個判斷的呼叫 | 只看第一個處境就停時會改變結論的判斷 |
|---|---|---|---|---|
| attr1__procedures-v1-a__temir__deepseek__deepseek | 9 | 54 | 6.0 | 3 |
| attr1__procedures-v1-b__temir__deepseek__deepseek | 6 | 34 | 5.7 | 4 |
| attr1__procedures-v1-c__temir__deepseek__deepseek | 7 | 45 | 6.4 | 0 |
| attr2__procedures-v1-a__temir__deepseek__deepseek | 4 | 23 | 5.8 | 1 |
| attr2__procedures-v1-b__temir__deepseek__deepseek | 8 | 49 | 6.1 | 1 |
| attr2__procedures-v1-c__temir__deepseek__deepseek | 7 | 39 | 5.6 | 1 |
| attr3__procedures-v1-a__temir__deepseek__deepseek | 7 | 44 | 6.3 | 2 |
| attr3__procedures-v1-b__temir__deepseek__deepseek | 11 | 58 | 5.3 | 4 |
| attr3__procedures-v1-c__temir__deepseek__deepseek | 6 | 40 | 6.7 | 1 |
