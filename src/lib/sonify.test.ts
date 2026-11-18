import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOW_HZ, OCTAVES, Sonifier, panOf, pitchOf } from './sonify';

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

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeOsc {
  type = 'sine';
  frequency = new FakeParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
}

class FakePanner {
  pan = new FakeParam();
  connect = vi.fn();
}

let oscillators: FakeOsc[] = [];

class FakeAudioContext {
  state: 'running' | 'suspended' = 'running';
  destination = {};
  private startedAt = Date.now();
  private frozenAt = 0;
  private suspended = false;

  /** 与假定时器同步推进，方便测试暂停/续播 */
  get currentTime() {
    return this.suspended ? this.frozenAt : (Date.now() - this.startedAt) / 1000;
  }

  suspend = vi.fn(() => {
    this.frozenAt = this.currentTime;
    this.suspended = true;
    this.state = 'suspended';
    return Promise.resolve();
  });

  resume = vi.fn(() => {
    this.startedAt = Date.now() - this.frozenAt * 1000;
    this.suspended = false;
    this.state = 'running';
    return Promise.resolve();
  });

  createOscillator() {
    const o = new FakeOsc();
    oscillators.push(o);
    return o;
  }
  createGain() {
    return new FakeGain();
  }
  createStereoPanner() {
    return new FakePanner();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  oscillators = [];
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  });
});

describe('playSeries 完成时机', () => {
  // delay = (0.05 起始 + 最后一个音符起点 + 时长 0.8×step + 0.05 余量) 秒
  it.each([
    ['快', 0.2, 660],
    ['中', 0.32, 996],
    ['慢', 0.5, 1500],
  ] as const)('柱状图 %s速在尾音结束后才回调 onEnd', (_label, step, delay) => {
    const s = new Sonifier();
    const onEnd = vi.fn();
    s.playSeries([10, 20, 15], 'bar', step, vi.fn(), onEnd);

    vi.advanceTimersByTime(delay - 30);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('折线图按滑音的实际结束时间回调', () => {
    const s = new Sonifier();
    const onEnd = vi.fn();
    s.playSeries([10, 20, 15], 'line', 0.5, vi.fn(), onEnd);

    vi.advanceTimersByTime(1270);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('只剩一个点的折线仍用正弦音色，完成后回调', () => {
    const s = new Sonifier();
    const onEnd = vi.fn();
    s.playSeries([10], 'line', 0.5, vi.fn(), onEnd);
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].type).toBe('sine');

    vi.advanceTimersByTime(470);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(80);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('停止后不再触发完成回调与逐点回调', () => {
    const s = new Sonifier();
    const onEnd = vi.fn();
    const onStep = vi.fn();
    s.playSeries([10, 20, 15], 'bar', 0.5, onStep, onEnd);
    vi.advanceTimersByTime(100);
    s.stop();
    const stepsAtStop = onStep.mock.calls.length;

    vi.advanceTimersByTime(5000);
    expect(onEnd).not.toHaveBeenCalled();
    expect(onStep.mock.calls.length).toBe(stepsAtStop);
  });

  it('重新播放后旧回调失效，只有新播放会完成', () => {
    const s = new Sonifier();
    const oldEnd = vi.fn();
    const newEnd = vi.fn();
    s.playSeries([10, 20, 15], 'bar', 0.5, vi.fn(), oldEnd);
    vi.advanceTimersByTime(100);
    s.playSeries([1, 2, 3], 'bar', 0.5, vi.fn(), newEnd);

    vi.advanceTimersByTime(5000);
    expect(oldEnd).not.toHaveBeenCalled();
    expect(newEnd).toHaveBeenCalledTimes(1);
  });
});

describe('playSeries 暂停与续播', () => {
  it('暂停冻结进度，续播从暂停处继续且不从头重放', () => {
    const s = new Sonifier();
    const onStep = vi.fn();
    const onEnd = vi.fn();
    s.playSeries([10, 20, 30, 40], 'bar', 0.5, onStep, onEnd);

    vi.advanceTimersByTime(1100);
    expect(onStep.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);

    const paused = s.pause();
    expect(paused).toEqual({ index: 2, inReference: false });

    vi.advanceTimersByTime(2000);
    expect(onStep.mock.calls).toHaveLength(3);
    expect(onEnd).not.toHaveBeenCalled();

    s.resume();
    vi.advanceTimersByTime(1000);
    expect(onStep.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3]);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('参考音阶段暂停后，续播仍先走完参考音', () => {
    const s = new Sonifier();
    const onStep = vi.fn();
    const onEnd = vi.fn();
    s.playSeries([10, 20, 30], 'bar', 0.5, onStep, onEnd, 0, true);

    vi.advanceTimersByTime(300);
    expect(s.pause()).toEqual({ index: 0, inReference: true });
    expect(onStep).not.toHaveBeenCalled();

    s.resume();
    vi.advanceTimersByTime(2600);
    expect(onStep.mock.calls[0][0]).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('暂停状态下停止，不再恢复时钟也不再回调', () => {
    const s = new Sonifier();
    const onEnd = vi.fn();
    s.playSeries([10, 20, 30], 'bar', 0.5, vi.fn(), onEnd);
    vi.advanceTimersByTime(300);
    s.pause();
    s.stop();
    vi.advanceTimersByTime(3000);
    expect(onEnd).not.toHaveBeenCalled();
  });
});
