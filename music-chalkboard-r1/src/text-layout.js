import DATA from './glyph-data.json' with { type: 'json' };

export const HAND_FONT = 'WhiteboardHand';
const SYSTEM_FONTS = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
const widths = new Map();
const MAX_WIDTHS = 512;
let canvasContext;
let handAvailable = true;
let fallbackAvailable = false;
const segmenter = typeof Intl?.Segmenter === 'function' ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
const extension = /[\p{M}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;
const regional = /[\u{1F1E6}-\u{1F1FF}]/u;

export function graphemes(text) {
  const normalized = text.normalize('NFC');
  if (segmenter) return Array.from(segmenter.segment(normalized), value => value.segment);
  const units = [];
  let previous = '';
  let regionalRun = 0;
  for (const current of normalized) {
    const joins = extension.test(current) || current === '\u200d' || previous === '\u200d'
      || (previous === '\r' && current === '\n') || (regional.test(current) && regionalRun % 2 === 1);
    if (units.length && joins) units[units.length - 1] += current;
    else units.push(current);
    regionalRun = regional.test(current) ? regionalRun + 1 : 0;
    previous = current;
  }
  return units;
}

export function setTextFontAvailability(hand, fallback = false) {
  handAvailable = Boolean(hand);
  fallbackAvailable = Boolean(fallback);
  widths.clear();
}

export function hasGlyphs(text) {
  return graphemes(text).every(ch => /^\s$/u.test(ch) || Object.hasOwn(DATA.glyphs, ch));
}

export function fallbackFamily() {
  return fallbackAvailable ? `WhiteboardKorean, ${SYSTEM_FONTS}` : SYSTEM_FONTS;
}

export function measureFallback(text, size) {
  if (!text) return 0;
  const key = `${size}|${text}`;
  if (widths.has(key)) return widths.get(key);
  canvasContext ||= globalThis.document?.createElement('canvas').getContext('2d');
  let width = 0;
  if (canvasContext) {
    canvasContext.font = `400 ${size}px ${fallbackFamily()}`;
    width = canvasContext.measureText(text).width;
  }
  if (!Number.isFinite(width) || width <= 0) {
    width = graphemes(text).reduce((sum, ch) => sum + (/^\s$/u.test(ch) ? 0.32 : /^[\x00-\x7f]$/u.test(ch) ? 0.6 : 1) * size, 0);
  }
  if (widths.size >= MAX_WIDTHS) widths.delete(widths.keys().next().value);
  widths.set(key, width);
  return width;
}

function tokenFor(ch, offset, size, letterSpacing, forceFallback) {
  const space = /^\s$/u.test(ch);
  const glyph = handAvailable && !forceFallback && Object.hasOwn(DATA.glyphs, ch) ? DATA.glyphs[ch] : null;
  const fontSize = glyph ? size * 1.12 : size;
  const width = space ? 0.32 * size : glyph ? Math.max(0.1, glyph[0] / DATA.upm + letterSpacing) * fontSize : measureFallback(ch, size);
  return { ch, offset, space, glyph, fontSize, width };
}

function mergeFallback(tokens, size) {
  const runs = [];
  for (const token of tokens) {
    const previous = runs.at(-1);
    if (!token.glyph && !token.space && previous && !previous.glyph && !previous.space
      && previous.end !== null && token.offset === previous.end) {
      previous.ch += token.ch;
      previous.end += 1;
      previous.width += token.width;
      previous.inkWidth = measureFallback(previous.ch, size);
      continue;
    }
    runs.push({ ...token, end: token.offset === null ? null : token.offset + 1, inkWidth: token.width });
  }
  return runs;
}

export function measureText(text, size, forceFallback = false) {
  if (forceFallback || !handAvailable) return measureFallback(text, size);
  return graphemes(text).reduce((width, ch) => width + tokenFor(ch, null, size, 0.025, false).width, 0);
}

function line(tokens, size) {
  const content = tokens.slice();
  while (content.at(-1)?.space) content.pop();
  const runs = mergeFallback(content, size);
  let width = 0;
  let advance = 0;
  for (const token of runs) {
    width = Math.max(width, advance + Math.max(token.width, token.inkWidth));
    advance += token.width;
  }
  return { tokens: runs, width };
}

function rowsFor(text, size, { maxWidth, prefix = '', letterSpacing = 0.025 }) {
  const prefixTokens = graphemes(prefix).map(ch => tokenFor(ch, null, size, letterSpacing, false));
  const tokens = graphemes(text).map((ch, offset) => tokenFor(ch, offset, size, letterSpacing, false));
  if (!tokens.length) return [];
  const rows = [];
  let start = 0;
  for (let end = 0; end <= tokens.length; end++) {
    if (end < tokens.length && !/^\r?\n$|^\r$/u.test(tokens[end].ch)) continue;
    const paragraph = tokens.slice(start, end);
    if (!paragraph.length && !(!rows.length && prefix && end < tokens.length)) rows.push(line([], size));
    let pointer = 0;
    while (pointer < paragraph.length) {
      while (paragraph[pointer]?.space) pointer++;
      if (pointer === paragraph.length) break;
      const heading = rows.length ? [] : prefixTokens;
      let width = heading.reduce((sum, token) => sum + token.width, 0);
      let tail = pointer;
      let lastSpace = -1;
      while (tail < paragraph.length) {
        const token = paragraph[tail];
        if (width + token.width > maxWidth && tail > pointer) break;
        width += token.width;
        if (token.space) lastSpace = tail;
        tail++;
      }
      if (tail < paragraph.length && lastSpace >= pointer) tail = lastSpace + 1;
      rows.push(line(heading.concat(paragraph.slice(pointer, tail)), size));
      pointer = tail;
    }
    start = end + 1;
  }
  return rows;
}

export function layoutParagraph(text, options) {
  const { maxWidth, maxRows = Infinity, size, minSize = size } = options;
  let fitted;
  for (let fontSize = size; fontSize >= minSize; fontSize = Math.max(minSize, fontSize - 1)) {
    const rows = rowsFor(text, fontSize, options);
    const overflow = rows.length > maxRows || rows.some(row => row.width > maxWidth);
    fitted = { size: fontSize, rows, overflow, lineHeight: fontSize * 1.27 };
    if (!overflow || fontSize === minSize) break;
  }
  return fitted;
}

export function fitVisibleRows(layout, maxRows, maxWidth) {
  const fit = layout.rows.slice(0, maxRows);
  if (!fit.length || layout.rows.length <= maxRows && fit.every(row => row.width <= maxWidth)) return fit;
  const last = fit.at(-1);
  const dots = { ...tokenFor('…', null, layout.size, 0.025, true), end: null };
  const tokens = last.tokens.slice();
  let width = last.width;
  while (tokens.length && width + dots.width > maxWidth) {
    tokens.pop();
    width = tokens.reduce((sum, token) => sum + Math.max(token.width, token.inkWidth), 0);
  }
  fit[fit.length - 1] = { tokens: [...tokens, dots], width: width + dots.width };
  return fit;
}

export const glyphUnits = DATA.upm;
