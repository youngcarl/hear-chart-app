import type { Dataset, Stats } from './types';

/** 屏幕上的数值：中文千分位，最多保留两位小数 */
export const fmt = (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

/** 保留 1 位小数并去掉多余的 .0：12.0 → 12，12.5 → 12.5 */
const oneDecimal = (v: number) => String(Math.round(v * 10) / 10);

/**
 * 朗读 / 大字号显示用的数值：大数缩写为“万 / 亿”，负数读作“负 X”。
 *   125000 → 12.5万  300000000 → 3亿  -3 → 负 3  86 → 86
 */
export function fmtCn(v: number): string {
  if (!Number.isFinite(v)) return '0';
  if (v < 0) return `负 ${fmtCn(-v)}`;
  if (v >= 1e8) return `${oneDecimal(v / 1e8)}亿`;
  if (v >= 1e4) {
    const wan = Math.round((v / 1e4) * 10) / 10;
    // 四舍五入后进位到 10000万 时改用“亿”，避免出现“10000万”
    return wan >= 1e4 ? `${oneDecimal(v / 1e8)}亿` : `${wan}万`;
  }
  return fmt(v);
}

export const typeName = (d: Dataset) => (d.type === 'bar' ? '柱状图' : '折线图');

/** 波动程度的判定阈值：相邻变化量标准差 / 全距 */
const STEADY_LIMIT = 0.15;
const HIGH_LIMIT = 0.35;
/** 高峰至少要比两侧低谷高出全距的这个比例，用来过滤小抖动 */
const PEAK_LIMIT = 0.15;

/**
 * 统计一组数值的基本特征。
 * 全部数值相同时（全距为 0）：没有高峰，波动程度为 steady。
 */
export function stats(v: number[]): Stats {
  const empty: Stats = { maxI: 0, minI: 0, bigI: -1, big: 0, peaks: [], volatility: 'steady' };
  const n = v.length;
  if (!n) return empty;

  // 单次遍历取最值和最大变化段；用 > / < 保证取到第一次出现的位置
  let maxI = 0;
  let minI = 0;
  let bigI = -1;
  let big = 0;
  for (let i = 0; i < n; i++) {
    if (v[i] > v[maxI]) maxI = i;
    if (v[i] < v[minI]) minI = i;
    if (i > 0) {
      const diff = v[i] - v[i - 1];
      if (Math.abs(diff) > Math.abs(big)) {
        big = diff;
        bigI = i - 1;
      }
    }
  }

  const range = v[maxI] - v[minI];
  if (range <= 0) return { ...empty, maxI, minI, bigI, big };

  // 高峰：内部局部极大点，且比左右两侧的低谷都高出全距的 15% 以上
  const threshold = range * PEAK_LIMIT;
  const peaks: number[] = [];
  let boundary = 0; // 上一次考察过的位置，用来限定“左侧低谷”的范围
  for (let i = 1; i < n - 1; i++) {
    if (!(v[i] > v[i - 1] && v[i] >= v[i + 1])) continue;
    let leftValley = v[boundary];
    for (let j = boundary + 1; j < i; j++) if (v[j] < leftValley) leftValley = v[j];
    let rightValley = v[i + 1];
    for (let j = i + 2; j < n; j++) if (v[j] < rightValley) rightValley = v[j];
    if (v[i] - leftValley >= threshold && v[i] - rightValley >= threshold) peaks.push(i);
    boundary = i;
  }

  // 波动程度：相邻变化量的标准差 / 全距
  let volatility: Stats['volatility'] = 'steady';
  if (n > 1) {
    const count = n - 1;
    let mean = 0;
    for (let i = 1; i < n; i++) mean += v[i] - v[i - 1];
    mean /= count;
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const d = v[i] - v[i - 1] - mean;
      acc += d * d;
    }
    const ratio = Math.sqrt(acc / count) / range;
    volatility = ratio < STEADY_LIMIT ? 'steady' : ratio < HIGH_LIMIT ? 'moderate' : 'high';
  }

  return { maxI, minI, bigI, big, peaks, volatility };
}

const VOLATILITY_TEXT: Record<Stats['volatility'], string> = {
  steady: '整体比较平稳',
  moderate: '有明显波动',
  high: '波动很大',
};

const labelOf = (labels: string[], i: number) => labels[i] || `第${i + 1}项`;

/** 高峰的播报文本，最多列出 3 个 */
function describePeaks(peaks: number[], labels: string[]): string {
  if (!peaks.length) return '';
  const names = peaks.slice(0, 3).map((i) => labelOf(labels, i));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join('、')} 和 ${names[names.length - 1]}`;
  if (names.length === 1) return `有 1 个明显的高峰，在 ${list}。`;
  const more = peaks.length > names.length ? ' 等' : '';
  return `有 ${peaks.length} 个明显的高峰，分别在 ${list}${more}。`;
}

/** 折线的整体走向：先升后降 / 先降后升 / 上升 / 下降 / 持平 */
export function trendOf(d: Dataset, s: Stats = stats(d.values)): string {
  const { values: v } = d;
  const n = v.length;
  const { maxI, minI } = s;
  const range = v[maxI] - v[minI];
  if (n < 2 || range <= 0) return '没有变化';

  const delta = v[n - 1] - v[0];
  const level = Math.max(Math.abs(v[maxI]), Math.abs(v[minI]));
  // 起伏不到数值量级的 2%：再抖也只是持平，不能报成先升后降
  if (level > 0 && range <= level * 0.02) return '整体基本持平';
  if (maxI > 0 && maxI < n - 1 && v[maxI] - Math.max(v[0], v[n - 1]) > range * 0.3) return '整体先升后降';
  if (minI > 0 && minI < n - 1 && Math.min(v[0], v[n - 1]) - v[minI] > range * 0.3) return '整体先降后升';
  if (Math.abs(delta) < range * 0.1) return '整体基本持平';
  return delta > 0 ? '整体上升' : '整体下降';
}

/** 导览用的短总结：只讲最值和走向，控制在十几秒能读完 */
export function briefSummary(d: Dataset, s: Stats = stats(d.values)): string {
  const { values: v, labels: L, unit: u } = d;
  if (!v.length) return `${d.title}，暂时没有数据。`;
  const extreme = `最高${labelOf(L, s.maxI)}${fmtCn(v[s.maxI])}${u}，最低${labelOf(L, s.minI)}${fmtCn(v[s.minI])}${u}。`;
  return d.type === 'line' ? `${d.title}，${extreme}${trendOf(d, s)}。` : `${d.title}，${extreme}`;
}

/** 用规则生成一句话总结（不依赖大模型，离线可用；以后可以交给大模型润色） */
export function summarize(d: Dataset, s: Stats = stats(d.values)): string {
  const { values: v, labels: L, unit: u } = d;
  const n = v.length;
  if (!n) return `${d.title}，${typeName(d)}，暂时没有数据。`;

  const { maxI, minI, bigI, big, peaks, volatility } = s;
  const range = v[maxI] - v[minI];
  const head = `${d.title}，${typeName(d)}，共 ${n} 个数据点。`;

  // 全距为 0 说明所有数值相同：不能出现“下降”之类的趋势描述
  if (range <= 0) {
    return `${head}所有数值都是 ${fmtCn(v[0])}${u}，没有变化。`;
  }

  let out =
    head +
    `最高是${labelOf(L, maxI)}，${fmtCn(v[maxI])}${u}；最低是${labelOf(L, minI)}，${fmtCn(v[minI])}${u}。`;

  if (d.type === 'line') {
    const delta = v[n - 1] - v[0];
    out += `${trendOf(d, s)}，从${labelOf(L, 0)}的${fmtCn(v[0])}${u}到${labelOf(L, n - 1)}的${fmtCn(v[n - 1])}${u}`;

    if (v[0] !== 0) {
      const pct = Math.round((delta / Math.abs(v[0])) * 100);
      if (pct === 0) out += '，和开始时基本一样';
      else if (pct > 0) out += `，比开始时增长了 ${pct}%`;
      else out += `，比开始时下降了 ${Math.abs(pct)}%`;
    }
    out += '。';

    if (bigI >= 0 && big !== 0) {
      out +=
        `变化最大的一段是${labelOf(L, bigI)}到${labelOf(L, bigI + 1)}，` +
        `${big > 0 ? '上升' : '下降'}了${fmtCn(Math.abs(big))}${u}。`;
    }

    out += describePeaks(peaks, L);
  } else {
    // 柱状图：合计与占比只在合计为正时有意义，负数场景不输出怪话
    const sum = v.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      out += `合计 ${fmtCn(sum)}${u}`;
      if (v[maxI] > 0) out += `，最高一项占 ${Math.round((v[maxI] / sum) * 100)}%`;
      out += '。';
    }
  }

  out += `${VOLATILITY_TEXT[volatility]}。`;
  return out;
}

/** 单个数据点的朗读文本 */
export function pointText(d: Dataset, i: number, s: Stats = stats(d.values)): string {
  let t = `${labelOf(d.labels, i)}，${fmtCn(d.values[i])}${d.unit}`;
  if (i === s.maxI) t += '，最高点';
  if (i === s.minI) t += '，最低点';
  return t;
}
