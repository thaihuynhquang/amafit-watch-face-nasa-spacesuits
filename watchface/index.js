import * as hmUI from '@zos/ui'
import { Time, Battery, HeartRate, Step, Distance } from '@zos/sensor'
import { getLanguage, getDistanceUnit, DISTANCE_UNIT_METRIC } from '@zos/settings'
import { formatDate } from './date-format.js'
import { nextChargingState } from './charging.js'

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

// battery.png / battery_charging.png position, printed by
// tools/generate_assets.py as "battery device pos/size".
const BATTERY_X = 87
const BATTERY_Y = 374

const TIME_FONT = 'fonts/Montserrat-SemiBold.ttf'
const TEXT_FONT = 'fonts/Roboto-Medium.ttf'
const WHITE = 0xffffff

const METERS_PER_MILE = 1609.344
const TIME_HOUR_FORMAT_12 = 12

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function formatThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function centeredText(x, centerY, w, h, textSize, font, alignH) {
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
  })
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
    hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: 0, src: 'bg.png' })

    this.timeText = centeredText(0, TIME_CENTER_Y, TIME_RIGHT_X, 130, TIME_TEXT_SIZE, TIME_FONT, hmUI.align.RIGHT)
    this.ampmText = centeredText(AMPM_X, AMPM_CENTER_Y, 70, 50, AMPM_TEXT_SIZE, TIME_FONT, hmUI.align.LEFT)
    this.dateText = centeredText(0, DATE_CENTER_Y, 480, 50, DATE_TEXT_SIZE, TEXT_FONT, hmUI.align.CENTER_H)

    this.heartRateText = centeredText(STAT_TEXT_X_LEFT, STAT_ROW_Y_TOP, 110, 50, STAT_TEXT_SIZE, TEXT_FONT, hmUI.align.LEFT)
    this.stepsText = centeredText(STAT_TEXT_X_RIGHT, STAT_ROW_Y_TOP, 150, 50, STAT_TEXT_SIZE, TEXT_FONT, hmUI.align.LEFT)
    this.batteryText = centeredText(STAT_TEXT_X_LEFT, STAT_ROW_Y_BOTTOM, 110, 50, STAT_TEXT_SIZE, TEXT_FONT, hmUI.align.LEFT)
    this.distanceText = centeredText(STAT_TEXT_X_RIGHT, STAT_ROW_Y_BOTTOM, 150, 50, STAT_TEXT_SIZE, TEXT_FONT, hmUI.align.LEFT)

    this.batteryIcon = hmUI.createWidget(hmUI.widget.IMG, { x: BATTERY_X, y: BATTERY_Y, src: 'battery.png' })
    this.batteryChargingIcon = hmUI.createWidget(hmUI.widget.IMG, { x: BATTERY_X, y: BATTERY_Y, src: 'battery_charging.png' })

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
    this.batteryIcon.setProperty(hmUI.prop.VISIBLE, !this.isCharging)
    this.batteryChargingIcon.setProperty(hmUI.prop.VISIBLE, this.isCharging)
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
    this.distanceText.setProperty(hmUI.prop.TEXT, value.toFixed(2))
  },

  onDestroy() {
    this.timeSensor.offPerMinute(this.onMinute)
    this.battery.offChange(this.onBatteryChange)
    this.step.offChange(this.onStepChange)
    this.distance.offChange(this.onDistanceChange)
  },
})
