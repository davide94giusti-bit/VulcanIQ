export const DEFAULT_CURRENCY = 'EUR';

const VALID_CURRENCY_CACHE = new Map();

export function normalizeCurrency(value, fallback = DEFAULT_CURRENCY) {
  const fallbackCode = String(fallback || DEFAULT_CURRENCY).trim().toUpperCase().match(/\b[A-Z]{3}\b/)?.[0] || DEFAULT_CURRENCY;
  if (value === undefined || value === null || value === '') return fallbackCode;

  const raw = String(value).trim().toUpperCase();
  const candidate = raw.match(/\b[A-Z]{3}\b/)?.[0] || fallbackCode;

  if (VALID_CURRENCY_CACHE.has(candidate)) {
    return VALID_CURRENCY_CACHE.get(candidate) ? candidate : fallbackCode;
  }

  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: candidate }).format(1);
    VALID_CURRENCY_CACHE.set(candidate, true);
    return candidate;
  } catch {
    VALID_CURRENCY_CACHE.set(candidate, false);
    return fallbackCode;
  }
}

export function parseMoneyAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === undefined || value === null || value === '') return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const cleaned = raw
    .replace(/[A-Za-z€$£¥\s]/g, '')
    .replace(/[^\d,.-]/g, '');

  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > -1 && lastDot > -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = cleaned.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
  } else if (lastComma > -1) {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrencyAmount(amount, currency = DEFAULT_CURRENCY, locale = 'it-IT') {
  const normalizedAmount = parseMoneyAmount(amount);
  const normalizedCurrency = normalizeCurrency(currency);

  try {
    return new Intl.NumberFormat(locale || 'it-IT', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(normalizedAmount);
  } catch {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: DEFAULT_CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(normalizedAmount);
  }
}

export function normalizeMoneyInput(amount, currency = DEFAULT_CURRENCY) {
  return {
    amount: parseMoneyAmount(amount),
    currency: normalizeCurrency(currency)
  };
}

export function moneySelfCheck() {
  return [
    formatCurrencyAmount(35, 'EUR'),
    formatCurrencyAmount('35.00', 'EUR'),
    formatCurrencyAmount('EUR 35.00', 'EUR'),
    formatCurrencyAmount(35, 'EUR 35.00'),
    formatCurrencyAmount(35, 'INVALID')
  ];
}
