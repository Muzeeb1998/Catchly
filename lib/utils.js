// Shared utility helpers.

export function uid(prefix = 'sub') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function fmtMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      // narrowSymbol -> "$1.50" instead of locale-prefixed "US$1.50" / "A$1.50".
      // Saves 2 chars per value, lets a 380px popup fit currency without
      // ellipsis truncation. Trade-off: loses the currency-prefix
      // distinguisher for non-USD subs (acceptable since most users track
      // a single base currency).
      currencyDisplay: 'narrowSymbol'
    }).format(amount);
  } catch {
    return `$${(amount || 0).toFixed(2)}`;
  }
}

// Convert any cycle to monthly equivalent so totals can be compared.
export function toMonthly(amount, cycle) {
  switch (cycle) {
    case 'weekly': return amount * (52 / 12);
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
    default: return amount;
  }
}

export function toYearly(amount, cycle) {
  return toMonthly(amount, cycle) * 12;
}

export function daysUntil(ts) {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86400_000);
}

export function fmtRelative(ts) {
  const d = daysUntil(ts);
  if (d === null) return '—';
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return `in ${d} days`;
  if (d < 30) return `in ${Math.round(d / 7)}w`;
  return `in ${Math.round(d / 30)}mo`;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// Urgency tier for trial countdown badge + UI colors.
// Returns: 'safe' | 'soon' | 'urgent' | 'overdue'
export function urgencyOf(ts) {
  const d = daysUntil(ts);
  if (d === null) return 'safe';
  if (d < 0) return 'overdue';
  if (d <= 2) return 'urgent';
  if (d <= 7) return 'soon';
  return 'safe';
}

// Compute next renewal date forward from a given date by cycle (monthly/yearly/etc.).
// Used after a renewal fires.
export function nextRenewalAfter(ts, cycle) {
  const d = new Date(ts);
  switch (cycle) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.getTime();
}

// HTML escape for inserting user-controlled text into innerHTML.
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
