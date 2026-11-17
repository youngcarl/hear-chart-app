export type ChartType = 'line' | 'bar';

/** 一组可听的数据：目前只支持单系列 */
export interface Dataset {
  id: string;
  /** 标签页上的短名称 */
  short: string;
  title: string;
  type: ChartType;
  unit: string;
  labels: string[];
  values: number[];
}

export interface Stats {
  /** 最大值下标（第一次出现的位置） */
  maxI: number;
  /** 最小值下标（第一次出现的位置） */
  minI: number;
  /** 变化最大的一段的起点下标，没有则为 -1 */
  bigI: number;
  /** 变化最大的一段的变化量（带正负） */
  big: number;
  /** 明显的内部高峰（局部极大点）下标，按从左到右排列 */
  peaks: number[];
  /** 波动程度：相邻变化量的标准差相对全距的大小 */
  volatility: 'steady' | 'moderate' | 'high';
}
