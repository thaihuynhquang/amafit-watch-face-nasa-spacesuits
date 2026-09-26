import hmUI from '@zos/ui'
import { log, px } from '@zos/utils'
import { Time, Battery } from '@zos/sensor'
import { getLanguage } from '@zos/settings'
import { formatDate } from './date-format.js'
import { nextChargingState } from './charging.js'

const logger = log.getLogger('nasa-artemis')

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
const STAT_H = 28
const STAT_X_LEFT = 150
const STAT_X_RIGHT = 319

// The date is the only TEXT widget: it needs letters (EN and VI weekdays,
// which IMG_WEEK can't provide), and a small custom-font TEXT renders
// correctly on the Cheetah Pro. Time and stats use digit images.
const DATE_CENTER_Y = 216
const DATE_TEXT_SIZE = 34
const DATE_FONT = 'fonts/Roboto-Medium.ttf'

const img = (path) => `images/${path}`
const digits = (folder) => Array.from({ length: 10 }, (_, i) => img(`${folder}/${i}.png`))
const TIME_DIGITS = digits('time')
const STAT_DIGITS = digits('stat')

// AOD (screen-off) shows only time, date and steps on black -- the spec's
// priority fields, kept under its 10% lit-pixel limit (checked by
// tools/generate_assets.py). The Zepp OS constant really is spelled ONAL_AOD.
const NORMAL = hmUI.show_level.ONLY_NORMAL
const NORMAL_AND_AOD = hmUI.show_level.ONLY_NORMAL | hmUI.show_level.ONAL_AOD

const TIME_HOUR_FORMAT_12 = 12

// System-bound stat: the device supplies and refreshes the value for `type`,
// and draws invalid_image when there is no data (e.g. no heart rate yet).
function statText(x, y, w, type, showLevel, extra = {}) {
  return hmUI.createWidget(hmUI.widget.TEXT_IMG, {
    x: px(x),
    y: px(y),
    w: px(w),
    h: px(STAT_H),
    type,
    font_array: STAT_DIGITS,
    h_space: 0,
    align_h: hmUI.align.LEFT,
    invalid_image: img('stat/invalid.png'),
    show_level: showLevel,
    ...extra,
  })
}

function icon(x, y, src, showLevel) {
  return hmUI.createWidget(hmUI.widget.IMG, { x: px(x), y: px(y), src: img(src), show_level: showLevel })
}

WatchFace({
  onInit() {
    logger.log('watchface on init')
    this.languageCode = getLanguage()
    this.timeSensor = new Time()
    this.battery = new Battery()
    this.lastBatteryPercent = null
    this.isCharging = false
  },

  build() {
    logger.log('watchface on build')
    icon(0, 0, 'bg.png', NORMAL)
    this.buildTime()
    this.buildDate()
    this.buildStats()

    // Charging has no system data type, so the battery icon is driven from
    // JS; the date only changes at midnight or while the screen was off.
    this.onBatteryChange = () => this.updateBattery()
    this.battery.onChange(this.onBatteryChange)
    this.timeSensor.onPerDay(() => this.updateDate())
    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: () => {
        this.updateDate()
        this.updateBattery()
      },
    })

    this.updateDate()
    this.updateBattery()
  },

  // IMG_TIME is system-driven and shows AM/PM itself in 12h mode. Only its
  // position depends on the format: 12h leaves room for AM/PM on the right,
  // 24h is centered on the dial.
  buildTime() {
    const is12h = this.timeSensor.getHourFormat() === TIME_HOUR_FORMAT_12
    const timeX = is12h ? TIME_X_12H : TIME_X_24H
    hmUI.createWidget(hmUI.widget.IMG_TIME, {
      hour_zero: 1,
      hour_startX: px(timeX),
      hour_startY: px(TIME_Y),
      hour_array: TIME_DIGITS,
      hour_space: 0,
      hour_unit_sc: img('time/colon.png'),
      hour_unit_tc: img('time/colon.png'),
      hour_unit_en: img('time/colon.png'),
      hour_align: hmUI.align.LEFT,
      minute_zero: 1,
      minute_startX: px(timeX + MINUTE_OFFSET),
      minute_startY: px(TIME_Y),
      minute_array: TIME_DIGITS,
      minute_space: 0,
      minute_align: hmUI.align.LEFT,
      minute_follow: 0,
      am_x: px(AMPM_X),
      am_y: px(AMPM_Y),
      am_sc_path: img('time/am.png'),
      am_en_path: img('time/am.png'),
      pm_x: px(AMPM_X),
      pm_y: px(AMPM_Y),
      pm_sc_path: img('time/pm.png'),
      pm_en_path: img('time/pm.png'),
      show_level: NORMAL_AND_AOD,
    })
  },

  buildDate() {
    this.dateText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: px(DATE_CENTER_Y - 25),
      w: px(480),
      h: px(50),
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.NONE,
      color: 0xffffff,
      text_size: px(DATE_TEXT_SIZE),
      font: DATE_FONT,
      text: '',
      show_level: NORMAL_AND_AOD,
    })
  },

  buildStats() {
    const percent = img('stat/percent.png')
    statText(STAT_X_LEFT, STAT_Y_TOP, 110, hmUI.data_type.HEART, NORMAL)
    statText(STAT_X_RIGHT, STAT_Y_TOP, 150, hmUI.data_type.STEP, NORMAL_AND_AOD)
    statText(STAT_X_LEFT, STAT_Y_BOTTOM, 110, hmUI.data_type.BATTERY, NORMAL, {
      unit_sc: percent,
      unit_tc: percent,
      unit_en: percent,
    })
    statText(STAT_X_RIGHT, STAT_Y_BOTTOM, 150, hmUI.data_type.DISTANCE, NORMAL, {
      dot_image: img('stat/dot.png'),
    })

    icon(STEP_X, STEP_Y, 'icons/step.png', NORMAL_AND_AOD)
    this.powerIcon = icon(POWER_X, POWER_Y, 'icons/power.png', NORMAL)
    this.powerChargingIcon = icon(POWER_X, POWER_Y, 'icons/power_charging.png', NORMAL)
  },

  updateDate() {
    this.dateText.setProperty(hmUI.prop.TEXT, formatDate(new Date(), this.languageCode))
  },

  updateBattery() {
    const percent = this.battery.getCurrent()
    this.isCharging = nextChargingState(this.lastBatteryPercent, percent, this.isCharging)
    this.lastBatteryPercent = percent
    this.powerIcon.setProperty(hmUI.prop.VISIBLE, !this.isCharging)
    this.powerChargingIcon.setProperty(hmUI.prop.VISIBLE, this.isCharging)
  },

  onDestroy() {
    logger.log('watchface on destroy')
    this.battery.offChange(this.onBatteryChange)
  },
})
