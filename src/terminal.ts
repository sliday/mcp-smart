import stringWidth from 'string-width';

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
  return stringWidth(grapheme);
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
