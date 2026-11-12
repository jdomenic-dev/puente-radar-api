import { isYouTubeVideoId, parseYouTubeVideoId } from './youtube-video-id.js';

describe('parseYouTubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=mp3RS0y77tY', 'mp3RS0y77tY'],
    [
      'youtube.com/watch?v=Y3OESQEXBlI&source_ve_path=MjM4NTE&embeds_referring_euri=https%3A%2F%2Fwww.reportedepuentes.com.mx%2F',
      'Y3OESQEXBlI',
    ],
    ['https://www.youtube.com/watch?feature=share&v=KX-bm-Lhy3w', 'KX-bm-Lhy3w'],
    ['https://m.youtube.com/watch?v=GC5RY3zipa4', 'GC5RY3zipa4'],
    ['https://youtu.be/o5h9RB7qwY8?si=abc', 'o5h9RB7qwY8'],
    ['https://www.youtube.com/embed/IcvugJWPXz8?autoplay=1&mute=1', 'IcvugJWPXz8'],
    ['https://www.youtube-nocookie.com/embed/0Pg3S6s76IE', '0Pg3S6s76IE'],
    ['https://www.youtube.com/live/CYhISA_wFQ8', 'CYhISA_wFQ8'],
    ['https://www.youtube.com/shorts/RVXhhbkBGbI', 'RVXhhbkBGbI'],
  ])('extracts the id from %s', (input, expected) => {
    expect(parseYouTubeVideoId(input)).toBe(expected);
  });

  it('accepts a bare id and trims surrounding spaces', () => {
    expect(parseYouTubeVideoId('  sOHFG6_3zAs  ')).toBe('sOHFG6_3zAs');
  });

  it('leaves anything it does not recognise untouched so validation can reject it', () => {
    expect(parseYouTubeVideoId('https://example.com/watch?v=mp3RS0y77tY')).toBe(
      'https://example.com/watch?v=mp3RS0y77tY',
    );
    expect(parseYouTubeVideoId('not a video')).toBe('not a video');
    expect(parseYouTubeVideoId('https://www.youtube.com/@fpfch')).toBe('https://www.youtube.com/@fpfch');
  });

  it('passes non-strings through unchanged', () => {
    expect(parseYouTubeVideoId(42)).toBe(42);
    expect(parseYouTubeVideoId(undefined)).toBeUndefined();
  });
});

describe('isYouTubeVideoId', () => {
  it('accepts exactly 11 url-safe characters', () => {
    expect(isYouTubeVideoId('KX-bm-Lhy3w')).toBe(true);
    expect(isYouTubeVideoId('0Pg3S6s76IE')).toBe(true);
  });

  it.each(['', 'short', 'mp3RS0y77tYX', 'mp3RS0y77t!', 'mp3 S0y77tY'])('rejects %p', (value) => {
    expect(isYouTubeVideoId(value)).toBe(false);
  });
});
