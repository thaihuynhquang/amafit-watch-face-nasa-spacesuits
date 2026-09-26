// Zepp OS exposes no charging status to watchfaces, so charging is inferred
// from the direction of battery percentage changes. Kept free of Zepp OS APIs
// so it runs under plain `node --test`.
export function nextChargingState(previousPercent, currentPercent, wasCharging) {
  if (previousPercent === null) return false
  if (currentPercent > previousPercent) return true
  if (currentPercent < previousPercent) return false
  return wasCharging
}
