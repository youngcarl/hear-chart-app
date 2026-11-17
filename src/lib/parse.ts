/**
 * 解析用户粘贴的数据。每行一个点，支持：
 *   9月,86   9月，86   9月 86   9月<Tab>86   9月:86
 *   86（只有数字时自动命名为“第 n 项”）
 * 无法识别数值的行会被跳过。
 */
export function parseData(text: string): { labels: string[]; values: number[] } {
  const labels: string[] = [];
  const values: number[] = [];
  text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parts = line.split(/[,，\t:：]+|\s+/).filter(Boolean);
      const val = parseFloat(parts[parts.length - 1]);
      if (Number.isNaN(val)) return;
      labels.push(parts.length > 1 ? parts.slice(0, -1).join(' ') : `第${labels.length + 1}项`);
      values.push(val);
    });
  return { labels, values };
}
