import type { ChartType } from './types';

/** 声音映射：最低值 = 220Hz，最高值 = 220Hz × 2^OCTAVES（两个八度，880Hz） */
export const LOW_HZ = 220;
export const OCTAVES = 2;

/** 参考音阶段占用整条之前的秒数（最低音 0.4s，0.7s 后最高音 0.4s，再留一点空隙） */
export const REF_LEAD = 1.2;

/** 播放时钟的轮询间隔（毫秒） */
const TICK_MS = 60;

/** 按音程（对数）映射，人耳听起来音高变化是均匀的 */
export function pitchOf(v: number, min: number, max: number): number {
  const t = max === min ? 0.5 : (v - min) / (max - min);
  return LOW_HZ * 2 ** (OCTAVES * t);
}

/** 左右声道：第一个点在最左（-1），最后一个点在最右（+1） */
export const panOf = (i: number, n: number) => (n < 2 ? 0 : (i / (n - 1)) * 2 - 1);

/** 非有限值按 0 处理，避免传给 AudioParam 抛错 */
const safe = (v: number) => (Number.isFinite(v) ? v : 0);

/** 下标取整并夹在 [0, n-1]，空数据返回 -1 */
function clampIndex(i: number, n: number): number {
  if (!Number.isFinite(i) || n < 1) return -1;
  return Math.max(0, Math.min(Math.floor(i), n - 1));
}

/**
 * 播放时钟 → 当前数据点下标。elapsed 从整条第一个音算起，参考音阶段为负数，
 * 这时进度还停在起始点；step 非法时不前进。
 */
export function pointIndexAt(elapsed: number, startIndex: number, step: number, n: number): number {
  const start = clampIndex(startIndex, n);
  if (start < 0) return -1;
  if (!Number.isFinite(elapsed) || elapsed < 0 || !(step > 0)) return start;
  return clampIndex(start + Math.floor(elapsed / step), n);
}

/** 从整条第一个音算起，什么时候可以宣布播完（最后一个点的尾音也要留在范围内） */
export function seriesEndAt(startIndex: number, n: number, step: number): number {
  const start = clampIndex(startIndex, n);
  if (start < 0) return 0;
  return (n - 1 - start) * step + Math.max(0.35, step * 0.8 + 0.1);
}

type AudioCtor = typeof AudioContext;

interface Series {
  step: number;
  /** 本次播放（或续播）的第一个点 */
  startIndex: number;
  n: number;
  /** 整条第一个音在 AudioContext 时间轴上的绝对位置 */
  t0: number;
  onStep: (i: number) => void;
  onEnd?: () => void;
  /** 最近一次报给界面的进度，-1 表示还没报过 */
  last: number;
  timer: number;
}

/**
 * 负责全部发声；与 React 无关，方便单独测试或移植。
 * 整条播放只依赖 AudioContext 的时钟：声音按绝对时间排布，高亮由同一个时钟轮询得出，
 * 所以暂停（冻结时钟）时两者一起停，后台节流后也能按实际时间校准。
 */
export class Sonifier {
  private ac: AudioContext | null = null;
  private oscs: OscillatorNode[] = [];
  private series: Series | null = null;
  private frozen = false;

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
    const vals = values.map(safe);
    if (!vals.length) return;
    const a = this.ctx();
    this.scheduleReference(Math.min(...vals), Math.max(...vals), a.currentTime + 0.03);
  }

  /** 排好两个参考音，返回整条应该开始的时间 */
  private scheduleReference(mn: number, mx: number, at: number): number {
    this.tone(pitchOf(mn, mn, mx), 0, at, 0.4, 'sine');
    this.tone(pitchOf(mx, mn, mx), 0, at + 0.7, 0.4, 'sine');
    return at + REF_LEAD;
  }

  /** 到头/到尾的提示音 */
  thud() {
    this.stop();
    const a = this.ctx();
    this.tone(110, 0, a.currentTime, 0.12, 'square');
  }

  /**
   * 播放整条数据。折线图是一条连续滑动的音，柱状图是一串分开的音。
   * onStep 在时钟走到第 i 个点时调用（用来同步高亮），onEnd 在整条播完后调用。
   * startIndex 用于从中间继续，refTone 为真时先播最低音和最高音。
   */
  playSeries(
    values: number[],
    type: ChartType,
    step: number,
    onStep: (i: number) => void,
    onEnd?: () => void,
    startIndex = 0,
    refTone = false,
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
    const first = a.currentTime + 0.05;
    const t0 = refTone ? this.scheduleReference(mn, mx, first) : first;

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

    const s: Series = { step, startIndex: start, n, t0, onStep, onEnd, last: -1, timer: 0 };
    this.series = s;
    s.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  /**
   * 暂停：冻结 AudioContext 时钟，声音和高亮一起停在当前进度并保留。
   * 返回当前进度，inReference 表示还停在参考音阶段；没有可暂停的播放时返回 null。
   */
  pause(): { index: number; inReference: boolean } | null {
    const s = this.series;
    const a = this.ac;
    if (!s || !a) return null;
    window.clearInterval(s.timer);
    s.timer = 0;
    const elapsed = a.currentTime - s.t0;
    this.frozen = true;
    void a.suspend();
    return { index: pointIndexAt(elapsed, s.startIndex, s.step, s.n), inReference: elapsed < 0 };
  }

  /** 续播：解冻时钟，从暂停处继续，不重排已排好的声音 */
  resume() {
    const s = this.series;
    const a = this.ac;
    if (!s || !a || !this.frozen) return;
    this.frozen = false;
    void a.resume();
    s.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  /** 只认播放时钟：一个周期最多报一次进度，节流后不会把落后的点一次性补播 */
  private tick() {
    const s = this.series;
    const a = this.ac;
    if (!s || !a) return;
    const elapsed = a.currentTime - s.t0;
    // 参考音阶段还没进整条，进度保持不动
    if (elapsed < 0) return;
    const i = pointIndexAt(elapsed, s.startIndex, s.step, s.n);
    if (i !== s.last) {
      s.last = i;
      s.onStep(i);
    }
    if (elapsed >= seriesEndAt(s.startIndex, s.n, s.step)) this.finish();
  }

  private finish() {
    const s = this.series;
    if (!s) return;
    this.series = null;
    if (s.timer) window.clearInterval(s.timer);
    // 排好的声音到时间自己结束，这里只丢掉引用
    this.oscs = [];
    s.onEnd?.();
  }

  /** 停止：作废整条播放与暂停状态，解冻时钟，立即掐掉正在发的声音 */
  stop() {
    const s = this.series;
    if (s?.timer) window.clearInterval(s.timer);
    this.series = null;
    this.oscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* 已经停了 */
      }
    });
    this.oscs = [];
    if (this.frozen) {
      this.frozen = false;
      if (this.ac) void this.ac.resume();
    }
  }
}
