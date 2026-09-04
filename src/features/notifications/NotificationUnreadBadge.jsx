import React from 'react';
import { notificationBadgeText } from '../../domain/notificationInbox.js';

export default function NotificationUnreadBadge({ count }) {
  const display = notificationBadgeText(count);
  if (!display) return null;
  return <span className="notification-unread-badge" aria-hidden="true">{display}</span>;
}
