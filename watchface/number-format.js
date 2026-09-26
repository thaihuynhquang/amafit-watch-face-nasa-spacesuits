// Pure number-formatting helpers, kept free of Zepp OS APIs so they can run
// under plain `node --test` as well as on-device.

// The watchface spec caps distance at 4 digits ("0.00" / "00.0"), so
// precision drops as the value grows. Rounding is checked first so that
// e.g. 9.996 becomes "10.0" rather than "10.00".
export function formatDistance(value) {
  if (Number(value.toFixed(2)) < 10) return value.toFixed(2)
  if (Number(value.toFixed(1)) < 100) return value.toFixed(1)
  return value.toFixed(0)
}

export function formatThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
