export function sanitizeTerminalText(value: string): string {
  return value
    .replace(/\u001B\](?:[^\u0007\u001B]|\u001B(?!\\))*(?:\u0007|\u001B\\)/g, '')
    .replace(/(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '');
}
