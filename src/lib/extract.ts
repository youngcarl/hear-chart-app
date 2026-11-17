import type { ChartType } from './types';

/**
 * 【预留接口】上传图表截图 → 云函数调用多模态大模型 → 返回结构化数据。
 *
 * 目前没有实现。接入步骤见 README「预留：截图识别」：
 *   1. 在 Qoder Sites 的函数目录里实现 EXTRACT_ENDPOINT
 *   2. 模型 API Key 只放在函数的环境变量里，绝不写进前端
 *   3. 函数里做调用次数上限，失败时前端退回到“粘贴数据 / 示例图表”
 *   4. 把 EXTRACT_ENABLED 改成 true
 */
export const EXTRACT_ENABLED = false;
export const EXTRACT_ENDPOINT = '/api/extract-chart';

/** 云函数应返回的数据格式 */
export interface ExtractResult {
  title?: string;
  type: ChartType;
  unit?: string;
  labels: string[];
  values: number[];
}

export async function extractFromImage(file: File): Promise<ExtractResult> {
  if (!EXTRACT_ENABLED) throw new Error('截图识别还没有接入');
  const body = new FormData();
  body.append('image', file);
  const res = await fetch(EXTRACT_ENDPOINT, { method: 'POST', body });
  if (!res.ok) throw new Error(`识别失败（${res.status}）`);
  const data = (await res.json()) as ExtractResult;
  if (!Array.isArray(data.values) || data.values.length < 2 || data.labels?.length !== data.values.length) {
    throw new Error('识别结果格式不对');
  }
  return data;
}
