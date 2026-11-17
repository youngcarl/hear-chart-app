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
