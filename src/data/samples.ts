import type { Dataset } from '../lib/types';

/** 示例数据均为虚构，仅用于演示 */
export const SAMPLES: Dataset[] = [
  {
    id: 'temp',
    short: '气温折线',
    title: '某城市月平均气温',
    type: 'line',
    unit: '℃',
    labels: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    values: [3, 5, 10, 16, 22, 26, 29, 28, 23, 17, 10, 4],
  },
  {
    id: 'grade',
    short: '成绩柱状',
    title: '某课程期末成绩分布',
    type: 'bar',
    unit: '人',
    labels: ['60分以下', '60到69分', '70到79分', '80到89分', '90分以上'],
    values: [4, 12, 25, 18, 6],
  },
  {
    id: 'dau',
    short: '日活骤降',
    title: '某校园 App 日活跃用户',
    type: 'line',
    unit: '万人',
    labels: ['2018年', '2019年', '2020年', '2021年', '2022年', '2023年', '2024年'],
    values: [1.2, 1.8, 2.7, 3.5, 3.3, 1.4, 1.6],
  },
];
