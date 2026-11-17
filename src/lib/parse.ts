/**
 * 解析用户粘贴的数据。每行一个点，支持：
 *   9月,86   9月，86   9月 86   9月<Tab>86   9月:86
 *   86（只有数字时自动命名为“第 n 项”）
 *
 * 规则：
 *   - 每行最后一个字段必须是完整、合法的数字（可以有正负号、小数、科学计数法）；
 *     “Infinity”“NaN”“12abc”这样只含一部分数字的内容一律拒绝。
 *   - 至少三段、且末两段都是数字（如“9月,1,2”）时视为非法，避免把拆开的数值读错；
 *     两段的“2024,86”“1,86”仍按“标签,数值”正常读取。
 *   - 第一个非空行的末尾不是数字时，当作表头跳过（Excel 导出的常见情况）。
 *   - 其他无法识别的行记进 errors，并带上原始行号。
 *   - 最多取 200 个有效点，超出后停止读取。
 */

export interface ParseResult {
  labels: string[];
  values: number[];
  errors: string[];
}

/** 单个图表最多支持的数据点数量 */
export const MAX_POINTS = 200;

/** 完整的数字：正负号、小数、科学计数法；不允许前后夹带其他字符 */
const NUM_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseData(text: string): ParseResult {
  const labels: string[] = [];
  const values: number[] = [];
  const errors: string[] = [];

  if (!text || !text.trim()) {
    return { labels, values, errors: ['没有读到数据，请每行输入一个数值，例如“9月,86”。'] };
  }

  const lines = text.split(/\r?\n/);
  let started = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const lineNo = i + 1;

    // 逗号（中英文）、Tab、冒号（中英文）、空格都可以当分隔符
    const parts = raw.split(/[,，\t:：]+|\s+/).filter(Boolean);
    const isNum = (p: string) => NUM_RE.test(p) && Number.isFinite(Number(p));
    const token = parts.length ? parts[parts.length - 1] : '';
    // “9月,1,2”这类把数值拆成几段写法的，直接拒绝，避免误读成后一段
    const splitNumber = parts.length >= 3 && isNum(parts[parts.length - 2]);
    const value = !splitNumber && NUM_RE.test(token) ? Number(token) : NaN;
    const ok = Number.isFinite(value);

    if (!started) {
      started = true;
      // 第一个非空行的末尾不是数字：视为表头，静默跳过
      if (!ok) continue;
    }

    if (!ok) {
      errors.push(`第 ${lineNo} 行：“${raw}” 不是有效的数值。`);
      continue;
    }

    if (values.length >= MAX_POINTS) {
      errors.push(`最多只支持 ${MAX_POINTS} 个数据点，第 ${lineNo} 行及之后的数据已忽略。`);
      break;
    }

    labels.push(parts.length > 1 ? parts.slice(0, -1).join(' ') : `第${values.length + 1}项`);
    values.push(value);
  }

  // 少于两个点时调用方也会检查长度，这里多给一条提示，便于直接显示
  if (values.length < 2) {
    errors.push(`至少需要 2 个数据点，当前只有 ${values.length} 个。`);
  }

  return { labels, values, errors };
}
