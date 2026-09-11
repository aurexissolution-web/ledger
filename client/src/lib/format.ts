export function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "MYR",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function timestampToDateInput(timestamp: number) {
  const date = new Date(timestamp);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

export function dateInputToTimestamp(value: string) {
  return new Date(`${value}T12:00:00`).getTime();
}

export function moneyToCents(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
}

export function centsToInput(value: number) {
  return (value / 100).toFixed(2);
}

export function todayInput() {
  return timestampToDateInput(Date.now());
}
