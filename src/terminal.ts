const graphemeSegmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

export function terminalGraphemes(value: string): string[] {
  return Array.from(graphemeSegmenter.segment(value), part => part.segment);
}

export function withoutLastTerminalGrapheme(value: string): string {
  const segments = Array.from(graphemeSegmenter.segment(value));
  const last = segments.at(-1);
  return last === undefined ? '' : value.slice(0, last.index);
}

export function terminalGraphemeWidth(grapheme: string): number {
  if (grapheme.length === 0 || /^\p{Mark}+$/u.test(grapheme)) return 0;
  if (/\p{Extended_Pictographic}/u.test(grapheme)) return 2;
  const codePoint = grapheme.codePointAt(0) ?? 0;
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f || codePoint === 0x2329 || codePoint === 0x232a ||
    codePoint >= 0x2e80 && codePoint <= 0xa4cf ||
    codePoint >= 0xac00 && codePoint <= 0xd7a3 ||
    codePoint >= 0xf900 && codePoint <= 0xfaff ||
    codePoint >= 0xfe10 && codePoint <= 0xfe6f ||
    codePoint >= 0xff00 && codePoint <= 0xff60
  ) ? 2 : 1;
}

export function terminalTextWidth(value: string): number {
  return terminalGraphemes(value).reduce((width, grapheme) => width + terminalGraphemeWidth(grapheme), 0);
}

export function wrapTerminalLine(value: string, columns: number): string[] {
  if (value.length === 0) return [''];
  const wrapped: string[] = [];
  let line = '';
  let width = 0;
  for (const grapheme of terminalGraphemes(value)) {
    const graphemeWidth = terminalGraphemeWidth(grapheme);
    if (line.length > 0 && width + graphemeWidth > columns) {
      wrapped.push(line);
      line = '';
      width = 0;
    }
    line += grapheme;
    width += graphemeWidth;
  }
  if (line.length > 0) wrapped.push(line);
  return wrapped;
}

export function sanitizeTerminalText(value: string): string {
  return value
    .replace(/\u001B\](?:[^\u0007\u001B]|\u001B(?!\\))*(?:\u0007|\u001B\\)/g, '')
    .replace(/(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '');
}
