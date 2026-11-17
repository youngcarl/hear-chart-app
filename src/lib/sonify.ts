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
    // 浏览器要求用户先有一次点击或按键，音频才能出声
    if (this.ac.state === 'suspended') void this.ac.resume();
    return this.ac;
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

  private tone(f: number, pan: number, at: number, dur: number, wave: OscillatorType) {
    const a = this.ctx();
    const o = a.createOscillator();
    const { g } = this.route(a, o, pan);
    o.type = wave;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.25, at + 0.02);
    g.gain.setValueAtTime(0.25, Math.max(at + 0.02, at + dur - 0.05));
    g.gain.linearRampToValueAtTime(0, at + dur);
    o.start(at);
    o.stop(at + dur + 0.02);
    this.oscs.push(o);
  }

  /** 单个数据点：折线用正弦波，柱状用三角波，听起来有区别 */
  playPoint(values: number[], i: number, type: ChartType) {
    this.stop();
    const a = this.ctx();
    const f = pitchOf(values[i], Math.min(...values), Math.max(...values));
    this.tone(f, panOf(i, values.length), a.currentTime + 0.01, 0.22, type === 'bar' ? 'triangle' : 'sine');
  }

  /** 到头/到尾的提示音 */
  thud() {
    this.stop();
    const a = this.ctx();
    this.tone(110, 0, a.currentTime, 0.12, 'square');
  }

  /**
   * 播放整条数据。折线图是一条连续滑动的音，柱状图是一串分开的音。
   * onStep 会在播到第 i 个点时被调用，用来同步高亮。
   */
  playSeries(values: number[], type: ChartType, step: number, onStep: (i: number) => void) {
    this.stop();
    const a = this.ctx();
    const n = values.length;
    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const t0 = a.currentTime + 0.05;

    if (type === 'line' && n > 1) {
      const o = a.createOscillator();
      const { g, p } = this.route(a, o, -1);
      o.type = 'sine';
      o.frequency.setValueAtTime(pitchOf(values[0], mn, mx), t0);
      p?.pan.setValueAtTime(-1, t0);
      for (let i = 1; i < n; i++) {
        o.frequency.linearRampToValueAtTime(pitchOf(values[i], mn, mx), t0 + i * step);
        p?.pan.linearRampToValueAtTime(panOf(i, n), t0 + i * step);
      }
      const end = t0 + (n - 1) * step + 0.2;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.22, t0 + 0.03);
      g.gain.setValueAtTime(0.22, end - 0.08);
      g.gain.linearRampToValueAtTime(0, end);
      o.start(t0);
      o.stop(end + 0.02);
      this.oscs.push(o);
    } else {
      values.forEach((v, i) => this.tone(pitchOf(v, mn, mx), panOf(i, n), t0 + i * step, step * 0.8, 'triangle'));
    }

    values.forEach((_, i) => {
      this.timers.push(window.setTimeout(() => onStep(i), (i * step + 0.05) * 1000));
    });
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
