import { describe, expect, it } from 'vitest';
import { parseCredentials, parseMessage, parsePhone } from './validation.js';

describe('input validation', () => {
  it('accepts a GREEN-API cluster URL and rejects unsafe hosts', () => {
    expect(parseCredentials({ apiUrl: 'https://3100.api.green-api.com', idInstance: '3100000000', apiTokenInstance: 'abcdef0123456789' }).apiUrl)
      .toBe('https://3100.api.green-api.com');
    expect(() => parseCredentials({ apiUrl: 'https://api.green-api.com.evil.test', idInstance: '3100000000', apiTokenInstance: 'abcdef0123456789' })).toThrow();
    expect(() => parseCredentials({ apiUrl: 'http://3100.api.green-api.com', idInstance: '3100000000', apiTokenInstance: 'abcdef0123456789' })).toThrow();
  });

  it('normalizes supported phone numbers', () => {
    expect(parsePhone('+7 (999) 123-45-67')).toBe('79991234567');
    expect(parsePhone('+375 29 123-45-67')).toBe('375291234567');
    expect(() => parsePhone('+1 555 123 4567')).toThrow();
  });

  it('rejects empty and overlong messages', () => {
    expect(parseMessage(' Привет ')).toBe('Привет');
    expect(() => parseMessage('  ')).toThrow();
    expect(() => parseMessage('x'.repeat(4001))).toThrow();
  });
});
