export async function readBoundedText(request, maxBytes = 32768, timeoutMs = 10000) {
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new Error('body_too_large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { reject(new Error('request_timeout')); void reader.cancel(); }, timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { void reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

// Signal remains active while the response body is consumed, not just until headers arrive.
export function boundedFetch(url, init = {}, timeoutMs = 10000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(url, { ...init, signal, redirect: 'error' });
}

export function safeFailure(error) {
  const code = String(error?.message || '');
  if (code === 'body_too_large') return { status: 413, code, retryable: false };
  if (code === 'request_timeout' || ['TimeoutError', 'AbortError'].includes(error?.name)) return { status: 504, code: 'dependency_timeout', retryable: true };
  if (/not_configured|missing_|invalid_supabase|hash_salt/.test(code)) return { status: 503, code: 'service_unavailable', retryable: true };
  return { status: 503, code: 'dependency_unavailable', retryable: true };
}
