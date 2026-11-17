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
  /** 最大值下标 */
  maxI: number;
  /** 最小值下标 */
  minI: number;
  /** 变化最大的一段的起点下标，没有则为 -1 */
  bigI: number;
  /** 变化最大的一段的变化量（带正负） */
  big: number;
}
