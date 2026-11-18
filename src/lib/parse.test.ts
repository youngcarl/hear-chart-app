import { describe, expect, it } from 'vitest';
import { MAX_POINTS, parseData } from './parse';

describe('parseData 分隔符', () => {
  it('英文逗号', () => {
    const r = parseData('9月,86\n10月,92');
    expect(r.labels).toEqual(['9月', '10月']);
    expect(r.values).toEqual([86, 92]);
    expect(r.errors).toEqual([]);
  });

  it('中文逗号', () => {
    const r = parseData('9月，86\n10月，92');
    expect(r.labels).toEqual(['9月', '10月']);
    expect(r.values).toEqual([86, 92]);
    expect(r.errors).toEqual([]);
  });

  it('Tab', () => {
    const r = parseData('9月\t86\n10月\t92');
    expect(r.labels).toEqual(['9月', '10月']);
    expect(r.values).toEqual([86, 92]);
  });

  it('空格（含多个连续空格）', () => {
    const r = parseData('9月 86\n10月   92');
    expect(r.labels).toEqual(['9月', '10月']);
    expect(r.values).toEqual([86, 92]);
  });

  it('中英文冒号', () => {
    expect(parseData('9月:86\n10月:92').values).toEqual([86, 92]);
    expect(parseData('9月：86\n10月：92').values).toEqual([86, 92]);
  });

  it('分隔符两侧的空格只是排版', () => {
    const r = parseData('2024 , 86\n2023 ,92');
    expect(r.labels).toEqual(['2024', '2023']);
    expect(r.values).toEqual([86, 92]);
    expect(r.errors).toEqual([]);
  });

  it('只有数字时自动命名', () => {
    const r = parseData('86\n92\n100');
    expect(r.labels).toEqual(['第1项', '第2项', '第3项']);
    expect(r.values).toEqual([86, 92, 100]);
  });
});

describe('parseData 表头', () => {
  it('首个非空行末尾不是数字时当表头跳过，不报错', () => {
    const r = parseData('月份,销量\n9月,86\n10月,92');
    expect(r.labels).toEqual(['9月', '10月']);
    expect(r.values).toEqual([86, 92]);
    expect(r.errors).toEqual([]);
  });

  it('首行是有效数据时不跳行', () => {
    const r = parseData('9月,86\n月份,销量');
    expect(r.labels).toEqual(['9月']);
    expect(r.values).toEqual([86]);
    expect(r.errors[0]).toContain('第 2 行');
  });

  it('表头可以带数字年份', () => {
    const r = parseData('2024年,销量\n9月,86\n10月,92');
    expect(r.labels).toEqual(['9月', '10月']);
    expect(r.values).toEqual([86, 92]);
    expect(r.errors).toEqual([]);
  });

  it('首行缺测/坏值不再当表头：周一,坏行 报第 1 行', () => {
    const r = parseData('周一,坏行\n周二,14\n周三,15');
    expect(r.labels).toEqual(['周二', '周三']);
    expect(r.values).toEqual([14, 15]);
    expect(r.errors).toEqual(['第 1 行：“周一,坏行” 不是有效的数值。']);
  });

  it('显式勾选首行是表头时，任意内容的首行都跳过', () => {
    const r = parseData('周一,坏行\n9月,86\n10月,92', { header: true });
    expect(r.labels).toEqual(['9月', '10月']);
    expect(r.values).toEqual([86, 92]);
    expect(r.errors).toEqual([]);
  });

  it('明确表头词（中英文、单列）仍可跳过', () => {
    for (const header of ['月份,销量', 'label,value', '销量']) {
      const r = parseData(`${header}\n1月,88\n2月,90`);
      expect(r.labels).toEqual(['1月', '2月']);
      expect(r.values).toEqual([88, 90]);
      expect(r.errors).toEqual([]);
    }
  });

  it('首行是非法数值时不当表头，照常报错', () => {
    const a = parseData('9月,12abc\n10月,20\n11月,30');
    expect(a.values).toEqual([20, 30]);
    expect(a.errors[0]).toContain('第 1 行');
    expect(a.errors[0]).toContain('12abc');

    const b = parseData('9月,Infinity\n10月,20');
    expect(b.errors[0]).toContain('Infinity');

    const c = parseData('9月,NaN\n10月,20');
    expect(c.errors[0]).toContain('NaN');

    const d = parseData('2024,\n2025,20\n2026,30');
    expect(d.errors[0]).toContain('第 1 行');
    expect(d.errors[0]).toContain('缺少数值');
    expect(d.values).toEqual([20, 30]);
  });
});

describe('parseData 非法输入', () => {
  it('拒绝 Infinity 和 NaN', () => {
    const r = parseData('月份,销量\n9月,Infinity\n10月,NaN');
    expect(r.values).toEqual([]);
    expect(r.errors.some((e) => e.includes('Infinity'))).toBe(true);
    expect(r.errors.some((e) => e.includes('NaN'))).toBe(true);
  });

  it('拒绝 12abc 这类混杂文本，并带行号与原文', () => {
    const r = parseData('9月,86\n10月,12abc');
    expect(r.values).toEqual([86]);
    expect(r.errors[0]).toBe('第 2 行：“10月,12abc” 不是有效的数值。');
  });

  it('拒绝数字与单位混在一起的写法', () => {
    const r = parseData('9月,86\n10月,86元');
    expect(r.values).toEqual([86]);
    expect(r.errors.some((e) => e.includes('86元'))).toBe(true);
  });

  it('尾随逗号或 Tab 的缺值按原始行号报错，不伪造数据点', () => {
    const a = parseData('2024,\n2025,20\n2026,30');
    expect(a.labels).toEqual(['2025', '2026']);
    expect(a.values).toEqual([20, 30]);
    expect(a.errors).toEqual(['第 1 行：“2024,” 末尾的分隔符后缺少数值。']);

    const b = parseData('2024\t\n2025\t20\n2026\t30');
    expect(b.values).toEqual([20, 30]);
    expect(b.errors[0]).toBe('第 1 行：“2024” 末尾的分隔符后缺少数值。');
  });

  it('连续分隔符留下的空字段会被报告', () => {
    const r = parseData('9月,,86\n10月,20');
    expect(r.values).toEqual([20]);
    expect(r.errors[0]).toContain('缺少标签或数值');
  });

  it('拒绝 1,2 这类被分隔符拆开的数值', () => {
    const r = parseData('9月,86\n10月,1,2');
    expect(r.values).toEqual([86]);
    expect(r.errors[0]).toContain('1,2');
  });

  it('带文字的标签仍可和数值并存（含年份写法）', () => {
    const r = parseData('2020年,35\n2021年,48');
    expect(r.labels).toEqual(['2020年', '2021年']);
    expect(r.values).toEqual([35, 48]);
    expect(r.errors).toEqual([]);
  });

  it('纯数字标签（如 Excel 年份列）按“标签,数值”读取', () => {
    const r = parseData('2024,86\n2023,92\n1,88');
    expect(r.labels).toEqual(['2024', '2023', '1']);
    expect(r.values).toEqual([86, 92, 88]);
    expect(r.errors).toEqual([]);
  });

  it('超过 200 个点时停止读取并报一次错', () => {
    const lines = Array.from({ length: MAX_POINTS + 5 }, (_, i) => `${i + 1}月,${i + 1}`);
    const r = parseData(lines.join('\n'));
    expect(r.values).toHaveLength(MAX_POINTS);
    expect(r.labels).toHaveLength(MAX_POINTS);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain(`最多只支持 ${MAX_POINTS}`);
  });

  it('少于两个点时给提示', () => {
    const r = parseData('9月,86');
    expect(r.values).toEqual([86]);
    expect(r.errors.some((e) => e.includes('至少需要 2 个数据点'))).toBe(true);
  });

  it('空输入返回空数组和一条错误', () => {
    const a = parseData('');
    expect(a.values).toEqual([]);
    expect(a.labels).toEqual([]);
    expect(a.errors).toHaveLength(1);

    const b = parseData('   \n\n  ');
    expect(b.values).toEqual([]);
    expect(b.errors).toHaveLength(1);
  });
});

describe('parseData 数字格式', () => {
  it('支持正负号、小数和科学计数法', () => {
    const r = parseData('9月,+3.5\n10月,-2e3\n11月,1.2E2\n12月,.5\n1月,5.');
    expect(r.values).toEqual([3.5, -2000, 120, 0.5, 5]);
    expect(r.errors).toEqual([]);
  });

  it('跳过空行，保留正确的行号', () => {
    const r = parseData('月份,销量\n\n9月,86\n\n10月,92');
    expect(r.values).toEqual([86, 92]);
    expect(r.errors).toEqual([]);
  });
});
