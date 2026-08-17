import { describe, it, expect } from 'vitest';
import { normalizeTzPhone, isValidTzPhone } from '../src/lib/phone.js';
import { normalizeMac } from '../src/lib/mac.js';

describe('normalizeTzPhone', () => {
  it('normalises common Tanzanian input forms to +255XXXXXXXXX', () => {
    expect(normalizeTzPhone('0712345678')).toBe('+255712345678');
    expect(normalizeTzPhone('712345678')).toBe('+255712345678');
    expect(normalizeTzPhone('255712345678')).toBe('+255712345678');
    expect(normalizeTzPhone('+255 712 345 678')).toBe('+255712345678');
    expect(normalizeTzPhone('+255-712-345-678')).toBe('+255712345678');
  });

  it('rejects non-mobile / malformed numbers', () => {
    expect(normalizeTzPhone('0212345678')).toBeNull(); // landline range (leading 2)
    expect(normalizeTzPhone('12345')).toBeNull();
    expect(normalizeTzPhone('')).toBeNull();
    expect(normalizeTzPhone('not-a-phone')).toBeNull();
  });

  it('isValidTzPhone mirrors normalizeTzPhone', () => {
    expect(isValidTzPhone('0712345678')).toBe(true);
    expect(isValidTzPhone('0212345678')).toBe(false);
  });
});

describe('normalizeMac', () => {
  it('normalises colon/dash/bare forms to Omada\'s AA-BB-CC-DD-EE-FF form', () => {
    expect(normalizeMac('aa:bb:cc:dd:ee:ff')).toBe('AA-BB-CC-DD-EE-FF');
    expect(normalizeMac('AA-BB-CC-DD-EE-FF')).toBe('AA-BB-CC-DD-EE-FF');
    expect(normalizeMac('aabbccddeeff')).toBe('AA-BB-CC-DD-EE-FF');
  });

  it('rejects malformed input', () => {
    expect(normalizeMac('not-a-mac')).toBeNull();
    expect(normalizeMac('aa:bb:cc')).toBeNull();
  });
});
