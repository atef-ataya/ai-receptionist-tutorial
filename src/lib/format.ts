import { DateTime } from "luxon";

export function formatMoney(priceMinor: number, currency = "AED") {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(priceMinor / 100);
}

export function formatBusinessTime(iso: string) {
  return DateTime.fromISO(iso, { zone: "utc" })
    .setZone("Asia/Dubai")
    .toFormat("ccc, d LLL · h:mm a");
}

export function formatFullBusinessTime(iso: string) {
  return DateTime.fromISO(iso, { zone: "utc" })
    .setZone("Asia/Dubai")
    .toFormat("cccc, d LLLL · h:mm a");
}
