import { useState, type FormEvent } from 'react';
import type { ChartType, Dataset } from '../lib/types';
import { fmt } from '../lib/analyze';
import { parseData } from '../lib/parse';
import { SPEED_OPTIONS } from '../lib/settings';
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
  [['↑', '↓'], '最高 / 最低'],
  [['Home', 'End'], '首尾'],
  [['空格'], '播放 / 暂停 / 继续'],
  [['Esc'], '停止播放；闭眼模式内退出'],
  [['S'], '总结'],
  [['R'], '重读当前点'],
  [['P'], '最低音 / 最高音'],
  [['T'], '浏览器语音开关'],
  [['B'], '闭眼模式'],
  [['1–4'], '切换图表'],
  [['H'], '帮助'],
];

export function KeyHelp() {
  return (
    <div className="box">
      <h2>快捷键</h2>
      <p className="hint">先点一下图表，或用 Tab 把焦点移进图表，下面的键才生效；焦点在输入框或其他按钮上时不会误触。闭眼模式下 Esc 在任意位置都能退出。</p>
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
  refTone: boolean;
  setRefTone: (v: boolean) => void;
}

export function SettingsPanel({ tts, setTts, speed, setSpeed, refTone, setRefTone }: SettingsProps) {
  return (
    <div className="box">
      <h2>设置</h2>
      <label className="check">
        <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} />
        浏览器语音朗读（用读屏软件时请关掉）
      </label>
      <label className="check">
        <input type="checkbox" checked={refTone} onChange={(e) => setRefTone(e.target.checked)} />
        播放前先听最低音和最高音
      </label>
      <label htmlFor="speed">播放速度</label>
      <select id="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
        {SPEED_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface BrowseProps {
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export function BrowseButtons({ onPrev, onNext, disabled = false }: BrowseProps) {
  return (
    <div className="browse" role="group" aria-label="逐个浏览数据点">
      <button type="button" onClick={onPrev} disabled={disabled}>
        ← 上一个
      </button>
      <button type="button" onClick={onNext} disabled={disabled}>
        下一个 →
      </button>
    </div>
  );
}

const DEFAULT_TEXT = '9月,86\n10月,92\n11月,130\n12月,175\n1月,168\n2月,40';

export function CustomDataForm({ onCreate }: { onCreate: (d: Dataset) => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChartType>('line');
  const [unit, setUnit] = useState('');
  const [text, setText] = useState(DEFAULT_TEXT);
  const [hasHeader, setHasHeader] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // parseData 已经会报告“少于 2 个点”，这里不再重复提示
    const parsed = parseData(text, { header: hasHeader });
    const shown = [...new Set(parsed.errors)];
    if (shown.length > 0) {
      // 同样的错误再次提交时也要重新播报：先清空再写回
      setErrs([]);
      window.setTimeout(() => setErrs(shown), 30);
      return;
    }
    setErrs([]);
    onCreate({ id: 'mine', short: '我的数据', title: title.trim() || '我的数据', type, unit: unit.trim(), labels: parsed.labels, values: parsed.values });
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
      <textarea
        id="mData"
        value={text}
        aria-invalid={errs.length > 0}
        aria-describedby="mErrs"
        onChange={(e) => setText(e.target.value)}
      />
      <label className="check">
        <input
          id="mHasHeader"
          type="checkbox"
          checked={hasHeader}
          onChange={(e) => setHasHeader(e.target.checked)}
        />
        首行是表头（跳过第一行）
      </label>
      <div id="mErrs" className="err" role="alert">
        {errs.map((msg) => (
          <p key={msg}>{msg}</p>
        ))}
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
