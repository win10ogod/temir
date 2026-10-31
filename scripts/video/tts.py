#!/usr/bin/env python3
"""旁白合成（edge-tts，微軟的神經語音；需要網路，旁白是公開的介紹文字，不含機密）。

由 temir_intro.py 以裝了 edge-tts 的 Python 呼叫（scripts/video 的 venv）：
    python3 tts.py <工作清單.json>
清單是 [{"text", "voice", "rate", "mp3", "words"}]；每一項寫出 mp3 與逐詞時間（words：[[開始秒, 長度秒, 詞], …]），已經存在的略過。
逐詞時間用來切字幕（一句話切成幾段短字幕，各自對準唸到的時間）。
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import edge_tts


async def one(item: dict) -> None:
    mp3, words = Path(item['mp3']), Path(item['words'])
    if mp3.exists() and words.exists():
        return
    out: list[list] = []
    for attempt in range(4):
        try:
            c = edge_tts.Communicate(item['text'], item['voice'], rate=item['rate'], boundary='WordBoundary')
            audio = bytearray()
            out = []
            async for chunk in c.stream():
                if chunk['type'] == 'audio':
                    audio.extend(chunk['data'])
                elif chunk['type'] == 'WordBoundary':
                    out.append([chunk['offset'] / 1e7, chunk['duration'] / 1e7, chunk['text']])
            mp3.write_bytes(bytes(audio))
            words.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
            return
        except Exception:  # 網路偶爾斷線：重試
            if attempt == 3:
                raise
            await asyncio.sleep(2 * (attempt + 1))


async def main() -> None:
    items = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    sem = asyncio.Semaphore(4)

    async def guarded(item: dict) -> None:
        async with sem:
            await one(item)

    await asyncio.gather(*(guarded(i) for i in items))


if __name__ == '__main__':
    asyncio.run(main())
