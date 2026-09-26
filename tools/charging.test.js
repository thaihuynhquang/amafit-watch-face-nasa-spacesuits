import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextChargingState } from '../watchface/charging.js'

test('starts as not charging when there is no previous reading', () => {
  assert.equal(nextChargingState(null, 50, false), false)
})

test('rising percentage means charging', () => {
  assert.equal(nextChargingState(50, 51, false), true)
})

test('falling percentage means not charging', () => {
  assert.equal(nextChargingState(51, 50, true), false)
})

test('unchanged percentage keeps the previous state', () => {
  assert.equal(nextChargingState(100, 100, true), true)
  assert.equal(nextChargingState(70, 70, false), false)
})
