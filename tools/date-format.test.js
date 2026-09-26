import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDate, LANG_VI } from '../watchface/date-format.js'

const EN = 2 // en-US language code

test('formats English weekday, month, day (no leading zero on day)', () => {
  // Fri Sep 24 2027 (matches the reference mockup)
  assert.equal(formatDate(new Date(2027, 8, 24), EN), 'FRI, SEP 24')
})

test('formats English single-digit day without padding', () => {
  // Sun Sep 5 2027
  assert.equal(formatDate(new Date(2027, 8, 5), EN), 'SUN, SEP 5')
})

test('covers every English weekday abbreviation', () => {
  // 2027-08-30 is a Monday
  const base = new Date(2027, 7, 30)
  const expected = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    assert.equal(formatDate(d, EN).split(',')[0], expected[i])
  }
})

test('formats Vietnamese as "T<n>, DD/MM" with zero-padding', () => {
  // Fri Sep 24 2027 -> T6, 24/09
  assert.equal(formatDate(new Date(2027, 8, 24), LANG_VI), 'T6, 24/09')
})

test('formats Vietnamese single-digit day/month with leading zeros', () => {
  // Sun Jan 3 2027 -> CN, 03/01
  assert.equal(formatDate(new Date(2027, 0, 3), LANG_VI), 'CN, 03/01')
})

test('covers every Vietnamese weekday label, Sunday as CN', () => {
  // 2027-08-30 is a Monday
  const base = new Date(2027, 7, 30)
  const expected = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    assert.equal(formatDate(d, LANG_VI).split(',')[0], expected[i])
  }
})

test('falls back to English for languages other than Vietnamese', () => {
  const RUSSIAN = 4
  assert.equal(formatDate(new Date(2027, 8, 24), RUSSIAN), 'FRI, SEP 24')
})
