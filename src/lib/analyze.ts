import type { Dataset, Stats } from './types';

export const fmt = (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export const typeName = (d: Dataset) => (d.type === 'bar' ? '柱状图' : '折线图');

export function stats(v: number[]): Stats {
  let maxI = 0;
  let minI = 0;
  let bigI = -1;
  let big = 0;
  v.forEach((x, i) => {
    if (x > v[maxI]) maxI = i;
    if (x < v[minI]) minI = i;
  });
  for (let i = 0; i < v.length - 1; i++) {
    const d = v[i + 1] - v[i];
    if (Math.abs(d) > Math.abs(big)) {
      big = d;
      bigI = i;
    }
  }
  return { maxI, minI, bigI, big };
}

/** 用规则生成一句话总结（不依赖大模型，离线可用；以后可以交给大模型润色） */
export function summarize(d: Dataset, s: Stats = stats(d.values)): string {
  const { values: v, labels: L, unit: u } = d;
  const n = v.length;
  const { maxI, minI, bigI, big } = s;
  const range = v[maxI] - v[minI];

  let out =
    `${d.title}，${typeName(d)}，共 ${n} 个数据点。` +
    `最高是${L[maxI]}，${fmt(v[maxI])}${u}；最低是${L[minI]}，${fmt(v[minI])}${u}。`;

  if (d.type === 'line') {
    const delta = v[n - 1] - v[0];
    let trend: string;
    if (maxI > 0 && maxI < n - 1 && v[maxI] - Math.max(v[0], v[n - 1]) > range * 0.3) trend = '整体先升后降';
    else if (minI > 0 && minI < n - 1 && Math.min(v[0], v[n - 1]) - v[minI] > range * 0.3) trend = '整体先降后升';
    else if (Math.abs(delta) < range * 0.1) trend = '整体基本持平';
    else trend = delta > 0 ? '整体上升' : '整体下降';
    out += `${trend}，从${L[0]}的${fmt(v[0])}${u}到${L[n - 1]}的${fmt(v[n - 1])}${u}。`;
    if (bigI >= 0) {
      out += `变化最大的一段是${L[bigI]}到${L[bigI + 1]}，${big > 0 ? '上升' : '下降'}了${fmt(Math.abs(big))}${u}。`;
    }
  } else {
    const sum = v.reduce((a, b) => a + b, 0);
    if (sum > 0) out += `合计 ${fmt(sum)}${u}，最高一项占 ${Math.round((v[maxI] / sum) * 100)}%。`;
  }
  return out;
}

/** 单个数据点的朗读文本 */
export function pointText(d: Dataset, i: number, s: Stats = stats(d.values)): string {
  let t = `${d.labels[i]}，${fmt(d.values[i])}${d.unit}`;
  if (i === s.maxI) t += '，最高点';
  if (i === s.minI) t += '，最低点';
  return t;
}
