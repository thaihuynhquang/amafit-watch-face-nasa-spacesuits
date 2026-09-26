import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDistance, formatThousands } from '../watchface/number-format.js'

test('formats distance below 10 with two decimals', () => {
  assert.equal(formatDistance(0), '0.00')
  assert.equal(formatDistance(5.3), '5.30')
  assert.equal(formatDistance(9.994), '9.99')
})

test('formats distance from 10 with one decimal to stay within 4 digits', () => {
  assert.equal(formatDistance(9.996), '10.0')
  assert.equal(formatDistance(12.345), '12.3')
  assert.equal(formatDistance(99.94), '99.9')
})

test('formats distance from 100 as a whole number', () => {
  assert.equal(formatDistance(99.96), '100')
  assert.equal(formatDistance(123.4), '123')
})

test('groups thousands with commas', () => {
  assert.equal(formatThousands(0), '0')
  assert.equal(formatThousands(999), '999')
  assert.equal(formatThousands(8670), '8,670')
  assert.equal(formatThousands(99999), '99,999')
})
