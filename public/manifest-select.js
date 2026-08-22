(() => {
  const admin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = admin ? '/admin-manifest.webmanifest' : '/manifest.webmanifest';
  document.head.appendChild(link);
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute('content', admin ? 'VulcanIQ Admin' : 'VulcanIQ');
})();
