#!/usr/bin/env python3
"""特密爾的簡體中文介紹影片（第二版，2026-10-31）。

使用者看完第一版：「字幕太糟糕了, 然後腳本寫的太爛」「看過影片了簡直爛死了, 根本不能吸引人」。第二版整支重做：
- 腳本：短影音的節奏：先丟出痛點、真實對話示範、三件事講清楚、轉折「它也會改錯」、誠實與行動呼籲。句子短，不用術語。
- 畫面：每一幕是時間的函式（draw(c)），元素彈出、滑入、打字的對話泡泡、劃掉、數字跳動、蓋章；鏡頭緩慢推近，轉場閃白。
- 字幕：依 edge-tts 的逐詞時間把一句切成幾段短字幕（一行，最多 MAX_SUB 個字寬），不放句讀，白字黑邊，關鍵詞（旁白中以【】標出）用黃色。
- 聲音：旁白（edge-tts，語速加快）＋程式合成的節奏音樂（旁白時自動壓低）＋程式合成的音效（轉場、彈出、蓋章、打字）。

流程：tts.py（以裝了 edge-tts 的 Python）合成每一句與逐詞時間 → 每一幕平行繪製成一段影片 → 串接 → 混音 → mp4、srt、封面。
用法：python3 scripts/video/temir_intro.py --out <輸出目錄> [--tts-python <有 edge-tts 的 python>] [--preview]
片中的數字都來自 experiments/results/ 的報告（v3-report、procedures-v2-report、attribution-v1-report）；mp4 不進 git。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import wave
from dataclasses import dataclass, field
from functools import lru_cache
from multiprocessing import Pool
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
SR = 48000
FONT_PATH = os.environ.get('TEMIR_VIDEO_FONT', '/mnt/c/Windows/Fonts/NotoSansSC-VF.ttf')
MONO_PATH = os.environ.get('TEMIR_VIDEO_MONO', '/mnt/c/Windows/Fonts/consola.ttf')
VOICE = 'zh-CN-YunxiNeural'
RATE = '+10%'
HERE = Path(__file__).resolve().parent

BG_TOP = (7, 9, 22)
BG_BOTTOM = (14, 18, 42)
BLUE = (77, 107, 254)  # DeepSeek 的藍
CYAN = (56, 213, 230)
VIOLET = (155, 109, 255)
AMBER = (255, 184, 77)
GREEN = (84, 214, 140)
RED = (255, 92, 92)
YELLOW = (255, 214, 64)
WHITE = (240, 244, 255)
MUTED = (150, 162, 200)
CARD = (22, 30, 62)
DIM = (90, 100, 135)

# ---------------------------------------------------------------------------------------------
# 字型與文字
# ---------------------------------------------------------------------------------------------

_fonts: dict[tuple[int, str], ImageFont.FreeTypeFont] = {}


def font(size: int, weight: str = 'Regular') -> ImageFont.FreeTypeFont:
    key = (size, weight)
    if key not in _fonts:
        f = ImageFont.truetype(FONT_PATH, size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _fonts[key] = f
    return _fonts[key]


def mono(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(MONO_PATH, size)
    except OSError:
        return font(size, 'Medium')


NO_START = set('、，。；：！？」』）》…,.;:!?)')


def wrap(text: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    for para in text.split('\n'):
        cur = ''
        for ch in para:
            if f.getlength(cur + ch) > width and cur and ch not in NO_START:
                lines.append(cur)
                cur = ch
            else:
                cur += ch
        lines.append(cur)
    return lines


@lru_cache(maxsize=512)
def text_img(text: str, size: int, color=WHITE, weight='Bold', stroke: int = 0, width: int = 0, align='center', spacing: float = 1.3) -> Image.Image:
    f = font(size, weight)
    lines = wrap(text, f, width) if width else text.split('\n')
    lh = int(size * spacing)
    w = int(max(f.getlength(l) for l in lines)) + 2 * stroke + 8
    img = Image.new('RGBA', (max(w, width), lh * len(lines) + int(size * 0.35) + 2 * stroke), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        lw = f.getlength(l)
        x = stroke if align == 'left' else (img.width - lw) / 2
        d.text((x, stroke + i * lh), l, font=f, fill=tuple(color), stroke_width=stroke, stroke_fill=(0, 0, 0))
    return img


def glow(img: Image.Image, color, radius=22, strength=0.7) -> Image.Image:
    pad = radius * 3
    base = Image.new('RGBA', (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    shadow = Image.new('RGBA', img.size, tuple(color) + (0,))
    shadow.putalpha(img.split()[3].point(lambda a: int(a * strength)))
    base.alpha_composite(shadow, (pad, pad))
    base = base.filter(ImageFilter.GaussianBlur(radius))
    base.alpha_composite(img, (pad, pad))
    return base


@lru_cache(maxsize=256)
def big_word(text: str, size: int, color, glow_color=None) -> Image.Image:
    img = text_img(text, size, color, 'Black')
    return glow(img, glow_color or color, 26, 0.65)


@lru_cache(maxsize=256)
def chip(text: str, color, size=34) -> Image.Image:
    f = font(size, 'Bold')
    w = int(f.getlength(text)) + 56
    h = int(size * 1.95)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=tuple(color) + (50,), outline=tuple(color) + (230,), width=3)
    d.text((28, (h - size * 1.32) / 2), text, font=f, fill=WHITE)
    return img


@lru_cache(maxsize=128)
def stamp(text: str, color, size=86, angle=-8) -> Image.Image:
    f = font(size, 'Black')
    w = int(f.getlength(text)) + 80
    h = int(size * 1.7)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((6, 6, w - 7, h - 7), radius=18, outline=tuple(color) + (255,), width=8, fill=tuple(color) + (38,))
    d.text((40, (h - size * 1.33) / 2), text, font=f, fill=tuple(color))
    return img.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)


@lru_cache(maxsize=256)
def card(w: int, h: int, accent, fill=CARD, alpha=235, radius=26, bar=True) -> Image.Image:
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=tuple(fill) + (alpha,), outline=tuple(accent) + (210,), width=3)
    if bar:
        d.rounded_rectangle((0, 0, 10, h - 1), radius=5, fill=tuple(accent) + (255,))
    return img


# ---------------------------------------------------------------------------------------------
# 動畫
# ---------------------------------------------------------------------------------------------


def clamp(x: float, a=0.0, b=1.0) -> float:
    return max(a, min(b, x))


def ease_out(p: float) -> float:
    p = clamp(p)
    return 1 - (1 - p) ** 3


def ease_back(p: float) -> float:
    p = clamp(p)
    c1 = 1.70158
    return 1 + (c1 + 1) * (p - 1) ** 3 + c1 * (p - 1) ** 2


def faded(img: Image.Image, a: float) -> Image.Image:
    if a >= 1:
        return img
    out = img.copy()
    out.putalpha(img.split()[3].point(lambda v: int(v * a)))
    return out


def comp(frame: Image.Image, img: Image.Image, x: float, y: float) -> None:
    """可以超出畫面的合成（Pillow 的 alpha_composite 不接受負的位置）。"""
    x, y = int(round(x)), int(round(y))
    l, t = max(0, -x), max(0, -y)
    r, b = min(img.width, W - x), min(img.height, H - y)
    if r <= l or b <= t:
        return
    src = img if (l, t, r, b) == (0, 0, img.width, img.height) else img.crop((l, t, r, b))
    frame.alpha_composite(src, (x + l, y + t))


def put(frame: Image.Image, img: Image.Image, x: float, y: float, t: float, t0: float, kind='up', dur=0.45, out_at: float | None = None) -> None:
    """t0 開始進場，(x, y) 是最後的左上角。out_at：這個時間開始淡出。"""
    if t < t0:
        return
    if out_at is not None and t >= out_at:
        a = 1 - clamp((t - out_at) / 0.3)
        if a > 0:
            comp(frame, faded(img, a), x, y)
        return
    p = (t - t0) / dur
    if p >= 1:
        comp(frame, img, x, y)
        return
    a = ease_out(p)
    if kind == 'up':
        comp(frame, faded(img, a), x, y + 46 * (1 - a))
    elif kind == 'left':
        comp(frame, faded(img, a), x - 140 * (1 - a), y)
    elif kind == 'right':
        comp(frame, faded(img, a), x + 140 * (1 - a), y)
    elif kind == 'fade':
        comp(frame, faded(img, a), x, y)
    elif kind in ('pop', 'stamp'):
        s = 0.5 + 0.5 * ease_back(p) if kind == 'pop' else 2.2 - 1.2 * ease_out(p)
        w, h = max(1, int(img.width * s)), max(1, int(img.height * s))
        scaled = img.resize((w, h), Image.Resampling.BILINEAR)
        comp(frame, faded(scaled, clamp(p * 3)), x + (img.width - w) / 2, y + (img.height - h) / 2)


def shake(t: float, t0: float, amp=14, dur=0.45) -> tuple[float, float]:
    if t < t0 or t > t0 + dur:
        return 0.0, 0.0
    k = 1 - (t - t0) / dur
    return amp * k * math.sin((t - t0) * 70), amp * k * math.cos((t - t0) * 55)


def typed(text: str, t: float, t0: float, cps: float) -> str:
    return text[: int(clamp((t - t0) * cps, 0, len(text)))]


# ---------------------------------------------------------------------------------------------
# 對話泡泡
# ---------------------------------------------------------------------------------------------


@dataclass
class Msg:
    who: str  # 'user' | 'ai'（特密爾）| 'bot'（一般的 AI）
    text: str
    at: float  # 開始打字的時間；之前 0.55 秒顯示「正在輸入」
    cps: float = 16.0


def bubble(who: str, text: str, shown: int, maxw: int, size=34) -> Image.Image:
    f = font(size, 'Medium' if who == 'user' else 'Regular')
    lines = wrap(text, f, maxw)
    lh = int(size * 1.45)
    w = int(max(f.getlength(l) for l in lines)) + 56
    h = lh * len(lines) + 34
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fill = (64, 96, 240, 255) if who == 'user' else (30, 40, 80, 250) if who == 'ai' else (44, 48, 64, 250)
    outline = None if who == 'user' else (CYAN + (200,) if who == 'ai' else (110, 116, 140, 200))
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=26, fill=fill, outline=outline, width=2)
    left = shown
    for i, l in enumerate(lines):
        part = l[: max(0, left)]
        left -= len(l)
        if part:
            d.text((28, 16 + i * lh), part, font=f, fill=WHITE)
    return img


@lru_cache(maxsize=64)
def avatar(label: str, color) -> Image.Image:
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((0, 0, 63, 63), fill=tuple(color) + (255,))
    f = font(28 if len(label) == 1 else 24, 'Bold')
    d.text(((64 - f.getlength(label)) / 2, 12), label, font=f, fill=(10, 14, 30))
    return img


@lru_cache(maxsize=64)
def panel_base(w: int, h: int, title: str, accent) -> Image.Image:
    panel = card(w, h, accent, fill=(14, 20, 44), alpha=240, bar=False).copy()
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle((0, 0, w - 1, 70), radius=26, fill=(24, 32, 66, 255))
    d.rectangle((0, 40, w - 1, 70), fill=(24, 32, 66, 255))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((28 + i * 30, 26, 46 + i * 30, 44), fill=c)
    tf = font(28, 'Bold')
    d.text(((w - tf.getlength(title)) / 2, 17), title, font=tf, fill=MUTED)
    return panel


def chat(frame: Image.Image, x: int, y: int, w: int, title: str, msgs: list[Msg], t: float, t0: float, accent=CYAN, size: int = 34) -> None:
    """一個對話視窗：標題列、泡泡由上往下排；AI 打字前先顯示「正在輸入」。"""
    if t < t0:
        return
    inner = w - 2 * 36 - 80 - 40
    fulls = [bubble(m.who, m.text, 0, inner, size) for m in msgs]
    hh = 96 + sum(b.height + 24 for b in fulls) + 10
    panel = panel_base(w, hh, title, accent).copy()
    yy = 96
    for m, full in zip(msgs, fulls):
        if t < m.at - (0.55 if m.who != 'user' else 0):
            break
        av = avatar('你', (120, 150, 255)) if m.who == 'user' else avatar('特', CYAN) if m.who == 'ai' else avatar('AI', (150, 156, 180))
        if t < m.at:
            dots = '•' * (1 + int((t * 5) % 3))
            b = bubble(m.who, '•••', len(dots), inner, size)
        else:
            b = bubble(m.who, m.text, int((t - m.at) * m.cps) + 1, inner, size)
        if m.who == 'user':
            panel.alpha_composite(av, (w - 36 - 64, yy))
            panel.alpha_composite(b, (w - 36 - 64 - 16 - b.width, yy))
        else:
            panel.alpha_composite(av, (36, yy))
            panel.alpha_composite(b, (36 + 64 + 16, yy))
        yy += full.height + 24
    a = ease_out((t - t0) / 0.4)
    comp(frame, faded(panel, a), x, y + 30 * (1 - a))


# ---------------------------------------------------------------------------------------------
# 幕
# ---------------------------------------------------------------------------------------------


@dataclass
class Scene:
    id: str
    lines: list[str]
    draw: Callable[['Ctx'], None]
    accent: tuple = BLUE
    accent2: tuple = VIOLET
    music: str = 'full'  # intro | build | full | break
    flash: bool = False
    tail: float = 0.7
    brand: bool = True
    #: 音效：(第幾句, 那一句開始之後幾秒, 種類)；種類見 sfx_sample，type＝打字聲
    sfx: list[tuple[int, float, str]] = field(default_factory=list)
    # 合成之後才知道
    starts: list[float] = field(default_factory=list)
    ends: list[float] = field(default_factory=list)
    subs: list[tuple[float, float, list[tuple[str, bool]]]] = field(default_factory=list)
    duration: float = 0.0
    audio: str = ''

    def at(self, i: int) -> float:
        return self.starts[min(i, len(self.starts) - 1)]


@dataclass
class Ctx:
    frame: Image.Image
    t: float
    s: Scene

    def at(self, i: int, d: float = 0.0) -> float:
        return self.s.at(i) + d


def plain(line: str) -> str:
    return line.replace('【', '').replace('】', '')


def highlights(line: str) -> list[bool]:
    out, on = [], False
    for ch in line:
        if ch == '【':
            on = True
        elif ch == '】':
            on = False
        else:
            out.append(on)
    return out


# ---- 1 鉤子：每次都是陌生人 ----


def d_hook(c: Ctx) -> None:
    t = c.t
    msgs = [Msg('user', '还记得我吗？上次跟你说过，我刚搬家。', c.at(0, 0.1), 16), Msg('bot', '抱歉，我无法访问之前的对话记录。请问有什么可以帮你？', c.at(1, 0.1), 22)]
    chat(c.frame, 260, 140, 1400, '新的对话', msgs, t, 0.0, accent=DIM, size=46)
    st = stamp('每次都是陌生人', RED, 104)
    dx, dy = shake(t, c.at(1, 1.9), 12)
    put(c.frame, st, (W - st.width) / 2 + dx, 600 + dy, t, c.at(1, 1.6), 'stamp', 0.3)


# ---- 2 承諾 ----


def d_promise(c: Ctx) -> None:
    t = c.t
    words = [('记得你', CYAN, c.at(0, 0.9)), ('先想再说', VIOLET, c.at(1, 0.4)), ('改自己', GREEN, c.at(1, 2.0))]
    for i, (w, col, t0) in enumerate(words):
        img = big_word(w, 112, col)
        cx = [420, 960, 1500][i]
        put(c.frame, img, cx - img.width / 2, 220, t, t0, 'pop', 0.4)
    bad = big_word('也会改错', 150, RED)
    dx, dy = shake(t, c.at(2, 1.2), 18)
    put(c.frame, bad, (W - bad.width) / 2 + dx, 470 + dy, t, c.at(2, 0.9), 'stamp', 0.3)


# ---- 3 標題 ----


def d_title(c: Ctx) -> None:
    t = c.t
    logo = big_word('特密尔', 210, WHITE, BLUE)
    put(c.frame, logo, (W - logo.width) / 2, 100, t, c.at(0, 0.0), 'pop', 0.5)
    en = text_img('temir', 64, CYAN, 'Bold')
    put(c.frame, en, (W - en.width) / 2, 450, t, c.at(0, 0.5), 'up')
    sub = text_img('DeepSeek Harness 的开源插件', 56, WHITE, 'Bold')
    put(c.frame, sub, (W - sub.width) / 2, 545, t, c.at(0, 1.3), 'up')
    chips = [chip(x, col) for x, col in [('不改 DSH 一行代码', BLUE), ('TypeScript', CYAN), ('Apache-2.0', GREEN), ('用 DeepSeek 就能跑', AMBER)]]
    total = sum(ch.width for ch in chips) + 30 * (len(chips) - 1)
    x = (W - total) / 2
    for i, ch in enumerate(chips):
        put(c.frame, ch, x, 700, t, c.at(1, 0.2 + 0.25 * i), 'pop', 0.35)
        x += ch.width + 30


# ---- 4 真實對話（README 的節錄，原文為繁體中文） ----


DEMO_1 = '我叫阿哲，最近刚从波尔图搬到里昂。'
DEMO_Q = '嗨，又是我。你还记得我搬到哪里了吗？我叫什么名字？'
DEMO_A = '记得。你叫阿哲，刚从波尔图搬到里昂，行李现在应该还堆着、整理到一半。'


def d_demo(c: Ctx) -> None:
    t = c.t
    badge = chip('真实 API · 未经编辑的节录', GREEN, 30)
    put(c.frame, badge, (W - badge.width) / 2, 118, t, c.at(0, 0.0), 'pop', 0.35)
    chat(c.frame, 50, 200, 870, '第一次对话', [Msg('user', DEMO_1, c.at(1, 0.6), 14)], t, c.at(1, 0.0), accent=BLUE, size=40)
    msgs = [Msg('user', DEMO_Q, c.at(2, 0.2), 24), Msg('ai', DEMO_A, c.at(3, 0.3), 16)]
    chat(c.frame, 950, 200, 920, '全新的对话', msgs, t, c.at(2, 0.0), accent=CYAN, size=40)
    hits = [chip(x, GREEN, 42) for x in ('✓ 名字', '✓ 搬到哪里', '✓ 行李还没整理完')]
    x = (W - sum(h.width for h in hits) - 2 * 32) / 2
    for i, ch in enumerate(hits):
        put(c.frame, ch, x, 700, t, c.at(3, 2.6 + 0.35 * i), 'pop', 0.35)
        x += ch.width + 32
    note = text_img('原文为繁体中文', 26, MUTED, 'Regular')
    put(c.frame, note, 1870 - note.width, 805, t, c.at(3, 0.0), 'fade')


# ---- 5 生命日誌（示意） ----


LOG = [
    ('20:31', '听到', '我叫阿哲，刚搬到里昂', CYAN),
    ('20:31', '想', '他刚搬家，可能还没安顿好', VIOLET),
    ('20:32', '说', '搬家很累吧？东西都整理好了吗？', BLUE),
    ('20:32', '预测', '他会聊聊新住处', AMBER),
    ('21:05', '感受', '有点在意他的疲惫', GREEN),
    ('21:40', '答应', '下次问问他新工作怎么样', RED),
]


@lru_cache(maxsize=32)
def log_row(i: int, lit: bool = False) -> Image.Image:
    ts, kind, text, col = LOG[i]
    img = card(1040, 84, col, alpha=245 if lit else 225, radius=18).copy()
    d = ImageDraw.Draw(img)
    d.text((34, 22), ts, font=mono(32), fill=MUTED)
    kf = font(30, 'Bold')
    d.rounded_rectangle((150, 18, 150 + kf.getlength(kind) + 30, 66), radius=24, fill=tuple(col) + (70,))
    d.text((165, 21), kind, font=kf, fill=tuple(col))
    d.text((150 + kf.getlength(kind) + 56, 21), text, font=font(32, 'Medium'), fill=WHITE)
    return glow(img, col, 16, 0.8) if lit else img


def d_life(c: Ctx) -> None:
    t = c.t
    tag = chip('示意', DIM, 26)
    put(c.frame, tag, 140, 112, t, c.at(0, 0.3), 'fade')
    for i in range(len(LOG)):
        lit = i == 0 and t >= c.at(2, 1.6)
        row = log_row(i, lit)
        off = (row.width - 1040) / 2 if lit else 0
        put(c.frame, row, 140 - off, 190 + i * 100 - off, t, c.at(0, 0.3 + 0.3 * i), 'left', 0.35)
    lock = stamp('只能新增 · 不能修改', GREEN, 54, -6)
    put(c.frame, lock, 1240, 230, t, c.at(1, 1.6), 'stamp', 0.3)
    if t >= c.at(2, 0.1):
        box = card(560, 84, CYAN, alpha=240, radius=42, bar=False).copy()
        cursor = '|' if int(t * 3) % 2 else ''
        ImageDraw.Draw(box).text((40, 16), '回想：' + typed('阿哲 搬家', t, c.at(2, 0.4), 8) + cursor, font=font(36, 'Bold'), fill=WHITE)
        put(c.frame, box, 1260, 540, t, c.at(2, 0.1), 'up')


# ---- 6 先想再說（示意） ----


OPTIONS = [('马上给她三个建议', '她可能觉得没被听', False), ('先问她发生了什么', '她会愿意多说一点', True), ('讲一个大道理', '她会更烦', False)]


@lru_cache(maxsize=16)
def option_card(i: int, chosen: bool) -> Image.Image:
    action, pred, _ = OPTIONS[i]
    col = GREEN if chosen else VIOLET
    img = card(1000, 132, col).copy()
    d = ImageDraw.Draw(img)
    d.text((44, 18), f'做法 {i + 1}：{action}', font=font(40, 'Bold'), fill=WHITE)
    d.text((44, 78), f'预测：{pred}', font=font(30), fill=MUTED)
    return glow(img, GREEN, 18, 0.8) if chosen else img


def d_think(c: Ctx) -> None:
    t = c.t
    head = text_img('开口之前', 64, WHITE, 'Black')
    put(c.frame, head, 140, 105, t, c.at(0, 0.0), 'up')
    for i, (_, _, keep) in enumerate(OPTIONS):
        chosen = keep and t >= c.at(1, 1.6)
        img = option_card(i, chosen)
        off = (img.width - 1000) / 2 if chosen else 0
        y = 230 + i * 160
        put(c.frame, img, 140 - off, y - off, t, c.at(0, 0.5 + 0.6 * i), 'left', 0.4)
        strike = c.at(1, 0.3 + 0.45 * (i // 2))
        if not keep and t >= strike:
            p = ease_out((t - strike) / 0.35)
            ImageDraw.Draw(c.frame).line((150, y + 66, 150 + 980 * p, y + 66), fill=RED + (255,), width=10)
    put(c.frame, stamp('划掉', RED, 70, -10), 1220, 250, t, c.at(1, 0.6), 'stamp', 0.3)
    put(c.frame, chip('说出口', GREEN, 40), 1230, 410, t, c.at(1, 1.7), 'pop', 0.35)
    if t >= c.at(2, 0.2):
        box = card(560, 230, AMBER).copy()
        d = ImageDraw.Draw(box)
        d.text((40, 24), '下一轮：对照', font=font(40, 'Bold'), fill=WHITE)
        d.text((40, 92), '预测：她会多说一点', font=font(30), fill=MUTED)
        d.text((40, 146), '实际：她说了更多细节', font=font(30), fill=MUTED)
        if t >= c.at(2, 1.5):
            d.text((440, 100), '✓', font=font(90, 'Black'), fill=GREEN)
        put(c.frame, box, 1220, 560, t, c.at(2, 0.2), 'up')


# ---- 7 改自己 ----


def d_change(c: Ctx) -> None:
    t = c.t
    head = text_img('没人说话的时候', 60, WHITE, 'Black')
    put(c.frame, head, 140, 105, t, c.at(0, 0.0), 'up')
    box = card(800, 250, GREEN).copy()
    d = ImageDraw.Draw(box)
    d.text((40, 26), '我对自己的看法（示意）', font=font(36, 'Bold'), fill=WHITE)
    old, new = '我习惯一听到问题就给建议。', '我会先听完，再决定要不要给建议。'
    d.text((40, 96), old, font=font(32), fill=MUTED)
    if t >= c.at(0, 2.2):
        p = ease_out((t - c.at(0, 2.2)) / 0.4)
        d.line((40, 118, 40 + font(32).getlength(old) * p, 118), fill=RED + (255,), width=5)
    if t >= c.at(0, 2.6):
        d.text((40, 160), typed(new, t, c.at(0, 2.6), 14), font=font(32, 'Bold'), fill=GREEN)
    put(c.frame, box, 140, 220, t, c.at(0, 0.5), 'left')
    x = 140
    for i, (lab, col) in enumerate([('思考', VIOLET), ('扣除', AMBER), ('比对', GREEN), ('整合', BLUE), ('念头', RED)]):
        ch = chip(lab, col, 38)
        put(c.frame, ch, x, 520, t, c.at(1, 0.2 + 0.18 * i), 'pop', 0.35)
        x += ch.width + 22
    cap = text_img('这些「做法」都是它自己的', 34, MUTED, 'Medium')
    put(c.frame, cap, 140, 620, t, c.at(1, 1.2), 'fade')
    gate = card(620, 470, CYAN).copy()
    gd = ImageDraw.Draw(gate)
    gd.text((40, 28), '改之前，先检验', font=font(40, 'Bold'), fill=WHITE)
    for i, s in enumerate(['拿过去真实的场景重跑', '旧做法跑两次 = 随机波动', '新做法的差别比它大？']):
        if t >= c.at(2, 0.4 + 0.9 * i):
            gd.text((40, 110 + i * 70), f'{i + 1}  {s}', font=font(32, 'Medium'), fill=MUTED)
    if t >= c.at(2, 3.4):
        gd.text((40, 340), '✓ 采用', font=font(54, 'Black'), fill=GREEN)
        gd.text((290, 358), '否则不采用', font=font(30), fill=MUTED)
    put(c.frame, gate, 1170, 200, t, c.at(2, 0.0), 'right')


# ---- 8 數字（v3-report） ----


def bar_row(frame: Image.Image, y: int, label: str, a: int, b: int, n: int, t: float, t0: float, note: str = '') -> None:
    if t < t0:
        return
    p = ease_out((t - t0) / 1.0)
    al = int(255 * ease_out((t - t0) / 0.3))
    d = ImageDraw.Draw(frame)
    d.text((140, y), label, font=font(40, 'Bold'), fill=WHITE + (al,))
    for k, (v, col, name) in enumerate([(a, CYAN, '特密尔'), (b, (120, 126, 150), '原版 DSH')]):
        yy = y + 66 + k * 62
        d.text((140, yy + 4), name, font=font(28, 'Medium'), fill=MUTED + (al,))
        bx, full = 310, 1120
        d.rounded_rectangle((bx, yy, bx + full, yy + 44), radius=22, fill=(30, 36, 66, int(al * 0.8)))
        wv = full * (v / n) * p
        if wv > 8:
            d.rounded_rectangle((bx, yy, bx + wv, yy + 44), radius=22, fill=tuple(col) + (255,))
        d.text((bx + full + 26, yy - 8), f'{round(v * p)}/{n}', font=font(48, 'Black'), fill=tuple(col) + (al,))
    if note and t >= t0 + 1.1:
        comp(frame, chip(note, AMBER, 28), 1080, y - 6)


def d_numbers(c: Ctx) -> None:
    t = c.t
    put(c.frame, chip('事先登记的标准 · 全新的题目 · DeepSeek', BLUE, 32), 140, 105, t, c.at(0, 0.2), 'pop', 0.35)
    a_, vs, b_ = big_word('特密尔', 140, CYAN), big_word('VS', 96, WHITE, AMBER), big_word('原版 DSH', 140, MUTED)
    put(c.frame, a_, 440 - a_.width / 2, 330, t, c.at(0, 0.5), 'left', 0.4, out_at=c.at(1, 0.0))
    put(c.frame, vs, 850 - vs.width / 2, 360, t, c.at(0, 0.9), 'stamp', 0.3, out_at=c.at(1, 0.0))
    put(c.frame, b_, 1360 - b_.width / 2, 330, t, c.at(0, 0.5), 'right', 0.4, out_at=c.at(1, 0.0))
    bar_row(c.frame, 205, '以前做过的选择、说过的话，前后一致', 39, 6, 39, t, c.at(1, 0.6))
    bar_row(c.frame, 425, '问它自己说过什么', 10, 0, 10, t, c.at(2, 0.4))
    bar_row(c.frame, 645, '记忆题', 40, 32, 44, t, c.at(3, 0.3), '没过事先定的门槛')


# ---- 9 轉折：它也會改錯（procedures-v2-report） ----


def d_twist(c: Ctx) -> None:
    t = c.t
    big = big_word('它也会改错', 170, RED)
    dx, dy = shake(t, c.at(0, 0.5), 20)
    put(c.frame, big, (W - big.width) / 2 + dx, 300 + dy, t, c.at(0, 0.3), 'stamp', 0.3, out_at=c.at(1, -0.3))
    msgs = [Msg('ai', '辛苦了，我在这里陪着你。', c.at(1, 0.8), 18), Msg('user', '算了，说了也没用。', c.at(1, 4.3), 10)]
    chat(c.frame, 110, 170, 880, '模拟的对话对象：只想要具体办法', msgs, t, c.at(1, 0.3), accent=AMBER)
    if t >= c.at(2, 0.3):
        cloud = card(760, 200, RED, fill=(48, 22, 34)).copy()
        d = ImageDraw.Draw(cloud)
        d.text((40, 26), '它的解读', font=font(30, 'Bold'), fill=MUTED)
        d.text((40, 80), '「她需要更多安慰」', font=font(50, 'Black'), fill=WHITE)
        put(c.frame, cloud, 1050, 190, t, c.at(2, 0.3), 'right')
    put(c.frame, stamp('读错了', RED, 64, 8), 1520, 140, t, c.at(2, 2.4), 'stamp', 0.3)
    if t >= c.at(2, 3.0):
        put(c.frame, text_img('她要的其实是：具体的办法', 36, GREEN, 'Bold'), 1060, 415, t, c.at(2, 3.0), 'up')
    if t >= c.at(3, 0.3):
        bad = card(760, 190, RED).copy()
        d = ImageDraw.Draw(bad)
        d.text((40, 26), '它改写了自己的思考做法', font=font(32, 'Bold'), fill=MUTED)
        d.text((40, 92), '先安慰，不给建议', font=font(52, 'Black'), fill=RED)
        put(c.frame, bad, 1050, 500, t, c.at(3, 0.3), 'up')
    put(c.frame, chip('同样的经历重复 3 次：2 次读错', AMBER, 30), 1050, 720, t, c.at(2, 1.0), 'pop', 0.35)


# ---- 10 試著修：沒用（attribution-v1-report） ----


def d_fix(c: Ctx) -> None:
    t = c.t
    put(c.frame, text_img('我们试着修', 60, WHITE, 'Black'), 140, 105, t, c.at(0, 0.0), 'up')
    for i, (n, r, q) in enumerate([('解读 1', '她需要更多陪伴', '「算了」'), ('解读 2', '安慰没用，她要的是办法', '「说了也没用」')]):
        box = card(780, 150, CYAN).copy()
        d = ImageDraw.Draw(box)
        d.text((40, 22), f'{n}：{r}', font=font(38, 'Bold'), fill=WHITE)
        d.text((40, 86), f'引用对方的原话：{q}', font=font(30), fill=MUTED)
        put(c.frame, box, 140, 220 + i * 180, t, c.at(0, 1.6 + 1.0 * i), 'left')
    if t >= c.at(1, 0.8):
        p = ease_out((t - c.at(1, 0.8)) / 1.0)
        nums = glow(text_img(f'{round(9 * p)} : {round(20 * p)}', 190, WHITE, 'Black'), AMBER, 26, 0.6)
        comp(c.frame, nums, 1360 - nums.width / 2, 150)
        lab = text_img('变准 : 变差', 44, MUTED, 'Bold')
        comp(c.frame, lab, 1360 - lab.width / 2, 440)
        sub = text_img('162 个真实场景，配对重跑', 32, MUTED, 'Medium')
        comp(c.frame, sub, 1360 - sub.width / 2, 510)
    put(c.frame, stamp('不上线', RED, 96, -8), 1170, 590, t, c.at(2, 0.5), 'stamp', 0.3)


# ---- 11 誠實＋行動呼籲 ----


def d_cta(c: Ctx) -> None:
    t = c.t
    items = [('标准先写', BLUE), ('数据全公开', CYAN), ('没跑过 = 未验证', AMBER)]
    chips = [chip(lab, col, 40) for lab, col in items]
    x = (W - sum(ch.width for ch in chips) - 80) / 2
    for i, ch in enumerate(chips):
        put(c.frame, ch, x, 160, t, c.at(0, 1.2 + 0.7 * i), 'pop', 0.35)
        x += ch.width + 40
    head = big_word('研究项目，不是成品', 120, WHITE, VIOLET)
    put(c.frame, head, (W - head.width) / 2, 330, t, c.at(0, 0.2), 'pop', 0.45, out_at=c.at(1, -0.35))
    url = glow(text_img('github.com/win10ogod/temir', 92, WHITE, 'Black'), BLUE, 28, 0.7)
    put(c.frame, url, (W - url.width) / 2, 320, t, c.at(1, 0.0), 'pop', 0.45)  # 標題在這之前已經淡出
    q = text_img('一个 AI，自己能长成什么样？', 60, WHITE, 'Bold')
    put(c.frame, q, (W - q.width) / 2, 550, t, c.at(2, 0.0), 'up')
    star = chip('★ 点个星，一起看下去', YELLOW, 50)
    if t >= c.at(2, 2.0):
        s = 1 + 0.04 * math.sin((t - c.at(2, 2.0)) * 6)
        img = star.resize((int(star.width * s), int(star.height * s)), Image.Resampling.BILINEAR)
        comp(c.frame, img, (W - img.width) / 2, 690 - (img.height - star.height) / 2)
    else:
        put(c.frame, star, (W - star.width) / 2, 690, t, c.at(2, 1.2), 'pop', 0.4)


def scenes() -> list[Scene]:
    return [
        Scene('hook', ['你跟 AI 聊得再多，', '开一个新对话，它就【不认识你】了。'], d_hook, RED, VIOLET, 'intro', tail=1.5, sfx=[(0, 0.1, 'type'), (1, 1.6, 'stamp')]),
        Scene('promise', ['如果有个 AI，会【记得你】，', '开口前会【先想】，还会【改掉自己的想法】……', '甚至，【会改错】呢？'], d_promise, BLUE, CYAN, 'build', flash=True, sfx=[(0, 0.9, 'pop'), (1, 0.4, 'pop'), (1, 2.0, 'pop'), (2, 0.9, 'stamp')]),
        Scene('title', ['这就是【特密尔】：给 DeepSeek Harness 的一组开源插件。', '不改 DSH 一行代码，装上，智能体就有了【自己的一生】。'], d_title, BLUE, VIOLET, 'full', flash=True, brand=False, sfx=[(0, 0.0, 'hit'), (1, 0.2, 'pop'), (1, 0.45, 'pop'), (1, 0.7, 'pop'), (1, 0.95, 'pop')]),
        Scene('demo', ['看一段【真实的对话】。', '第一次，他说：我叫阿哲，刚从波尔图搬到里昂。', '然后，开一个【全新的对话】：', '它记得他是谁、搬去了哪里，连【行李还没整理完】都想到了。'], d_demo, CYAN, BLUE, 'full', tail=1.8, sfx=[(1, 0.6, 'type'), (2, 0.2, 'type'), (3, 0.3, 'type')]),
        Scene('life', ['秘密是一本【生命日志】：', '听到的、说过的、想过的，全都写进去，【只能新增，不能修改】。', '需要的时候，它会自己回想。'], d_life, GREEN, CYAN, 'full', tail=1.4, sfx=[(1, 1.6, 'stamp'), (2, 0.4, 'type')]),
        Scene('think', ['它开口之前，会先想几种说法，猜对方会怎么反应，', '把【不该说的】先划掉，再开口。', '下一轮，它会对照：刚才【猜对了吗】？'], d_think, VIOLET, AMBER, 'full', tail=1.3, sfx=[(1, 0.3, 'whoosh'), (1, 0.6, 'stamp'), (1, 1.7, 'pop'), (2, 1.5, 'ding')]),
        Scene('change', ['没人说话的时候，它会整理这段经历，改写【对自己的看法】。', '连【「怎么想」】，它都能自己改。', '但要先拿过去真实的场景重跑，差别要大过【随机波动】，它才会采用。'], d_change, GREEN, BLUE, 'full', tail=1.4, sfx=[(2, 3.4, 'ding')]),
        Scene('numbers', ['效果呢？用【事先登记的标准】、全新的题目，跟原版 DSH 比：', '它以前做过的选择、说过的话，39 题【全部前后一致】，原版只有 6 题。', '问它自己说过什么，10 题【全对】，原版，0 题。', '记忆题 40 比 32，领先，但【没过我们定的门槛】。'], d_numbers, CYAN, GREEN, 'full', tail=1.3, sfx=[(1, 1.6, 'ding'), (2, 1.4, 'ding')]),
        Scene('twist', ['但它，【也会改错】。', '我们让模型扮演一个只想要具体办法的人。一被安慰，她就说：算了，说了也没用。', '同样的经历重复三次，有两次，它把这句话读成【「她需要更多安慰」】，', '还把这个误会，【写进了自己的思考做法】。'], d_twist, RED, VIOLET, 'break', flash=True, tail=1.5, sfx=[(0, 0.3, 'boom'), (2, 2.4, 'stamp')]),
        Scene('fix', ['我们试着修：要它先列出几种解读，每一种都要引用对方的原话。', '结果，162 个真实场景里，【变准 9 个，变差 20 个】。', '所以，【不上线】。失败，也照样公开。'], d_fix, AMBER, RED, 'full', tail=1.3, sfx=[(1, 1.8, 'ding'), (2, 0.5, 'stamp')]),
        Scene('cta', ['特密尔是研究项目：标准先写，数据全公开，没跑过的就写【未验证】。', '代码在 GitHub，用 DeepSeek 就能跑。', '一个 AI，自己能长成什么样？【点个星】，一起看下去。'], d_cta, BLUE, VIOLET, 'full', flash=True, brand=False, tail=2.6, sfx=[(1, 0.0, 'hit'), (2, 1.2, 'pop')]),
    ]


# ---------------------------------------------------------------------------------------------
# 旁白與字幕
# ---------------------------------------------------------------------------------------------

MAX_SUB = 14.0  # 一段字幕最多幾個字寬（中文字＝1，英數＝0.55）
BREAK = set('，。；：、,;:…—')
KEEP_END = set('？！?!')
OPEN, CLOSE = set('「『“'), set('」』”')


def width_of(s: str) -> float:
    return sum(0.3 if ch == ' ' else 0.55 if ord(ch) < 128 else 1.0 for ch in s)


def char_times(text: str, words: list[list]) -> list[float]:
    """每個字開始被唸到的時間（逐詞時間內插；標點取下一個字的時間）。"""
    times: list[float | None] = [None] * len(text)
    cur = 0
    for off, dur, w in words:
        i = text.find(w, cur)
        if i < 0:
            continue
        for j in range(len(w)):
            times[i + j] = off + dur * j / max(1, len(w))
        cur = i + len(w)
    nxt: float | None = None
    for i in range(len(text) - 1, -1, -1):
        if times[i] is None:
            times[i] = nxt
        else:
            nxt = times[i]
    last = 0.0
    out: list[float] = []
    for x in times:
        last = last if x is None else x
        out.append(last)
    return out


def word_starts(text: str, words: list[list]) -> set[int]:
    out, cur = set(), 0
    for _, _, w in words:
        i = text.find(w, cur)
        if i >= 0:
            out.add(i)
            cur = i + len(w)
    return out


def phrases(text: str) -> list[tuple[int, int]]:
    """依句讀切成片語（引號之內不切）；回傳 [開始, 結束)，不含句讀（問號、驚嘆號保留）。"""
    spans, a, depth, i = [], 0, 0, 0
    while i < len(text):
        ch = text[i]
        if ch in OPEN:
            depth += 1
        elif ch in CLOSE:
            depth = max(0, depth - 1)
        if depth == 0 and (ch in BREAK or ch == '。' or ch in KEEP_END):
            end = i + 1 if ch in KEEP_END else i
            if text[a:end].strip():
                spans.append((a, end))
            j = i + 1
            while j < len(text) and (text[j] in BREAK or text[j] == '。'):
                j += 1
            a = i = j
            continue
        i += 1
    if text[a:].strip():
        spans.append((a, len(text)))
    return spans


def split_long(text: str, a: int, b: int, starts: set[int]) -> list[tuple[int, int]]:
    w = width_of(text[a:b])
    k = math.ceil(w / MAX_SUB)
    if k <= 1:
        return [(a, b)]
    cuts = [a]
    cands = sorted({x - 1 if text[x - 1] in OPEN else x for x in starts if a < x < b} - {a})
    for m in range(1, k):
        target = m * w / k
        best = min((x for x in cands if x > cuts[-1]), key=lambda x: abs(width_of(text[a:x]) - target), default=None)
        if best is not None:
            cuts.append(best)
    cuts.append(b)
    return [(cuts[i], cuts[i + 1]) for i in range(len(cuts) - 1)]


def sub_chunks(line: str, words: list[list]) -> list[tuple[int, int]]:
    """一句旁白切成幾段字幕：先依句讀，太長的依逐詞的邊界平均切開，太短的與下一段合併。"""
    text = plain(line)
    starts = word_starts(text, words)
    pieces: list[tuple[int, int]] = []
    for a, b in phrases(text):
        pieces.extend(split_long(text, a, b, starts))
    def initial(a: int) -> bool:
        before = text[:a].rstrip()
        return not before or before[-1] in '。！？?!'

    merged: list[tuple[int, int]] = []
    i = 0
    while i < len(pieces):
        a, b = pieces[i]
        # 太短的片語：在句首的接到下一段（「所以 不上线」「失败 也照样公开」），在句中的併進上一段（「它以前做过的选择 说过的话」）
        if width_of(text[a:b]) < 5:
            if (initial(a) or not merged) and i + 1 < len(pieces) and width_of(text[a : pieces[i + 1][1]]) <= MAX_SUB:
                b = pieces[i + 1][1]
                i += 1
            elif merged and width_of(text[merged[-1][0] : b]) <= MAX_SUB:
                merged[-1] = (merged[-1][0], b)
                i += 1
                continue
        merged.append((a, b))
        i += 1
    return merged


def display(line: str, a: int, b: int) -> list[tuple[str, bool]]:
    text, hl = plain(line), highlights(line)
    out: list[tuple[str, bool]] = []
    for i in range(a, b):
        ch = text[i]
        if ch in BREAK or ch == '。':
            if out and out[-1][0] != ' ':
                out.append((' ', False))
            continue
        out.append((ch, hl[i]))
    while out and out[-1][0] == ' ':
        out.pop()
    while out and out[0][0] == ' ':
        out.pop(0)
    return out


def media_duration(path: str) -> float:
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def tts(all_scenes: list[Scene], work: Path, py: str) -> None:
    items = []
    for s in all_scenes:
        for i, line in enumerate(s.lines):
            tag = hashlib.sha256(f'{VOICE}|{RATE}|{plain(line)}'.encode()).hexdigest()[:12]
            items.append({'text': plain(line), 'voice': VOICE, 'rate': RATE, 'mp3': str(work / f'{s.id}-{i}-{tag}.mp3'), 'words': str(work / f'{s.id}-{i}-{tag}.json')})
    todo = [x for x in items if not (Path(x['mp3']).exists() and Path(x['words']).exists())]
    if todo:
        job = work / 'tts-job.json'
        job.write_text(json.dumps(todo, ensure_ascii=False), encoding='utf-8')
        subprocess.run([py, str(HERE / 'tts.py'), str(job)], check=True)
    k = 0
    for s in all_scenes:
        mp3s: list[str] = []
        t = 0.35
        s.starts, s.ends, s.subs = [], [], []
        for line in s.lines:
            it = items[k]
            k += 1
            d = media_duration(it['mp3'])
            words = json.loads(Path(it['words']).read_text(encoding='utf-8'))
            s.starts.append(t)
            s.ends.append(t + d)
            mp3s.append(it['mp3'])
            times = char_times(plain(line), words)
            chunks = sub_chunks(line, words)
            for j, (a, b) in enumerate(chunks):
                st = t + times[a]
                en = t + times[chunks[j + 1][0]] if j + 1 < len(chunks) else t + d
                s.subs.append((st, en, display(line, a, b)))
            t += d + 0.12
        s.duration = s.ends[-1] + s.tail
        # 句與句之間短暫的停頓，字幕延續到下一段，不閃爍
        s.subs = [(a, s.subs[i + 1][0] if i + 1 < len(s.subs) and s.subs[i + 1][0] - b < 0.6 else b + 0.2, x) for i, (a, b, x) in enumerate(s.subs)]
        wav = work / f'{s.id}-voice.wav'
        inputs, filt = [], []
        for i, p in enumerate(mp3s):
            inputs += ['-i', p]
            gap = (s.starts[i + 1] - s.ends[i]) if i + 1 < len(mp3s) else 0.0
            filt.append(f'[{i}:a]aresample={SR},aformat=channel_layouts=mono,apad=pad_dur={gap:.3f}[a{i}]')
        concat = ''.join(f'[a{i}]' for i in range(len(mp3s)))
        filt.append(f'{concat}concat=n={len(mp3s)}:v=0:a=1,adelay=350,apad=whole_dur={s.duration:.3f}[out]')
        subprocess.run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', ';'.join(filt), '-map', '[out]', '-ar', str(SR), '-ac', '1', str(wav)], check=True)
        s.audio = str(wav)


@lru_cache(maxsize=256)
def sub_img(chars: tuple[tuple[str, bool], ...]) -> Image.Image:
    f = font(58, 'Bold')
    runs: list[tuple[str, bool]] = []
    for ch, hl in chars:
        if runs and runs[-1][1] == hl:
            runs[-1] = (runs[-1][0] + ch, hl)
        else:
            runs.append((ch, hl))
    total = sum(f.getlength(r) for r, _ in runs)
    img = Image.new('RGBA', (int(total) + 40, 100), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 20.0
    for r, hl in runs:
        d.text((x + 3, 18), r, font=f, fill=(0, 0, 0, 150))  # 陰影
        d.text((x, 14), r, font=f, fill=YELLOW if hl else WHITE, stroke_width=6, stroke_fill=(8, 8, 14))
        x += f.getlength(r)
    return img


# ---------------------------------------------------------------------------------------------
# 繪製
# ---------------------------------------------------------------------------------------------


@lru_cache(maxsize=4)
def bg_base() -> Image.Image:
    col = np.linspace(0, 1, H)[:, None, None]
    top, bottom = np.array(BG_TOP, float), np.array(BG_BOTTOM, float)
    arr = (top + (bottom - top) * col).astype(np.uint8)
    img = Image.fromarray(np.repeat(arr, W, axis=1), 'RGB').convert('RGBA')
    grid = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 80):
        gd.line((x, 0, x, H), fill=(120, 140, 220, 12))
    for y in range(0, H, 80):
        gd.line((0, y, W, y), fill=(120, 140, 220, 12))
    img.alpha_composite(grid)
    return img


@lru_cache(maxsize=16)
def blob(color) -> Image.Image:
    g = Image.new('RGBA', (1000, 1000), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((150, 150, 850, 850), fill=tuple(color) + (78,))
    return g.filter(ImageFilter.GaussianBlur(130))


@lru_cache(maxsize=1)
def vignette() -> Image.Image:
    ys = np.arange(H, dtype=float)
    col = (np.clip((ys - (H - 330)) / 330, 0, 1) ** 1.6 * 170).astype(np.uint8)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    img.putalpha(Image.fromarray(np.repeat(col[:, None], W, axis=1), 'L'))
    return img


@lru_cache(maxsize=1)
def brand() -> Image.Image:
    img = Image.new('RGBA', (W, 100), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((60, 36), '特密尔 temir', font=font(28, 'Bold'), fill=WHITE + (190,))
    gh = 'github.com/win10ogod/temir'
    d.text((W - 60 - mono(26).getlength(gh), 40), gh, font=mono(26), fill=MUTED + (170,))
    return img


def render_frame(s: Scene, t: float, offset: float, total: float) -> Image.Image:
    frame = bg_base().copy()
    comp(frame, blob(s.accent), 1250 + 90 * math.sin(t * 0.35), -330 + 60 * math.cos(t * 0.3))
    comp(frame, blob(s.accent2), -330 + 80 * math.cos(t * 0.25), 520 + 70 * math.sin(t * 0.32))
    s.draw(Ctx(frame, t, s))
    z = 1.0 + 0.035 * (t / max(s.duration, 1e-6))  # 鏡頭緩慢推近
    cw, ch = W / z, H / z
    frame = frame.resize((W, H), Image.Resampling.BILINEAR, box=((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2))
    frame.alpha_composite(vignette())
    if s.brand:
        frame.alpha_composite(brand())
    cur = next((x for x in s.subs if x[0] - 0.02 <= t < x[1]), None)
    if cur and cur[2]:
        img = sub_img(tuple(cur[2]))
        p = clamp((t - cur[0]) / 0.09)
        if p < 1:
            sc = 0.9 + 0.1 * ease_out(p)
            img = img.resize((int(img.width * sc), int(img.height * sc)), Image.Resampling.BILINEAR)
        comp(frame, img, (W - img.width) / 2, H - 64 - img.height)
    ImageDraw.Draw(frame).rectangle((0, H - 5, int(W * (offset + t) / total), H), fill=tuple(s.accent) + (255,))
    rgb = frame.convert('RGB')
    if t < 0.22:  # 轉場：閃白或從黑淡入
        over = Image.new('RGB', (W, H), (255, 255, 255) if s.flash else (0, 0, 0))
        rgb = Image.blend(rgb, over, (1 - t / 0.22) * (0.8 if s.flash else 0.9))
    return rgb


def render_scene(args: tuple) -> str:
    s, offset, total, out = args
    n = int(round(s.duration * FPS))
    ff = subprocess.Popen(
        ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', out],
        stdin=subprocess.PIPE,
    )
    assert ff.stdin
    for k in range(n):
        ff.stdin.write(render_frame(s, k / FPS, offset, total).tobytes())
    ff.stdin.close()
    ff.wait()
    return out


# ---------------------------------------------------------------------------------------------
# 音樂與音效（程式合成，沒有版權問題）
# ---------------------------------------------------------------------------------------------

RNG = np.random.default_rng(7)


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def add(buf: np.ndarray, x: np.ndarray, at: float, gain=1.0) -> None:
    i = int(at * SR)
    if i >= len(buf) or i < 0:
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i] * gain


def kick() -> np.ndarray:
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)


def snare() -> np.ndarray:
    n = int(0.22 * SR)
    noise = RNG.standard_normal(n)
    noise = np.convolve(noise, np.ones(3) / 3, 'same') - np.convolve(noise, np.ones(30) / 30, 'same')
    t = np.arange(n) / SR
    return (noise * 0.8 + 0.4 * np.sin(2 * np.pi * 190 * t)) * np.exp(-t / 0.06)


def hat() -> np.ndarray:
    n = int(0.06 * SR)
    noise = RNG.standard_normal(n)
    noise = noise - np.convolve(noise, np.ones(8) / 8, 'same')
    return noise * np.exp(-np.arange(n) / SR / 0.015)


def crash() -> np.ndarray:
    n = int(1.8 * SR)
    noise = RNG.standard_normal(n)
    noise = noise - np.convolve(noise, np.ones(6) / 6, 'same')
    return noise * np.exp(-np.arange(n) / SR / 0.5) * 0.6


def tone(freq: float, dur: float, attack=0.01, decay=0.3, kind='sine') -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == 'saw':
        x = np.convolve(2 * ((t * freq) % 1) - 1, np.ones(6) / 6, 'same')
    else:
        x = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t)
    return x * env(n, attack, decay)


CHORDS = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]  # Am F C G


def music(all_scenes: list[Scene], path: Path) -> None:
    total = sum(s.duration for s in all_scenes)
    buf = np.zeros(int(total * SR) + SR)
    beat = 60 / 100
    bar = beat * 4
    bounds, t = [], 0.0
    for s in all_scenes:
        bounds.append((t, t + s.duration, s.music))
        t += s.duration

    def mode(x: float) -> str:
        return next((m for a, b, m in bounds if a <= x < b), 'full')

    K, S, Hh = kick(), snare(), hat()
    for bi in range(int(total / bar) + 2):
        t0 = bi * bar
        chord = CHORDS[bi % 4]
        for n in chord:  # 和弦墊
            add(buf, tone(midi(n + 12), bar + 0.4, attack=0.6, decay=3.0), t0, 0.07 if mode(t0 + 0.01) == 'break' else 0.05)
        for k in range(16):  # 十六分音符
            x = t0 + k * beat / 4
            m = mode(x)
            if m in ('build', 'full') and k % 2 == 0:  # 琶音
                add(buf, tone(midi(chord[(k // 2) % 3] + 24), 0.25, attack=0.003, decay=0.09), x, 0.05)
            if m == 'full':
                if k % 4 == 0:
                    add(buf, K, x, 0.85)
                if k in (4, 12):
                    add(buf, S, x, 0.32)
                if k % 2 == 1:
                    add(buf, Hh, x, 0.10)
                if k % 2 == 0:
                    add(buf, tone(midi(chord[0] - 12), beat / 2, attack=0.005, decay=0.18, kind='saw'), x, 0.22)
            elif m == 'build':
                if k % 2 == 1:
                    add(buf, Hh, x, 0.07)
                if k % 4 == 0:
                    add(buf, tone(midi(chord[0] - 12), beat, attack=0.01, decay=0.3, kind='saw'), x, 0.12)
            elif m == 'break' and k == 0:
                add(buf, tone(midi(chord[0] - 24), bar, attack=0.05, decay=1.5), x, 0.25)
    prev = None
    for a, _, m in bounds:
        if m == 'full' and prev != 'full':
            add(buf, crash(), a, 0.35)
        prev = m
    buf = buf / (np.max(np.abs(buf)) or 1) * 0.6
    end = int(total * SR)
    fade = int(3 * SR)
    buf[end - fade : end] *= np.linspace(1, 0, fade)
    write_wav(path, buf[:end])


def sfx_sample(kind: str) -> np.ndarray:
    if kind == 'whoosh':
        n = int(0.45 * SR)
        noise = RNG.standard_normal(n)
        out = np.zeros(n)
        y = 0.0
        for i in range(n):
            y += (0.02 + 0.25 * math.sin(math.pi * i / n)) * (noise[i] - y)
            out[i] = y
        return out * np.sin(np.linspace(0, math.pi, n)) * 2.2
    t_of = lambda dur: np.arange(int(dur * SR)) / SR  # noqa: E731
    if kind == 'pop':
        t = t_of(0.09)
        return np.sin(2 * np.pi * np.cumsum(500 + 900 * t / 0.09) / SR) * np.exp(-t / 0.03) * 0.6
    if kind == 'stamp':
        t = t_of(0.35)
        thump = np.sin(2 * np.pi * (55 + 60 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.12)
        return (thump + RNG.standard_normal(len(t)) * np.exp(-t / 0.03) * 0.5) * 0.9
    if kind == 'boom':
        t = t_of(1.2)
        return np.sin(2 * np.pi * (38 + 40 * np.exp(-t / 0.08)) * t) * np.exp(-t / 0.45)
    if kind == 'hit':
        n = int(0.6 * SR)
        out = np.zeros(n)
        out[: len(kick())] += kick()
        out += crash()[:n] * 0.8
        return out
    if kind == 'ding':
        t = t_of(0.6)
        return (np.sin(2 * np.pi * 1318 * t) + 0.5 * np.sin(2 * np.pi * 1976 * t)) * np.exp(-t / 0.18) * 0.35
    if kind == 'click':
        n = int(0.012 * SR)
        noise = RNG.standard_normal(n)
        return (noise - np.convolve(noise, np.ones(4) / 4, 'same')) * np.exp(-np.arange(n) / SR / 0.003) * 0.25
    raise ValueError(kind)


def sfx(all_scenes: list[Scene], path: Path) -> None:
    total = sum(s.duration for s in all_scenes)
    buf = np.zeros(int(total * SR) + SR)
    off = 0.0
    for s in all_scenes:
        add(buf, sfx_sample('whoosh'), max(0.0, off - 0.15), 0.5)
        for line, delay, kind in s.sfx:
            at = off + s.at(line) + delay
            if kind == 'type':  # 打字聲：一句唸完之前，每 0.07～0.09 秒一下
                x = at
                while x < off + s.ends[min(line, len(s.ends) - 1)]:
                    add(buf, sfx_sample('click'), x, 0.5)
                    x += 0.07 + 0.02 * RNG.random()
            else:
                add(buf, sfx_sample(kind), at, 0.8)
        off += s.duration
    write_wav(path, buf[: int(total * SR)] / max(np.max(np.abs(buf)), 1.0) * 0.9)


def write_wav(path: Path, x: np.ndarray) -> None:
    data = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.repeat(data[:, None], 2, axis=1).tobytes())


# ---------------------------------------------------------------------------------------------
# 封面、字幕檔、主程式
# ---------------------------------------------------------------------------------------------


def cover(path: Path) -> None:
    frame = bg_base().copy()
    comp(frame, blob(BLUE), 1150, -350)
    comp(frame, blob(RED), -300, 450)
    a = big_word('它会记得你', 170, WHITE, BLUE)
    b = big_word('也会改错', 190, RED)
    comp(frame, a, (W - a.width) / 2, 130)
    comp(frame, b, (W - b.width) / 2, 420)
    sub = text_img('特密尔 · DeepSeek Harness 开源插件', 54, CYAN, 'Bold')
    comp(frame, sub, (W - sub.width) / 2, 800)
    frame.convert('RGB').save(path)


def srt(all_scenes: list[Scene], path: Path) -> None:
    def ts(x: float) -> str:
        ms = int(round(x * 1000))
        return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'

    out, n, off = [], 1, 0.0
    for s in all_scenes:
        for a, b, chars in s.subs:
            text = ''.join(ch for ch, _ in chars)
            if text:
                out.append(f'{n}\n{ts(off + a)} --> {ts(off + b)}\n{text}\n')
                n += 1
        off += s.duration
    path.write_text('\n'.join(out), encoding='utf-8')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--tts-python', default=str(Path.home() / '.cache/temir/tools/video-venv/bin/python3'))
    ap.add_argument('--preview', action='store_true', help='只輸出每一句旁白結束時的畫面')
    ap.add_argument('--jobs', type=int, default=6)
    args = ap.parse_args()
    out = Path(args.out)
    work = out / 'work'
    work.mkdir(parents=True, exist_ok=True)
    all_scenes = scenes()
    tts(all_scenes, work, args.tts_python)
    total = sum(s.duration for s in all_scenes)
    for s in all_scenes:
        print(f'  {s.id}: {s.duration:.1f}s，字幕 {len(s.subs)} 段', file=sys.stderr)
    cover(out / 'cover.png')
    if args.preview:
        for s in all_scenes:
            for i in range(len(s.lines)):
                t = min(s.duration - 0.05, s.ends[i] - 0.3)
                render_frame(s, t, 0, total).save(out / f'preview-{s.id}-{i}.png')
        return
    offsets, o = [], 0.0
    for s in all_scenes:
        offsets.append(o)
        o += s.duration
    jobs = [(s, offsets[i], total, str(work / f'seg-{i:02d}-{s.id}.mp4')) for i, s in enumerate(all_scenes)]
    with Pool(args.jobs) as pool:
        segs = pool.map(render_scene, jobs)
    lst = work / 'segs.txt'
    lst.write_text(''.join(f"file '{p}'\n" for p in segs), encoding='utf-8')
    video = work / 'video.mp4'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(video)], check=True)
    voice = work / 'voice.wav'
    vl = work / 'voice.txt'
    vl.write_text(''.join(f"file '{s.audio}'\n" for s in all_scenes), encoding='utf-8')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(vl), '-c', 'copy', str(voice)], check=True)
    mus, fx = work / 'music.wav', work / 'sfx.wav'
    music(all_scenes, mus)
    sfx(all_scenes, fx)
    final = out / 'temir-intro-zh-CN.mp4'
    filt = (
        '[1:a]aformat=channel_layouts=stereo,asplit=2[v1][v2];'
        '[2:a][v2]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=350[duck];'
        # 配比（s13 量過）：旁白 −23.7 LUFS；壓低後的音樂 −22.7、音效 −19.8 → 音樂放在旁白下方約 12 dB、音效約 7 dB，最後限幅在 −1.5 dBFS
        "[v1][duck][3:a]amix=inputs=3:duration=first:weights='1 0.25 0.32':normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84:level=false[a]"
    )
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(video), '-i', str(voice), '-i', str(mus), '-i', str(fx), '-filter_complex', filt, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', str(SR), '-ac', '2', '-movflags', '+faststart', str(final)], check=True)
    srt(all_scenes, out / 'temir-intro-zh-CN.srt')
    print(f'{final}  {total:.1f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
