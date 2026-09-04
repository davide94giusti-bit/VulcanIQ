const DB_NAME = 'vulcaniq-notification-sw';
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

function cleanPresentationText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : '';
}

function safeCategory(value) {
  const category = typeof value === 'string' ? value.trim() : '';
  return /^[a-z][a-z0-9_]{0,59}$/.test(category) ? category : '';
}

function safeInternalUrl(value) {
  const fallback = '/install';
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (!candidate || candidate.length > 500 || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  try {
    const parsed = new URL(candidate, self.location.origin);
    if (parsed.origin !== self.location.origin || parsed.pathname.startsWith('/admin')) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return fallback; }
}

function pushPresentation(event, english) {
  const fallback = {
    title: english ? 'VulcanIQ update' : 'Aggiornamento VulcanIQ',
    body: english ? 'A new update is available. Open VulcanIQ for details.' : 'È disponibile un nuovo aggiornamento. Apri VulcanIQ per i dettagli.',
    tag: 'vulcaniq-public-update',
    url: '/install'
  };
  let payload;
  try { payload = event.data?.json(); } catch { return fallback; }
  if (!payload || payload.type !== 'vulcaniq-notification') return fallback;
  const title = cleanPresentationText(payload.title, 100);
  const body = cleanPresentationText(payload.body, 240);
  if (!title || !body) return fallback;
  const category = safeCategory(payload.category);
  return { title, body, tag: category ? `vulcaniq-${category}` : fallback.tag, url: safeInternalUrl(payload.url) };
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'notification-config') {
    event.waitUntil(setConfig({ variant: 'public', locale: event.data.locale === 'en' ? 'en' : 'it' }));
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const config = await getConfig().catch(() => ({}));
    const english = config.locale === 'en';
    const presentation = pushPresentation(event, english);
    await self.registration.showNotification(presentation.title, {
      body: presentation.body,
      icon: '/brand/vulcaniq/app-icon-192.png',
      badge: '/brand/vulcaniq/app-icon-192.png',
      tag: presentation.tag,
      silent: false,
      vibrate: [120],
      data: { url: presentation.url }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeInternalUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const publicClient = windows.find((client) => {
      const path = new URL(client.url).pathname;
      return !path.startsWith('/admin');
    });
    if (publicClient) {
      await publicClient.navigate(target).catch(() => {});
      return publicClient.focus();
    }
    return self.clients.openWindow(target);
  })());
});
