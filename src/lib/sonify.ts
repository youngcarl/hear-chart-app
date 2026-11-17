import type { ChartType } from './types';

/** 声音映射：最低值 = 220Hz，最高值 = 220Hz × 2^OCTAVES（两个八度，880Hz） */
export const LOW_HZ = 220;
export const OCTAVES = 2;

/** 按音程（对数）映射，人耳听起来音高变化是均匀的 */
export function pitchOf(v: number, min: number, max: number): number {
  const t = max === min ? 0.5 : (v - min) / (max - min);
  return LOW_HZ * 2 ** (OCTAVES * t);
}

/** 左右声道：第一个点在最左（-1），最后一个点在最右（+1） */
export const panOf = (i: number, n: number) => (n < 2 ? 0 : (i / (n - 1)) * 2 - 1);

/** 非有限值按 0 处理，避免传给 AudioParam 抛错 */
const safe = (v: number) => (Number.isFinite(v) ? v : 0);

type AudioCtor = typeof AudioContext;

/** 负责全部发声；与 React 无关，方便单独测试或移植 */
export class Sonifier {
  private ac: AudioContext | null = null;
  private oscs: OscillatorNode[] = [];
  private timers: number[] = [];

  private ctx(): AudioContext {
    if (!this.ac) {
      const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
      const C = w.AudioContext ?? w.webkitAudioContext;
      if (!C) throw new Error('当前浏览器不支持 Web Audio');
      this.ac = new C();
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
    return this.ac;
  }

  /** 在首次用户手势里调用，iOS 才允许之后自动发声 */
  unlock() {
    try {
      this.ctx();
    } catch {
      /* 浏览器不支持时静默，由界面提示 */
    }
  }

  private route(a: AudioContext, o: OscillatorNode, pan: number) {
    const g = a.createGain();
    o.connect(g);
    let p: StereoPannerNode | null = null;
    if (typeof a.createStereoPanner === 'function') {
      p = a.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(a.destination);
    } else {
      g.connect(a.destination);
    }
    return { g, p };
  }

  private tone(
    f: number,
    pan: number,
    at: number,
    dur: number,
    wave: OscillatorType,
    gain = 0.25,
  ) {
    const a = this.ctx();
    const o = a.createOscillator();
    const { g } = this.route(a, o, pan);
    o.type = wave;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.02);
    g.gain.setValueAtTime(gain, Math.max(at + 0.02, at + dur - 0.05));
    g.gain.linearRampToValueAtTime(0, at + dur);
    o.start(at);
    o.stop(at + dur + 0.02);
    this.oscs.push(o);
  }

  /** 单个数据点：折线用正弦波，柱状用三角波，听起来有区别 */
  playPoint(values: number[], i: number, type: ChartType) {
    this.stop();
    const a = this.ctx();
    const vals = values.map(safe);
    const f = pitchOf(vals[i], Math.min(...vals), Math.max(...vals));
    this.tone(f, panOf(i, vals.length), a.currentTime + 0.01, 0.22, type === 'bar' ? 'triangle' : 'sine');
  }

  /** 先播最低值，再播最高值，帮助建立“音高 → 数值”的参照 */
  playReference(values: number[]) {
    this.stop();
    const a = this.ctx();
    const vals = values.map(safe);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const t0 = a.currentTime + 0.03;
    this.tone(pitchOf(mn, mn, mx), 0, t0, 0.4, 'sine');
    this.tone(pitchOf(mx, mn, mx), 0, t0 + 0.7, 0.4, 'sine');
  }

  /** 到头/到尾的提示音 */
  thud() {
    this.stop();
    const a = this.ctx();
    this.tone(110, 0, a.currentTime, 0.12, 'square');
  }

  /**
   * 播放整条数据。折线图是一条连续滑动的音，柱状图是一串分开的音。
   * onStep 在播到第 i 个点时调用（用来同步高亮），onEnd 在整条播完后调用。
   * startIndex 用于从当前点继续播放。
   */
  playSeries(
    values: number[],
    type: ChartType,
    step: number,
    onStep: (i: number) => void,
    onEnd?: () => void,
    startIndex = 0,
  ) {
    this.stop();
    const n = values.length;
    if (!n) return;
    const vals = values.map(safe);
    const a = this.ctx();
    const start = Math.max(0, Math.min(startIndex, n - 1));
    const count = n - start;
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const t0 = a.currentTime + 0.05;

    if (type === 'line' && count > 1) {
      const o = a.createOscillator();
      const { g, p } = this.route(a, o, panOf(start, n));
      o.type = 'sine';
      o.frequency.setValueAtTime(pitchOf(vals[start], mn, mx), t0);
      p?.pan.setValueAtTime(panOf(start, n), t0);
      for (let i = start + 1; i < n; i++) {
        o.frequency.linearRampToValueAtTime(pitchOf(vals[i], mn, mx), t0 + (i - start) * step);
        p?.pan.linearRampToValueAtTime(panOf(i, n), t0 + (i - start) * step);
      }
      const end = t0 + (count - 1) * step + 0.2;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.22, t0 + 0.03);
      g.gain.setValueAtTime(0.22, end - 0.08);
      g.gain.linearRampToValueAtTime(0, end);
      o.start(t0);
      o.stop(end + 0.02);
      this.oscs.push(o);
    } else {
      // 单点折线仍用正弦，与折线的音色保持一致
      const wave: OscillatorType = type === 'bar' ? 'triangle' : 'sine';
      for (let i = start; i < n; i++) {
        this.tone(pitchOf(vals[i], mn, mx), panOf(i, n), t0 + (i - start) * step, step * 0.8, wave);
      }
    }

    // 最高点和最低点加一个短促的高八度“叮”，不靠音高猜也能听出极值
    if (mn !== mx) {
      for (const i of [vals.indexOf(mx), vals.indexOf(mn)]) {
        if (i < start) continue;
        this.tone(pitchOf(vals[i], mn, mx) * 2, panOf(i, n), t0 + (i - start) * step + 0.05, 0.09, 'sine', 0.12);
      }
    }

    // 数据跨越 0 时，在过零处加一个轻微的“嗒”
    if (mn < 0 && mx > 0) {
      for (let i = Math.max(1, start + 1); i < n; i++) {
        const prev = vals[i - 1];
        const cur = vals[i];
        if ((prev < 0 && cur >= 0) || (prev > 0 && cur <= 0)) {
          this.tone(1500, panOf(i, n), t0 + (i - start) * step, 0.04, 'sine', 0.06);
        }
      }
    }

    for (let i = start; i < n; i++) {
      this.timers.push(window.setTimeout(() => onStep(i), ((i - start) * step + 0.05) * 1000));
    }
    if (onEnd) {
      this.timers.push(
        window.setTimeout(onEnd, ((count - 1) * step + 0.35) * 1000),
      );
    }
  }

  stop() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.oscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* 已经停了 */
      }
    });
    this.oscs = [];
  }
}
