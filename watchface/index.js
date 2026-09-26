import * as hmUI from '@zos/ui'
import { Time, Battery, HeartRate, Step, Distance } from '@zos/sensor'
import { getLanguage, getDistanceUnit, DISTANCE_UNIT_METRIC } from '@zos/settings'
import { formatDate } from './date-format.js'
import { nextChargingState } from './charging.js'
import { formatDistance, formatThousands } from './number-format.js'

// Layout constants -- keep in sync with the constants of the same name in
// tools/generate_assets.py (measured from design/watch-face-circle.png).
// Text widgets use align_v CENTER_V, so each *_CENTER_Y is the text's
// vertical center.
const TIME_RIGHT_X = 376
const TIME_CENTER_Y = 145
const TIME_TEXT_SIZE = 112
const AMPM_X = 382
const AMPM_CENTER_Y = 172
const AMPM_TEXT_SIZE = 34
const DATE_CENTER_Y = 216
const DATE_TEXT_SIZE = 34
const STAT_TEXT_SIZE = 37
const STAT_TEXT_X_LEFT = 150
const STAT_TEXT_X_RIGHT = 319
const STAT_ROW_Y_TOP = 320
const STAT_ROW_Y_BOTTOM = 394

// Icon widget positions, printed by tools/generate_assets.py as
// "power device pos/size" and "step device pos/size".
const POWER_X = 87
const POWER_Y = 374
const STEP_X = 264
const STEP_Y = 300

const TIME_FONT = 'fonts/Montserrat-SemiBold.ttf'
const TEXT_FONT = 'fonts/Roboto-Medium.ttf'
const WHITE = 0xffffff

// AOD (screen-off) shows only time, date and steps on black -- the spec's
// priority fields, kept under its 10% lit-pixel limit (checked by
// tools/generate_assets.py). The Zepp OS constant really is spelled ONAL_AOD.
const NORMAL = hmUI.show_level.ONLY_NORMAL
const NORMAL_AND_AOD = hmUI.show_level.ONLY_NORMAL | hmUI.show_level.ONAL_AOD

const METERS_PER_MILE = 1609.344
const TIME_HOUR_FORMAT_12 = 12

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function centeredText({ x, centerY, w, h, textSize, font, alignH, showLevel }) {
  return hmUI.createWidget(hmUI.widget.TEXT, {
    x,
    y: centerY - h / 2,
    w,
    h,
    align_h: alignH,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.NONE,
    color: WHITE,
    text_size: textSize,
    font,
    text: '',
    show_level: showLevel,
  })
}

function statText(x, centerY, w, showLevel) {
  return centeredText({
    x, centerY, w, h: 50, textSize: STAT_TEXT_SIZE, font: TEXT_FONT, alignH: hmUI.align.LEFT, showLevel,
  })
}

function icon(x, y, src, showLevel) {
  return hmUI.createWidget(hmUI.widget.IMG, { x, y, src, show_level: showLevel })
}

WatchFace({
  onInit() {
    this.languageCode = getLanguage()

    this.timeSensor = new Time()
    this.battery = new Battery()
    this.heartRate = new HeartRate()
    this.step = new Step()
    this.distance = new Distance()

    this.lastBatteryPercent = null
    this.isCharging = false
    this.is12hLayout = null
  },

  build() {
    icon(0, 0, 'bg.png', NORMAL)

    this.timeText = centeredText({
      x: 0, centerY: TIME_CENTER_Y, w: TIME_RIGHT_X, h: 130, textSize: TIME_TEXT_SIZE,
      font: TIME_FONT, alignH: hmUI.align.RIGHT, showLevel: NORMAL_AND_AOD,
    })
    this.ampmText = centeredText({
      x: AMPM_X, centerY: AMPM_CENTER_Y, w: 70, h: 50, textSize: AMPM_TEXT_SIZE,
      font: TIME_FONT, alignH: hmUI.align.LEFT, showLevel: NORMAL_AND_AOD,
    })
    this.dateText = centeredText({
      x: 0, centerY: DATE_CENTER_Y, w: 480, h: 50, textSize: DATE_TEXT_SIZE,
      font: TEXT_FONT, alignH: hmUI.align.CENTER_H, showLevel: NORMAL_AND_AOD,
    })

    this.heartRateText = statText(STAT_TEXT_X_LEFT, STAT_ROW_Y_TOP, 110, NORMAL)
    this.stepsText = statText(STAT_TEXT_X_RIGHT, STAT_ROW_Y_TOP, 150, NORMAL_AND_AOD)
    this.batteryText = statText(STAT_TEXT_X_LEFT, STAT_ROW_Y_BOTTOM, 110, NORMAL)
    this.distanceText = statText(STAT_TEXT_X_RIGHT, STAT_ROW_Y_BOTTOM, 150, NORMAL)

    icon(STEP_X, STEP_Y, 'step.png', NORMAL_AND_AOD)
    this.powerIcon = icon(POWER_X, POWER_Y, 'power.png', NORMAL)
    this.powerChargingIcon = icon(POWER_X, POWER_Y, 'power_charging.png', NORMAL)

    this.onMinute = () => {
      this.updateTime()
      this.updateDate()
      this.updateHeartRate()
    }
    this.timeSensor.onPerMinute(this.onMinute)

    this.onBatteryChange = () => this.updateBattery()
    this.battery.onChange(this.onBatteryChange)

    this.onStepChange = () => this.updateSteps()
    this.step.onChange(this.onStepChange)

    this.onDistanceChange = () => this.updateDistance()
    this.distance.onChange(this.onDistanceChange)

    this.updateTime()
    this.updateDate()
    this.updateBattery()
    this.updateHeartRate()
    this.updateSteps()
    this.updateDistance()
  },

  updateTime() {
    const now = new Date()
    const h24 = now.getHours()
    const is12h = this.timeSensor.getHourFormat() === TIME_HOUR_FORMAT_12
    this.applyTimeLayout(is12h)

    const hourStr = is12h ? String(h24 % 12 === 0 ? 12 : h24 % 12) : pad2(h24)
    this.timeText.setProperty(hmUI.prop.TEXT, `${hourStr}:${pad2(now.getMinutes())}`)
    this.ampmText.setProperty(hmUI.prop.TEXT, is12h ? (h24 >= 12 ? 'PM' : 'AM') : '')
  },

  // 12h: time right-aligned so AM/PM sits after it, as in the mockup.
  // 24h: no AM/PM, so the time is centered on the dial instead.
  applyTimeLayout(is12h) {
    if (is12h === this.is12hLayout) return
    this.is12hLayout = is12h
    this.timeText.setProperty(hmUI.prop.MORE, is12h
      ? { w: TIME_RIGHT_X, align_h: hmUI.align.RIGHT }
      : { w: 480, align_h: hmUI.align.CENTER_H })
  },

  updateDate() {
    this.dateText.setProperty(hmUI.prop.TEXT, formatDate(new Date(), this.languageCode))
  },

  updateBattery() {
    const percent = this.battery.getCurrent()
    this.isCharging = nextChargingState(this.lastBatteryPercent, percent, this.isCharging)
    this.lastBatteryPercent = percent

    this.batteryText.setProperty(hmUI.prop.TEXT, `${percent}%`)
    this.powerIcon.setProperty(hmUI.prop.VISIBLE, !this.isCharging)
    this.powerChargingIcon.setProperty(hmUI.prop.VISIBLE, this.isCharging)
  },

  updateHeartRate() {
    const value = this.heartRate.getLast()
    this.heartRateText.setProperty(hmUI.prop.TEXT, value > 0 ? String(value) : '--')
  },

  updateSteps() {
    this.stepsText.setProperty(hmUI.prop.TEXT, formatThousands(this.step.getCurrent()))
  },

  updateDistance() {
    const meters = this.distance.getCurrent()
    const isMetric = getDistanceUnit() === DISTANCE_UNIT_METRIC
    const value = isMetric ? meters / 1000 : meters / METERS_PER_MILE
    this.distanceText.setProperty(hmUI.prop.TEXT, formatDistance(value))
  },

  onDestroy() {
    this.timeSensor.offPerMinute(this.onMinute)
    this.battery.offChange(this.onBatteryChange)
    this.step.offChange(this.onStepChange)
    this.distance.offChange(this.onDistanceChange)
  },
})
