import { useState, type FormEvent } from 'react';
import type { ChartType, Dataset } from '../lib/types';
import { fmt } from '../lib/analyze';
import { parseData } from '../lib/parse';
import { EXTRACT_ENABLED } from '../lib/extract';

export function DataTable({ ds, idx }: { ds: Dataset; idx: number }) {
  return (
    <details>
      <summary>数据表（读屏可逐行朗读）</summary>
      <table>
        <thead>
          <tr>
            <th>标签</th>
            <th>数值</th>
          </tr>
        </thead>
        <tbody>
          {ds.labels.map((lb, i) => (
            <tr key={i} className={i === idx ? 'cur' : undefined}>
              <td>{lb}</td>
              <td className="n">
                {fmt(ds.values[i])} {ds.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const KEYS: [string[], string][] = [
  [['←', '→'], '逐点收听'],
  [['↑', '↓'], '跳到最高点 / 最低点'],
  [['Home', 'End'], '第一个 / 最后一个'],
  [['空格'], '播放整条'],
  [['S'], '朗读总结'],
  [['R'], '重读当前点'],
  [['B', 'Esc'], '进入 / 退出闭眼模式'],
  [['1', '4'], '切换图表'],
  [['H'], '朗读帮助'],
];

export function KeyHelp() {
  return (
    <div className="box">
      <h2>快捷键</h2>
      <ul className="keys">
        {KEYS.map(([ks, desc]) => (
          <li key={desc}>
            {ks.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
            {desc}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SettingsProps {
  tts: boolean;
  setTts: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
}

export function Settings({ tts, setTts, speed, setSpeed }: SettingsProps) {
  return (
    <div className="box">
      <h2>设置</h2>
      <label className="check">
        <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} />
        浏览器语音朗读（用读屏软件时请关掉）
      </label>
      <label htmlFor="speed">播放速度</label>
      <select id="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
        <option value={0.5}>慢</option>
        <option value={0.32}>中</option>
        <option value={0.2}>快</option>
      </select>
    </div>
  );
}

const DEFAULT_TEXT = '9月,86\n10月,92\n11月,130\n12月,175\n1月,168\n2月,40';

export function CustomDataForm({ onCreate }: { onCreate: (d: Dataset) => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChartType>('line');
  const [unit, setUnit] = useState('');
  const [text, setText] = useState(DEFAULT_TEXT);
  const [err, setErr] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { labels, values } = parseData(text);
    if (values.length < 2) {
      setErr('至少需要两行有效数据。');
      return;
    }
    setErr('');
    onCreate({ id: 'mine', short: '我的数据', title: title.trim() || '我的数据', type, unit: unit.trim(), labels, values });
  };

  return (
    <form className="box" onSubmit={submit}>
      <h2>粘贴自己的数据</h2>
      <p className="hint">每行一个点：“标签,数值”。也可以每行只写数字。</p>
      <label htmlFor="mTitle">图表标题</label>
      <input id="mTitle" type="text" value={title} placeholder="如：宿舍月电费" onChange={(e) => setTitle(e.target.value)} />
      <div className="two">
        <div>
          <label htmlFor="mType">类型</label>
          <select id="mType" value={type} onChange={(e) => setType(e.target.value as ChartType)}>
            <option value="line">折线图</option>
            <option value="bar">柱状图</option>
          </select>
        </div>
        <div>
          <label htmlFor="mUnit">单位</label>
          <input id="mUnit" type="text" value={unit} placeholder="如：元" onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>
      <label htmlFor="mData">数据</label>
      <textarea id="mData" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="err" role="alert">
        {err}
      </div>
      <button className="go wide" type="submit">
        生成可听图表
      </button>

      <div className="soon">
        <button type="button" className="wide" disabled={!EXTRACT_ENABLED} aria-describedby="soonHint">
          上传图表截图识别
        </button>
        <p id="soonHint" className="hint">
          预留功能：接入云函数和多模态模型后开启，见 README。
        </p>
      </div>
    </form>
  );
}
