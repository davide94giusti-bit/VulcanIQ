const SOURCE_EXTENSIONS = ['mov', 'mp4', 'webm'];
const SOURCE_MIME_TYPES = ['video/quicktime', 'video/mp4', 'video/webm'];
const MAX_SOURCE_BYTES = 180 * 1024 * 1024;
const STORAGE_SAFE_OUTPUT_BYTES = 9 * 1024 * 1024;
const DEFAULT_CLIP_SECONDS = 15;
const MAX_CLIP_SECONDS = 30;
const OUTPUT_FPS = 30;

const OUTPUT_CANDIDATES = {
  mp4: [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4'
  ],
  webm: [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ]
};

function waitForEvent(target, eventName, errorName = 'error') {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, handleSuccess);
      if (errorName) target.removeEventListener(errorName, handleError);
    };
    const handleSuccess = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(target.error || new Error(`Unable to load media (${eventName}).`));
    };
    target.addEventListener(eventName, handleSuccess, { once: true });
    if (errorName) target.addEventListener(errorName, handleError, { once: true });
  });
}

function seekVideo(video, time) {
  const safeTime = Math.max(0, Math.min(Number(time) || 0, Math.max(0, (video.duration || 0) - 0.05)));
  if (Math.abs((video.currentTime || 0) - safeTime) < 0.03) return Promise.resolve();
  const pending = waitForEvent(video, 'seeked');
  video.currentTime = safeTime;
  return pending;
}

function sourceExtension(file) {
  const clean = String(file?.name || '').toLowerCase();
  const match = clean.match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function safeBaseName(file) {
  return String(file?.name || 'hero-video')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'hero-video';
}

function even(value) {
  const rounded = Math.max(2, Math.floor(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function outputDimensions(width, height, maxWidth = 1280, maxHeight = 720) {
  const sourceWidth = Math.max(2, Number(width) || maxWidth);
  const sourceHeight = Math.max(2, Number(height) || maxHeight);
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: even(sourceWidth * scale),
    height: even(sourceHeight * scale)
  };
}

function outputBitrate(durationSeconds) {
  const duration = Math.max(1, Number(durationSeconds) || DEFAULT_CLIP_SECONDS);
  const targetBits = STORAGE_SAFE_OUTPUT_BYTES * 8 * 0.82;
  return Math.max(450_000, Math.min(2_500_000, Math.floor(targetBits / duration)));
}

function supportedMime(format) {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const candidates = OUTPUT_CANDIDATES[format] || [];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
}

export function mediaOptimizerCapabilities() {
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  const hasCanvasCapture = typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype?.captureStream === 'function';
  return {
    available: hasMediaRecorder && hasCanvasCapture,
    mp4: Boolean(supportedMime('mp4')),
    webm: Boolean(supportedMime('webm')),
    webp: typeof HTMLCanvasElement !== 'undefined',
    mp4Mime: supportedMime('mp4'),
    webmMime: supportedMime('webm')
  };
}

export function validateVideoSource(file) {
  if (!file) throw new Error('Select a video first.');
  const extension = sourceExtension(file);
  const mime = String(file.type || '').toLowerCase();
  if (!SOURCE_EXTENSIONS.includes(extension) && !SOURCE_MIME_TYPES.includes(mime)) {
    throw new Error('Only MOV, MP4, or WEBM source videos are supported.');
  }
  if (Number(file.size) > MAX_SOURCE_BYTES) {
    throw new Error('The source video is too large. Use a file smaller than 180 MB.');
  }
  return true;
}

export async function inspectVideoSource(file) {
  validateVideoSource(file);
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  try {
    const pending = waitForEvent(video, 'loadedmetadata');
    video.src = url;
    await pending;
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Video duration could not be read.');
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      size: file.size
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Browser could not encode ${type}.`));
    }, type, quality);
  });
}

async function createPoster(video, canvas, context, duration, baseName) {
  const posterTime = Math.min(Math.max(duration * 0.08, 0.15), 1.25, Math.max(0, duration - 0.05));
  await seekVideo(video, posterTime);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  let blob;
  let extension;
  try {
    blob = await canvasBlob(canvas, 'image/webp', 0.82);
    if (blob.type !== 'image/webp') throw new Error('WEBP encoding unavailable.');
    extension = 'webp';
  } catch {
    blob = await canvasBlob(canvas, 'image/jpeg', 0.84);
    extension = 'jpg';
  }
  const type = blob.type || (extension === 'webp' ? 'image/webp' : 'image/jpeg');
  return new File([blob], `${baseName}-poster.${extension}`, { type, lastModified: Date.now() });
}

function waitForRecorderStop(recorder) {
  return new Promise((resolve, reject) => {
    recorder.addEventListener('stop', resolve, { once: true });
    recorder.addEventListener('error', (event) => reject(event.error || new Error('Video encoding failed.')), { once: true });
  });
}

async function recordCanvasVideo({
  video,
  canvas,
  context,
  duration,
  mimeType,
  bitrate,
  onProgress,
  signal
}) {
  const stream = canvas.captureStream(OUTPUT_FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate
  });
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) chunks.push(event.data);
  });

  let animationFrame = 0;
  let stopped = false;
  const cleanup = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    stream.getTracks().forEach((track) => track.stop());
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    video.pause();
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const abortHandler = () => stop();
  signal?.addEventListener('abort', abortHandler, { once: true });

  try {
    await seekVideo(video, 0);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const stoppedPromise = waitForRecorderStop(recorder);
    recorder.start(750);

    const render = () => {
      if (signal?.aborted) {
        stop();
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const progress = Math.min(1, Math.max(0, (video.currentTime || 0) / duration));
      onProgress?.(progress);
      if (video.ended || video.currentTime >= duration) {
        stop();
        return;
      }
      animationFrame = requestAnimationFrame(render);
    };

    await video.play();
    animationFrame = requestAnimationFrame(render);
    await stoppedPromise;

    if (signal?.aborted) throw new DOMException('Conversion cancelled.', 'AbortError');
    onProgress?.(1);

    return new Blob(chunks, { type: mimeType.split(';')[0] });
  } finally {
    signal?.removeEventListener('abort', abortHandler);
    cleanup();
  }
}

export async function optimizeHeroVideo(file, {
  format = 'mp4',
  clipSeconds = DEFAULT_CLIP_SECONDS,
  maxWidth = 1280,
  maxHeight = 720,
  onProgress,
  signal
} = {}) {
  validateVideoSource(file);
  const capabilities = mediaOptimizerCapabilities();
  if (!capabilities.available) {
    throw new Error('This browser does not support local video optimization.');
  }

  const mimeType = supportedMime(format);
  if (!mimeType) {
    throw new Error(`${String(format).toUpperCase()} encoding is not supported by this browser. Choose another output format.`);
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');

  try {
    const metadataReady = waitForEvent(video, 'loadedmetadata');
    video.src = url;
    await metadataReady;

    const sourceDuration = Number(video.duration);
    if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
      throw new Error('Video duration could not be read.');
    }

    const requestedDuration = Math.min(MAX_CLIP_SECONDS, Math.max(3, Number(clipSeconds) || DEFAULT_CLIP_SECONDS));
    const duration = Math.min(sourceDuration, requestedDuration);
    const dimensions = outputDimensions(video.videoWidth, video.videoHeight, maxWidth, maxHeight);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas video processing is unavailable.');

    const baseName = safeBaseName(file);
    const posterFile = await createPoster(video, canvas, context, duration, baseName);
    const bitrate = outputBitrate(duration);

    const blob = await recordCanvasVideo({
      video,
      canvas,
      context,
      duration,
      mimeType,
      bitrate,
      onProgress,
      signal
    });

    if (!blob.size) throw new Error('The optimized video is empty.');
    if (blob.size > STORAGE_SAFE_OUTPUT_BYTES) {
      throw new Error('The optimized video is still too large for the current 10 MB media bucket. Choose a shorter clip.');
    }

    const extension = format === 'webm' ? 'webm' : 'mp4';
    const fileType = format === 'webm' ? 'video/webm' : 'video/mp4';
    const videoFile = new File([blob], `${baseName}-hero.${extension}`, {
      type: fileType,
      lastModified: Date.now()
    });

    return {
      videoFile,
      posterFile,
      format,
      mimeType,
      duration,
      width: dimensions.width,
      height: dimensions.height,
      bitrate
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export const VIDEO_OPTIMIZER_LIMITS = Object.freeze({
  maxSourceBytes: MAX_SOURCE_BYTES,
  maxOutputBytes: STORAGE_SAFE_OUTPUT_BYTES,
  defaultClipSeconds: DEFAULT_CLIP_SECONDS,
  maxClipSeconds: MAX_CLIP_SECONDS,
  fps: OUTPUT_FPS
});
