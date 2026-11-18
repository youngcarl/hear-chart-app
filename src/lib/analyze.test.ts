import { describe, expect, it } from 'vitest';
import { briefSummary, fmt, fmtCn, pointText, stats, summarize, trendOf, typeName } from './analyze';
import type { ChartType, Dataset } from './types';

const ds = (values: number[], type: ChartType = 'line', labels?: string[]): Dataset => ({
  id: 'test',
  short: '测试',
  title: '测试图表',
  type,
  unit: '元',
  labels: labels ?? values.map((_, i) => `${i + 1}月`),
  values,
});

describe('fmt / fmtCn', () => {
  it('fmt 保持中文千分位、最多两位小数', () => {
    expect(fmt(86)).toBe('86');
    expect(fmt(125000)).toBe('125,000');
    expect(fmt(1234.567)).toBe('1,234.57');
  });

  it('fmtCn 把小数值原样交给 fmt', () => {
    expect(fmtCn(86)).toBe('86');
    expect(fmtCn(1234.5)).toBe('1,234.5');
    expect(fmtCn(0)).toBe('0');
  });

  it('fmtCn 用万和亿缩写，并去掉多余的 .0', () => {
    expect(fmtCn(125000)).toBe('12.5万');
    expect(fmtCn(120000)).toBe('12万');
    expect(fmtCn(10000)).toBe('1万');
    expect(fmtCn(300000000)).toBe('3亿');
    expect(fmtCn(123456789)).toBe('1.2亿');
    expect(fmtCn(99999999)).toBe('1亿');
  });

  it('fmtCn 负数读作“负 X”', () => {
    expect(fmtCn(-3)).toBe('负 3');
    expect(fmtCn(-125000)).toBe('负 12.5万');
    expect(fmtCn(-0.5)).toBe('负 0.5');
  });
});

describe('typeName', () => {
  it('区分折线图和柱状图', () => {
    expect(typeName(ds([1, 2], 'line'))).toBe('折线图');
    expect(typeName(ds([1, 2], 'bar'))).toBe('柱状图');
  });
});

describe('stats', () => {
  it('所有数值相同时：全距为 0，没有高峰，波动平稳', () => {
    const s = stats([42, 42, 42, 42]);
    expect(s.maxI).toBe(0);
    expect(s.minI).toBe(0);
    expect(s.big).toBe(0);
    expect(s.peaks).toEqual([]);
    expect(s.volatility).toBe('steady');
  });

  it('单调上升：最值在两端，没有内部高峰', () => {
    const s = stats([10, 20, 30, 40]);
    expect(s.maxI).toBe(3);
    expect(s.minI).toBe(0);
    expect(s.bigI).toBe(0);
    expect(s.big).toBe(10);
    expect(s.peaks).toEqual([]);
    expect(s.volatility).toBe('steady');
  });

  it('先升后降：识别出一个明显高峰', () => {
    const s = stats([10, 40, 25, 12]);
    expect(s.maxI).toBe(1);
    expect(s.minI).toBe(0);
    expect(s.peaks).toEqual([1]);
  });

  it('只有两个点时没有高峰，波动为平稳', () => {
    const s = stats([5, 9]);
    expect(s.maxI).toBe(1);
    expect(s.minI).toBe(0);
    expect(s.bigI).toBe(0);
    expect(s.big).toBe(4);
    expect(s.peaks).toEqual([]);
    expect(s.volatility).toBe('steady');
  });

  it('最值取第一次出现的位置', () => {
    const s = stats([10, 30, 10, 30, 5]);
    expect(s.maxI).toBe(1);
    expect(s.minI).toBe(4);
  });

  it('全负数也能正确统计', () => {
    const s = stats([-50, -30, -40]);
    expect(s.maxI).toBe(1);
    expect(s.minI).toBe(0);
    expect(s.peaks).toEqual([1]);
  });

  it('含小数时统计正确', () => {
    const s = stats([1.5, 2.25, 1.75]);
    expect(s.maxI).toBe(1);
    expect(s.minI).toBe(0);
    expect(s.peaks).toEqual([1]);
  });

  it('忽略小抖动，只保留真正的高峰', () => {
    const s = stats([10, 10.5, 10, 30, 10]);
    expect(s.peaks).toEqual([3]);
  });

  it('多个高峰按从左到右排列', () => {
    const s = stats([10, 50, 10, 60, 10]);
    expect(s.peaks).toEqual([1, 3]);
  });

  it('平台型峰值只算一个点', () => {
    expect(stats([1, 5, 5, 1]).peaks).toEqual([1]);
  });

  it('波动分级：平稳 / 明显 / 很大', () => {
    expect(stats([10, 11, 13, 16, 20]).volatility).toBe('steady');
    expect(stats([10, 30, 25, 45, 35, 50, 45]).volatility).toBe('moderate');
    expect(stats([10, 20, 10, 20, 10]).volatility).toBe('high');
  });

  it('空数组不抛错', () => {
    const s = stats([]);
    expect(s.peaks).toEqual([]);
    expect(s.volatility).toBe('steady');
    expect(s.bigI).toBe(-1);
  });
});

describe('summarize', () => {
  it('所有数值相同时说明没有变化，绝不出现“下降”', () => {
    const text = summarize(ds([42, 42, 42, 42]));
    expect(text).toContain('所有数值都是 42元，没有变化。');
    expect(text).not.toContain('下降');
    expect(text).not.toContain('上升');
  });

  it('折线图趋势：先升后降', () => {
    expect(summarize(ds([10, 40, 25, 12]))).toContain('整体先升后降');
  });

  it('折线图趋势：先降后升', () => {
    expect(summarize(ds([40, 10, 25, 38]))).toContain('整体先降后升');
  });

  it('折线图趋势：上升与下降', () => {
    expect(summarize(ds([10, 20, 30, 40]))).toContain('整体上升');
    expect(summarize(ds([40, 30, 20, 10]))).toContain('整体下降');
  });

  it('折线图趋势：基本持平', () => {
    expect(summarize(ds([100, 101, 100, 101]))).toContain('整体基本持平');
  });

  it('首值不为 0 时给出首尾变化百分比（四舍五入到整数）', () => {
    expect(summarize(ds([100, 133]))).toContain('比开始时增长了 33%');
    expect(summarize(ds([100, 50]))).toContain('比开始时下降了 50%');
    expect(summarize(ds([100, 133.4]))).toContain('比开始时增长了 33%');
  });

  it('首值为 0 时不强行算百分比', () => {
    expect(summarize(ds([0, 50, 20]))).not.toContain('比开始时');
  });

  it('高峰最多列 3 个，措辞自然', () => {
    const two = summarize(ds([10, 50, 10, 60, 10], 'line', ['一月', '二月', '三月', '四月', '五月']));
    expect(two).toContain('有 2 个明显的高峰，分别在 二月 和 四月。');

    const one = summarize(ds([10, 50, 10, 5]));
    expect(one).toContain('有 1 个明显的高峰，在 2月。');

    const many = summarize(ds([10, 30, 10, 30, 10, 30, 10, 30, 10]));
    expect(many).toContain('有 4 个明显的高峰');
    expect(many).toContain('等');
  });

  it('补充波动程度', () => {
    expect(summarize(ds([10, 11, 13, 16, 20]))).toContain('整体比较平稳');
    expect(summarize(ds([10, 30, 25, 45, 35, 50, 45]))).toContain('有明显波动');
    expect(summarize(ds([10, 20, 10, 20, 10]))).toContain('波动很大');
  });

  it('柱状图输出合计与占比', () => {
    const text = summarize(ds([10, 20, 30], 'bar'));
    expect(text).toContain('合计 60元');
    expect(text).toContain('最高一项占 50%');
  });

  it('柱状图全为负数时只报净合计，不报普通占比', () => {
    const text = summarize(ds([-5, -3, -2], 'bar'));
    expect(text).toContain('含负值，净合计 负 10元');
    expect(text).not.toContain('占 ');
    expect(text).not.toContain('-');
  });

  it('柱状图混合正负值时用净合计，不用普通占比', () => {
    const text = summarize(ds([-5, 10], 'bar'));
    expect(text).toContain('含负值，净合计 5元');
    expect(text).not.toContain('占');

    const zero = summarize(ds([-5, 5], 'bar'));
    expect(zero).toContain('净合计 0元');
    expect(zero).not.toContain('占');
  });

  it('柱状图全零时说明没有变化', () => {
    const text = summarize(ds([0, 0, 0], 'bar'));
    expect(text).toContain('所有数值都是 0元，没有变化');
    expect(text).not.toContain('占');
  });

  it('大数字用万 / 亿朗读', () => {
    const text = summarize(ds([1000, 125000]));
    expect(text).toContain('12.5万');
  });
});

describe('pointText', () => {
  it('包含标签、数值和最高 / 最低点标记', () => {
    const d = ds([10, 125000, 60]);
    expect(pointText(d, 0)).toBe('1月，10元，最低点');
    expect(pointText(d, 1)).toBe('2月，12.5万元，最高点');
    expect(pointText(d, 2)).toBe('3月，60元');
  });
});

describe('trendOf / briefSummary', () => {
  it('识别常见走向', () => {
    expect(trendOf(ds([1, 5, 3]))).toBe('整体先升后降');
    expect(trendOf(ds([5, 1, 3]))).toBe('整体先降后升');
    expect(trendOf(ds([1, 2, 3]))).toBe('整体上升');
    expect(trendOf(ds([100, 101, 100]))).toBe('整体基本持平');
    expect(trendOf(ds([7, 7, 7]))).toBe('没有变化');
  });

  it('短总结只讲最值和走向，适合导览朗读', () => {
    const text = briefSummary(ds([10, 30, 20]));
    expect(text).toBe('测试图表，最高2月30元，最低1月10元。整体先升后降。');
    expect(text).not.toContain('变化最大');
  });

  it('柱状图不带走势描述', () => {
    const text = briefSummary(ds([10, 30, 20], 'bar'));
    expect(text).toBe('测试图表，最高2月30元，最低1月10元。');
  });
});
