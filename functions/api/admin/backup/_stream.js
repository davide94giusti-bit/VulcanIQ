// Backpressure keeps only one upstream chunk live, regardless of artifact size.
export async function artifactStream(response, abort = () => {}) {
  if (!response.ok || !response.body) throw new Error('artifact_download_failed');
  const reader = response.body.getReader();
  const first = await reader.read();
  if (first.done || !first.value.byteLength) { abort(); throw new Error('artifact_download_failed'); }
  const expected = Number(response.headers.get('content-length') || 0);
  let bytes = 0;
  let initial = first.value;
  return new ReadableStream({
    async pull(controller) {
      try {
        const result = initial ? { done: false, value: initial } : await reader.read();
        initial = null;
        if (result.done) {
          if (expected && bytes !== expected) throw new Error('artifact_truncated');
          controller.close(); return;
        }
        bytes += result.value.byteLength;
        if (expected && bytes > expected) throw new Error('artifact_size_mismatch');
        controller.enqueue(result.value);
      } catch (error) { abort(); void reader.cancel(); controller.error(new Error('artifact_stream_failed')); }
    },
    cancel(reason) { abort(); return reader.cancel(reason); }
  }, { highWaterMark: 1 });
}

export function trustedArtifactRedirect(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !(/(^|\.)blob\.core\.windows\.net$/.test(url.hostname) || /(^|\.)githubusercontent\.com$/.test(url.hostname) || /(^|\.)actions\.githubusercontent\.com$/.test(url.hostname))) throw new Error('artifact_redirect_invalid');
  return url.href;
}
