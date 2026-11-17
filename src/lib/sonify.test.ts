import { describe, expect, it } from 'vitest';
import { LOW_HZ, OCTAVES, panOf, pitchOf } from './sonify';

const HIGH_HZ = LOW_HZ * 2 ** OCTAVES;

describe('pitchOf', () => {
  it('最低值对应 220Hz，最高值对应 880Hz', () => {
    expect(pitchOf(0, 0, 10)).toBeCloseTo(LOW_HZ, 6);
    expect(pitchOf(10, 0, 10)).toBeCloseTo(HIGH_HZ, 6);
    expect(pitchOf(-5, -5, 5)).toBeCloseTo(LOW_HZ, 6);
    expect(pitchOf(125000, 0, 125000)).toBeCloseTo(HIGH_HZ, 6);
  });

  it('范围内的音高都在 220~880Hz 之间', () => {
    const min = 10;
    const max = 90;
    for (let v = min; v <= max; v += 10) {
      const hz = pitchOf(v, min, max);
      expect(hz).toBeGreaterThanOrEqual(LOW_HZ);
      expect(hz).toBeLessThanOrEqual(HIGH_HZ);
    }
  });

  it('数值越大音高越高（严格单调）', () => {
    let prev = -Infinity;
    for (let v = 0; v <= 100; v += 5) {
      const hz = pitchOf(v, 0, 100);
      expect(hz).toBeGreaterThan(prev);
      prev = hz;
    }
  });

  it('所有数值相同时取中间音（440Hz）', () => {
    const mid = LOW_HZ * 2 ** (OCTAVES / 2);
    expect(pitchOf(7, 7, 7)).toBeCloseTo(mid, 6);
    expect(pitchOf(0, 0, 0)).toBeCloseTo(mid, 6);
  });
});

describe('panOf', () => {
  it('第一个点在最左，最后一个点在最右', () => {
    expect(panOf(0, 5)).toBeCloseTo(-1, 6);
    expect(panOf(4, 5)).toBeCloseTo(1, 6);
    expect(panOf(2, 5)).toBeCloseTo(0, 6);
  });

  it('单点居中', () => {
    expect(panOf(0, 1)).toBe(0);
    expect(panOf(0, 0)).toBe(0);
  });

  it('左右声道从左到右递增，并且不越界', () => {
    let prev = -Infinity;
    for (let i = 0; i < 8; i++) {
      const pan = panOf(i, 8);
      expect(pan).toBeGreaterThan(prev);
      expect(pan).toBeGreaterThanOrEqual(-1);
      expect(pan).toBeLessThanOrEqual(1);
      prev = pan;
    }
  });
});
