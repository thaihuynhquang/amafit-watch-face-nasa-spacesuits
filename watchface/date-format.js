// Pure date-formatting helpers, kept free of any Zepp OS API so they can run
// under plain `node --test` as well as on-device.
//
// @zos/settings getLanguage() language code for Vietnamese (vi-VN).
// See: docs/reference/related-resources/language-list.mdx
export const LANG_VI = 14

const WEEKDAY_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH_EN = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]
// Vietnamese weekday short labels: Monday..Saturday are numbered (Thứ 2..Thứ 7),
// Sunday is Chủ Nhật (CN). date.getDay(): 0=Sun..6=Sat.
const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function formatEn(date) {
  const weekday = WEEKDAY_EN[date.getDay()]
  const month = MONTH_EN[date.getMonth()]
  return `${weekday}, ${month} ${date.getDate()}`
}

function formatVi(date) {
  const weekday = WEEKDAY_VI[date.getDay()]
  return `${weekday}, ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`
}

/**
 * Format the date-row string shown under the time.
 * @param {Date} date
 * @param {number} languageCode value returned by `@zos/settings` getLanguage()
 * @returns {string} e.g. "FRI, SEP 24" (en-US) or "T6, 24/09" (vi-VN)
 */
export function formatDate(date, languageCode) {
  if (languageCode === LANG_VI) return formatVi(date)
  return formatEn(date)
}
