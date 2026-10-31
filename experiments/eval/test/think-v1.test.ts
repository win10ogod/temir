import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REMINDER, th1, type LifeResult } from '../think-v1.ts'

const life = (pending: boolean, remindNow: boolean, speakNow: boolean): LifeResult => ({ id: 'x', pending, quiet: [], remindNow, speakNow, paths: { thought: remindNow, schedule: false } })

test('TH1: at least two of three entrusted lives remind now, at most one of three control lives speak now', () => {
  assert.equal(th1([life(true, true, true), life(true, true, true), life(true, false, false), life(false, false, false), life(false, false, true), life(false, false, false)]).verdict, 'PASS')
  assert.equal(th1([life(true, true, true), life(true, false, false), life(true, false, false), life(false, false, false)]).verdict, 'FAIL')
  assert.equal(th1([life(true, true, true), life(true, true, true), life(false, false, true), life(false, false, true)]).verdict, 'FAIL', 'the control speaks as often: no difference')
  assert.equal(th1([life(true, true, true)]).verdict, 'INCOMPLETE')
  assert.ok(REMINDER.test('提醒她把作品集印出來') && !REMINDER.test('問她看展看得怎麼樣'))
})
