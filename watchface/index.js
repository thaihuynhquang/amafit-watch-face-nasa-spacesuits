import hmUI from '@zos/ui'
import { Time, Battery, HeartRate, Step, Distance } from '@zos/sensor'
import { getLanguage, getDistanceUnit, DISTANCE_UNIT_METRIC } from '@zos/settings'
import { formatDate } from './date-format.js'
import { nextChargingState } from './charging.js'
import { formatDistance, formatThousands } from './number-format.js'

// Layout constants, printed by tools/generate_assets.py as
// "watchface/index.js constants" -- re-copy them after regenerating assets.
const POWER_X = 87
const POWER_Y = 374
const STEP_X = 264
const STEP_Y = 300
const TIME_X_12H = 40
const TIME_X_24H = 72
const MINUTE_OFFSET = 182
const TIME_Y = 104
const AMPM_X = 382
const AMPM_Y = 159
const STAT_Y_TOP = 306
const STAT_Y_BOTTOM = 380
const STAT_H = 35
const STAT_X_LEFT = 150
const STAT_X_RIGHT = 319

// The date is the only TEXT widget: it needs letters, and a single
// small-size custom-font TEXT rendered correctly on the Cheetah Pro. Time
// and stat numbers use pre-rendered digit images instead.
const DATE_CENTER_Y = 216
const DATE_TEXT_SIZE = 34
const DATE_FONT = 'fonts/Roboto-Medium.ttf'

const TIME_DIGITS = Array.from({ length: 10 }, (_, i) => `time_${i}.png`)
const STAT_DIGITS = Array.from({ length: 10 }, (_, i) => `font_stat_${i}.png`)

// AOD (screen-off) shows only time, date and steps on black -- the spec's
// priority fields, kept under its 10% lit-pixel limit (checked by
// tools/generate_assets.py). The Zepp OS constant really is spelled ONAL_AOD.
const NORMAL = hmUI.show_level.ONLY_NORMAL
const NORMAL_AND_AOD = hmUI.show_level.ONLY_NORMAL | hmUI.show_level.ONAL_AOD

const METERS_PER_MILE = 1609.344
const TIME_HOUR_FORMAT_12 = 12

// TEXT_IMG draws "." with dot_image and "-" with negative_image; every other
// character must be a digit. The unit image, if set, is appended by the device.
function statText(x, y, w, showLevel, extra = {}) {
  return hmUI.createWidget(hmUI.widget.TEXT_IMG, {
    x,
    y,
    w,
    h: STAT_H,
    font_array: STAT_DIGITS,
    h_space: 0,
    align_h: hmUI.align.LEFT,
    text: '',
    show_level: showLevel,
    ...extra,
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
  },

  build() {
    icon(0, 0, 'bg.png', NORMAL)

    // IMG_TIME is system-driven and shows AM/PM itself in 12h mode. Only its
    // position depends on the format: 12h leaves room for AM/PM on the right,
    // 24h is centered on the dial.
    const is12h = this.timeSensor.getHourFormat() === TIME_HOUR_FORMAT_12
    const timeX = is12h ? TIME_X_12H : TIME_X_24H
    hmUI.createWidget(hmUI.widget.IMG_TIME, {
      hour_zero: 1,
      hour_startX: timeX,
      hour_startY: TIME_Y,
      hour_array: TIME_DIGITS,
      hour_space: 0,
      hour_unit_sc: 'colon.png',
      hour_unit_tc: 'colon.png',
      hour_unit_en: 'colon.png',
      hour_align: hmUI.align.LEFT,
      minute_zero: 1,
      minute_startX: timeX + MINUTE_OFFSET,
      minute_startY: TIME_Y,
      minute_array: TIME_DIGITS,
      minute_space: 0,
      minute_align: hmUI.align.LEFT,
      minute_follow: 0,
      am_x: AMPM_X,
      am_y: AMPM_Y,
      am_sc_path: 'am_en.png',
      am_en_path: 'am_en.png',
      pm_x: AMPM_X,
      pm_y: AMPM_Y,
      pm_sc_path: 'pm_en.png',
      pm_en_path: 'pm_en.png',
      show_level: NORMAL_AND_AOD,
    })

    this.dateText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: DATE_CENTER_Y - 25,
      w: 480,
      h: 50,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.NONE,
      color: 0xffffff,
      text_size: DATE_TEXT_SIZE,
      font: DATE_FONT,
      text: '',
      show_level: NORMAL_AND_AOD,
    })

    this.heartRateText = statText(STAT_X_LEFT, STAT_Y_TOP, 110, NORMAL, { negative_image: 'negative.png' })
    this.stepsText = statText(STAT_X_RIGHT, STAT_Y_TOP, 150, NORMAL_AND_AOD, { dot_image: 'comma.png' })
    this.batteryText = statText(STAT_X_LEFT, STAT_Y_BOTTOM, 110, NORMAL, {
      unit_sc: 'percent.png',
      unit_tc: 'percent.png',
      unit_en: 'percent.png',
    })
    this.distanceText = statText(STAT_X_RIGHT, STAT_Y_BOTTOM, 150, NORMAL, { dot_image: 'dot.png' })

    icon(STEP_X, STEP_Y, 'step.png', NORMAL_AND_AOD)
    this.powerIcon = icon(POWER_X, POWER_Y, 'power.png', NORMAL)
    this.powerChargingIcon = icon(POWER_X, POWER_Y, 'power_charging.png', NORMAL)

    this.onMinute = () => {
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

    this.updateDate()
    this.updateBattery()
    this.updateHeartRate()
    this.updateSteps()
    this.updateDistance()
  },

  updateDate() {
    this.dateText.setProperty(hmUI.prop.TEXT, formatDate(new Date(), this.languageCode))
  },

  updateBattery() {
    const percent = this.battery.getCurrent()
    this.isCharging = nextChargingState(this.lastBatteryPercent, percent, this.isCharging)
    this.lastBatteryPercent = percent

    this.batteryText.setProperty(hmUI.prop.TEXT, String(percent))
    this.powerIcon.setProperty(hmUI.prop.VISIBLE, !this.isCharging)
    this.powerChargingIcon.setProperty(hmUI.prop.VISIBLE, this.isCharging)
  },

  updateHeartRate() {
    const value = this.heartRate.getLast()
    this.heartRateText.setProperty(hmUI.prop.TEXT, value > 0 ? String(value) : '--')
  },

  updateSteps() {
    // "." renders as the comma image (the widget's dot_image).
    this.stepsText.setProperty(hmUI.prop.TEXT, formatThousands(this.step.getCurrent(), '.'))
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
