const DB_NAME = 'vulcaniq-admin-notification-sw';
const STORE = 'config';

function db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setConfig(value) {
  const database = await db();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(value, 'current');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getConfig() {
  const database = await db();
  const value = await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get('current');
    request.onsuccess = () => resolve(request.result || {});
    request.onerror = () => reject(request.error);
  });
  database.close();
  return value;
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'notification-config') {
    event.waitUntil(setConfig({ variant: 'admin', locale: event.data.locale === 'en' ? 'en' : 'it' }));
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const config = await getConfig().catch(() => ({}));
    const english = config.locale === 'en';
    await self.registration.showNotification('VulcanIQ Admin', {
      body: english ? 'A new operational update needs your attention.' : 'Un nuovo aggiornamento operativo richiede la tua attenzione.',
      icon: '/brand/vulcaniq/app-icon-192.png',
      badge: '/brand/vulcaniq/app-icon-192.png',
      tag: 'vulcaniq-admin-update',
      silent: false,
      vibrate: [120, 60, 120],
      data: { url: '/admin/notifications' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/admin/notifications';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const adminClient = windows.find((client) => new URL(client.url).pathname.startsWith('/admin'));
    if (adminClient) {
      await adminClient.navigate(target).catch(() => {});
      return adminClient.focus();
    }
    return self.clients.openWindow(target);
  })());
});
