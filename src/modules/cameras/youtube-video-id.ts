/**
 * youtube-video-id.ts
 *
 * Cameras are stored by video id only (the app builds the player address itself, because it
 * must identify the app to YouTube). People paste whole links with tracking parameters, so
 * this turns a link or a bare id into the 11-character id.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

export function isYouTubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID_PATTERN.test(value);
}

/**
 * The video id of a YouTube link (watch, embed, live, shorts or youtu.be) or a bare id.
 * Anything it does not recognise is returned unchanged, so validation can reject it.
 */
export function parseYouTubeVideoId(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const text = input.trim();
  if (isYouTubeVideoId(text)) return text;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : 'https://'.concat(text));
  } catch {
    return input;
  }
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return input;

  const fromQuery = url.searchParams.get('v');
  if (isYouTubeVideoId(fromQuery)) return fromQuery;

  const [first, second] = url.pathname.split('/').filter(Boolean);
  const candidate =
    url.hostname.toLowerCase() === 'youtu.be'
      ? first
      : ['embed', 'live', 'shorts', 'v'].includes(first)
        ? second
        : undefined;
  return isYouTubeVideoId(candidate) ? candidate : input;
}
