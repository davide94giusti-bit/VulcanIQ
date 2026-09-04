export function unreadNotificationCount(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((count, item) => count + (item && !item.read_at && !item.dismissed_at ? 1 : 0), 0);
}

export function notificationBadgeText(count) {
  const normalized = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  if (normalized === 0) return '';
  return normalized > 99 ? '99+' : String(normalized);
}

export function notificationUnreadAriaLabel(label, count, lang = 'it') {
  const normalized = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  if (normalized === 0) return label;
  if (lang === 'it') return `${label}, ${normalized} ${normalized === 1 ? 'notifica non letta' : 'notifiche non lette'}`;
  return `${label}, ${normalized} unread ${normalized === 1 ? 'notification' : 'notifications'}`;
}
