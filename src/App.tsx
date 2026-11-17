import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from './lib/types';
import { pointText, stats, summarize, typeName } from './lib/analyze';
import { Sonifier } from './lib/sonify';
import { bindLive, say, stopSpeech } from './lib/speech';
import { SAMPLES } from './data/samples';
import { ChartView } from './components/ChartView';
import { CustomDataForm, DataTable, KeyHelp, Settings } from './components/Panels';

const HELP =
  '左右方向键逐点听，上方向键跳到最高点，下方向键跳到最低点，空格播放整条，' +
  'S 听总结，R 重读当前点，B 闭眼模式，数字键切换图表。';

export default function App() {
  const [sets, setSets] = useState<Dataset[]>(SAMPLES);
  const [cur, setCur] = useState(0);
  const [idx, setIdx] = useState(-1);
  const [blind, setBlind] = useState(false);
  const [tts, setTts] = useState(true);
  const [speed, setSpeed] = useState(0.32);

  const sonifier = useRef<Sonifier | null>(null);
  if (!sonifier.current) sonifier.current = new Sonifier();
  const chartRef = useRef<HTMLDivElement>(null);
  const speakTimer = useRef(0);

  const ds = sets[cur];
  const st = useMemo(() => stats(ds.values), [ds]);
  const summary = useMemo(() => summarize(ds, st), [ds, st]);
  const speak = useCallback((t: string) => say(t, tts), [tts]);

  useEffect(() => () => sonifier.current?.stop(), []);

  const go = useCallback(
    (i: number) => {
      const s = sonifier.current!;
      window.clearTimeout(speakTimer.current);
      if (i < 0 || i >= ds.values.length) {
        s.thud();
        speak(i < 0 ? '已经是第一个点' : '已经是最后一个点');
        return;
      }
      setIdx(i);
      s.playPoint(ds.values, i, ds.type);
      // 先听到音高，再听到数值
      speakTimer.current = window.setTimeout(() => speak(pointText(ds, i, st)), 200);
    },
    [ds, st, speak],
  );

  const playAll = useCallback(() => {
    window.clearTimeout(speakTimer.current);
    stopSpeech();
    sonifier.current!.playSeries(ds.values, ds.type, speed, setIdx);
  }, [ds, speed]);

  const switchTo = useCallback(
    (k: number) => {
      const next = sets[k];
      if (!next) return;
      sonifier.current!.stop();
      setCur(k);
      setIdx(-1);
      speak(`已切换到${next.title}。按右方向键开始听，按 S 听总结。`);
    },
    [sets, speak],
  );

  const toggleBlind = useCallback(
    (on: boolean) => {
      setBlind(on);
      speak(on ? '已进入闭眼模式。用左右方向键听数据，空格播放整条，S 听总结，Esc 退出。' : '已退出闭眼模式。');
      chartRef.current?.focus();
    },
    [speak],
  );

  const addCustom = (d: Dataset) => {
    sonifier.current!.stop();
    setSets([...SAMPLES, d]);
    setCur(SAMPLES.length);
    setIdx(-1);
    speak(`已生成${d.title}，共${d.values.length}个点。按右方向键开始听。`);
    chartRef.current?.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === 'Escape') {
        if (blind) toggleBlind(false);
        return;
      }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;

      const n = ds.values.length;
      const actions: Record<string, () => void> = {
        arrowright: () => go(idx + 1),
        arrowleft: () => go(idx < 0 ? 0 : idx - 1),
        arrowup: () => go(st.maxI),
        arrowdown: () => go(st.minI),
        home: () => go(0),
        end: () => go(n - 1),
        ' ': playAll,
        s: () => {
          sonifier.current!.stop();
          speak(summary);
        },
        r: () => (idx >= 0 ? go(idx) : speak('还没有选中数据点，按右方向键开始。')),
        b: () => toggleBlind(!blind),
        h: () => speak(HELP),
        '1': () => switchTo(0),
        '2': () => switchTo(1),
        '3': () => switchTo(2),
        '4': () => switchTo(3),
      };
      const act = actions[e.key.toLowerCase()];
      if (act) {
        e.preventDefault();
        act();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ds, idx, st, blind, summary, go, playAll, speak, switchTo, toggleBlind]);

  return (
    <>
      <header>
        <h1>听见图表</h1>
        <p className="lead">
          给视障和低视力同学的图表阅读器：用方向键逐点“听”数据，音高代表数值，左右声道代表先后。请先打开声音或戴上耳机。
        </p>
      </header>

      <main>
        <section aria-label="图表区">
          <div className="tabs" role="group" aria-label="选择图表">
            {sets.map((d, k) => (
              <button key={d.id} type="button" aria-pressed={k === cur} onClick={() => switchTo(k)}>
                {k + 1} {d.short}
              </button>
            ))}
          </div>

          <div
            ref={chartRef}
            className="chart"
            tabIndex={0}
            role="application"
            aria-roledescription="可听图表"
            aria-label={`${ds.title}，${typeName(ds)}。${HELP}`}
          >
            <div className="ctitle">
              {ds.title}（{typeName(ds)}，单位：{ds.unit || '无'}）
            </div>
            <ChartView ds={ds} idx={idx} onPick={go} />
          </div>

          <div className="now">{idx >= 0 ? <b>{pointText(ds, idx, st)}</b> : '点一下图表，或直接按 → 开始'}</div>
          <div className="sum">总结：{summary}</div>

          <div className="ctrl">
            <button type="button" className="go" onClick={playAll}>
              ▶ 播放整条（空格）
            </button>
            <button type="button" onClick={() => speak(summary)}>
              朗读总结（S）
            </button>
            <button type="button" onClick={() => toggleBlind(true)}>
              闭眼模式（B）
            </button>
          </div>

          <DataTable ds={ds} idx={idx} />
        </section>

        <aside>
          <KeyHelp />
          <Settings tts={tts} setTts={setTts} speed={speed} setSpeed={setSpeed} />
          <CustomDataForm onCreate={addCustom} />
        </aside>
      </main>

      <footer>示例数据为虚构，仅用于演示。</footer>

      <div className={blind ? 'blind on' : 'blind'} aria-hidden="true">
        闭眼模式 · ←→ 听数据 · 空格播放 · S 总结 · Esc 退出
      </div>
      <div ref={bindLive} className="sr" aria-live="polite" />
    </>
  );
}
