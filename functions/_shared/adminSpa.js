function withAdminHeaders(response, requestMethod) {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Cache-Control', 'no-store');
  return new Response(requestMethod === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function serveAdminSpa({ request, env }) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        Allow: 'GET, HEAD',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const shellUrl = new URL(request.url);
  shellUrl.pathname = '/';
  shellUrl.search = '';
  shellUrl.hash = '';

  const shellRequest = new Request(shellUrl.toString(), {
    method,
    headers: request.headers,
  });
  const shellResponse = await env.ASSETS.fetch(shellRequest);
  return withAdminHeaders(shellResponse, method);
}
