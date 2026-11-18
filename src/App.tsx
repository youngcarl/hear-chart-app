import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Dataset } from './lib/types';
import { briefSummary, pointText, stats, summarize, typeName } from './lib/analyze';
import { Sonifier } from './lib/sonify';
import {
  bindLive,
  cancelPendingSpeech,
  isWeChat,
  probeVoiceSupport,
  say,
  sayAsync,
  scheduleSpeech,
  stopSpeech,
  unlockSpeech,
} from './lib/speech';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import {
  BLIND_OFF,
  BLIND_ON,
  CHART_HINT,
  CHART_SHORT_HINT,
  HELP,
  NO_VOICE_NOTICE,
  PLAY_END,
  PLAY_PAUSED,
  PLAY_PAUSE_REF,
  PLAY_RESUME,
  PLAY_STOPPED,
  REFERENCE_HINT,
  TOUR_ABORTED,
  TOUR_INTRO,
  TOUR_OUTRO,
  WECHAT_NOTICE,
} from './lib/strings';
import { handleChartKey, handleGlobalKey } from './lib/keys';
import { runTour } from './lib/tour';
import { SAMPLES } from './data/samples';
import { ChartView } from './components/ChartView';
import { FirstRunDialog } from './components/FirstRunDialog';
import { BrowseButtons, CustomDataForm, DataTable, KeyHelp, SettingsPanel } from './components/Panels';

/** 整条播放状态：空格在未播放 / 播放中 / 已暂停之间切换，Esc 显式停止 */
type PlayMode = 'idle' | 'playing' | 'paused';

export default function App() {
  const [cfg, setCfg] = useState<Settings>(() => loadSettings());
  const [sets, setSets] = useState<Dataset[]>(SAMPLES);
  const [cur, setCur] = useState(() => {
    const i = SAMPLES.findIndex((d) => d.id === cfg.lastChartId);
    return i >= 0 ? i : 0;
  });
  const [idx, setIdx] = useState(-1);
  const [blind, setBlind] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('idle');
  const [tourRunning, setTourRunning] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);
  const [wechat] = useState(() => isWeChat());

  const sonifier = useRef<Sonifier | null>(null);
  if (!sonifier.current) sonifier.current = new Sonifier();
  const chartRef = useRef<HTMLDivElement>(null);
  const blindExitRef = useRef<HTMLButtonElement>(null);
  const ttsRef = useRef(cfg.tts);
  const playToken = useRef(0);
  const playModeRef = useRef<PlayMode>('idle');
  const tourRef = useRef<AbortController | null>(null);
  const announced = useRef('');
  const suppressHint = useRef(false);

  const ds = sets[cur] ?? sets[0];
  const st = useMemo(() => stats(ds.values), [ds]);
  const summary = useMemo(() => summarize(ds, st), [ds, st]);

  // 延迟回调也读最新设置，避免关闭语音后仍用旧值朗读
  useEffect(() => {
    ttsRef.current = cfg.tts;
  }, [cfg.tts]);
  const speak = useCallback((t: string) => say(t, ttsRef.current), []);

  const updateCfg = useCallback((patch: Partial<Settings>) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  /** 语音开关的唯一入口：关闭时立即停掉当前朗读并取消待播任务 */
  const applyTts = useCallback(
    (next: boolean) => {
      ttsRef.current = next;
      updateCfg({ tts: next });
      if (!next) {
        cancelPendingSpeech();
        stopSpeech();
      }
      say(next ? '浏览器语音已打开。' : '浏览器语音已关闭，只通过读屏软件朗读。', next);
    },
    [updateCfg],
  );

  const setPlayModeBoth = useCallback((m: PlayMode) => {
    playModeRef.current = m;
    setPlayMode(m);
  }, []);

  /** 程序化聚焦图表时，避免“已进入图表”的提示盖掉刚说的话 */
  const focusChart = useCallback((suppress = true) => {
    const el = chartRef.current;
    if (!el) return;
    if (suppress && document.activeElement !== el) suppressHint.current = true;
    el.focus();
  }, []);

  /** 任何改变数据或焦点情境的操作都走这里：旧播放的进度、暂停状态和回调一起作废 */
  const stopAudio = useCallback(() => {
    cancelPendingSpeech();
    playToken.current += 1;
    sonifier.current?.stop();
    stopSpeech();
    setPlayModeBoth('idle');
  }, [setPlayModeBoth]);

  const go = useCallback(
    (i: number) => {
      if (playModeRef.current !== 'idle') stopAudio();
      cancelPendingSpeech();
      stopSpeech();
      const s = sonifier.current!;
      if (i < 0 || i >= ds.values.length) {
        s.thud();
        speak(i < 0 ? '已经是第一个点' : '已经是最后一个点');
        return;
      }
      setIdx(i);
      s.playPoint(ds.values, i, ds.type);
      // 先听到音高，再听到数值；关闭语音时这个待播任务会被取消
      scheduleSpeech(() => speak(pointText(ds, i, st)), 220);
    },
    [ds, st, speak, stopAudio],
  );

  const playDataset = useCallback(
    (d: Dataset, start: number, onEnd?: () => void, announceEnd = true) => {
      stopAudio();
      const token = (playToken.current += 1);
      setPlayModeBoth('playing');
      sonifier.current!.playSeries(
        d.values,
        d.type,
        cfg.speed,
        (i) => {
          if (token === playToken.current) setIdx(i);
        },
        () => {
          if (token !== playToken.current) return;
          setPlayModeBoth('idle');
          if (announceEnd) speak(PLAY_END);
          onEnd?.();
        },
        start,
        cfg.refTone,
      );
    },
    [cfg.speed, cfg.refTone, speak, stopAudio, setPlayModeBoth],
  );

  const pausePlay = useCallback(() => {
    const at = sonifier.current!.pause();
    if (!at) {
      // 数据为空等情况来不及暂停，把状态收回未播放
      stopAudio();
      return;
    }
    setPlayModeBoth('paused');
    if (at.inReference) {
      speak(PLAY_PAUSE_REF);
      return;
    }
    setIdx(at.index);
    speak(PLAY_PAUSED(pointText(ds, at.index, st)));
  }, [ds, setPlayModeBoth, speak, st, stopAudio]);

  const resumePlay = useCallback(() => {
    sonifier.current!.resume();
    setPlayModeBoth('playing');
    speak(PLAY_RESUME);
  }, [setPlayModeBoth, speak]);

  /** 显式停止：清掉进度，下一次空格从头播放 */
  const stopPlayback = useCallback(() => {
    const at = idx;
    stopAudio();
    speak(PLAY_STOPPED(at >= 0 ? pointText(ds, at, st) : null));
  }, [ds, idx, speak, stopAudio, st]);

  const togglePlay = useCallback(() => {
    if (playModeRef.current === 'playing') pausePlay();
    else if (playModeRef.current === 'paused') resumePlay();
    else playDataset(ds, 0);
  }, [ds, pausePlay, playDataset, resumePlay]);

  const switchTo = useCallback(
    (k: number, announce = true) => {
      const next = sets[k];
      if (!next) return;
      stopAudio();
      setCur(k);
      setIdx(-1);
      updateCfg({ lastChartId: next.id });
      if (announce) speak(`已切换到${next.title}。按右方向键开始听，按 S 听总结。`);
    },
    [sets, stopAudio, updateCfg, speak],
  );

  const toggleBlind = useCallback(
    (on: boolean) => {
      setBlind(on);
      speak(on ? BLIND_ON : BLIND_OFF);
      focusChart();
    },
    [focusChart, speak],
  );

  const abortTour = useCallback(() => {
    tourRef.current?.abort();
    tourRef.current = null;
    setTourRunning(false);
    stopAudio();
    setBlind(false);
    speak(TOUR_ABORTED);
  }, [speak, stopAudio]);

  const startTour = useCallback(() => {
    if (tourRef.current) return;
    const tourI = Math.max(
      0,
      SAMPLES.findIndex((d) => d.id === 'dau'),
    );
    const d = SAMPLES[tourI];
    const ac = new AbortController();
    tourRef.current = ac;
    setTourRunning(true);
    stopAudio();
    setCur(tourI);
    setIdx(-1);
    updateCfg({ lastChartId: d.id });

    void (async () => {
      try {
        await runTour(ac.signal, [
          () => sayAsync(TOUR_INTRO, cfg.tts),
          () => {
            setBlind(true);
            focusChart();
          },
          () =>
            new Promise<void>((resolve) => {
              const onAbort = () => resolve();
              ac.signal.addEventListener('abort', onAbort, { once: true });
              playDataset(
                d,
                0,
                () => {
                  ac.signal.removeEventListener('abort', onAbort);
                  resolve();
                },
                false,
              );
            }),
          () => sayAsync(briefSummary(d), cfg.tts),
          () => setBlind(false),
          () => sayAsync(TOUR_OUTRO, cfg.tts),
          () => {
            focusChart();
          },
        ]);
      } finally {
        // 中断后可能已开始新导览，只有自己仍是当前导览时才复位
        if (tourRef.current === ac) {
          tourRef.current = null;
          setTourRunning(false);
        }
      }
    })();
  }, [cfg.tts, focusChart, playDataset, stopAudio, updateCfg]);

  /** 导览中再次点击按钮：静默结束当前导览并立刻从头开始 */
  const restartTour = useCallback(() => {
    tourRef.current?.abort();
    tourRef.current = null;
    setTourRunning(false);
    stopAudio();
    setBlind(false);
    startTour();
  }, [startTour, stopAudio]);

  const addCustom = useCallback(
    (d: Dataset) => {
      stopAudio();
      setSets([...SAMPLES, d]);
      setCur(SAMPLES.length);
      setIdx(-1);
      updateCfg({ lastChartId: d.id });
      speak(`已生成${d.title}，共${d.values.length}个点。按右方向键开始听。`);
      focusChart();
    },
    [focusChart, speak, stopAudio, updateCfg],
  );

  const onChartFocus = useCallback(() => {
    if (suppressHint.current) {
      suppressHint.current = false;
      return;
    }
    if (tourRunning) return;
    if (announced.current === ds.id) return;
    announced.current = ds.id;
    // 读屏用户会通过 aria-describedby 听到短提示，不必再播一遍
    if (cfg.tts) say(CHART_HINT(ds.title), true);
  }, [cfg.tts, ds.id, ds.title, tourRunning]);

  const onChartKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (tourRunning) return;
    const action = handleChartKey(
      {
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        isComposing: e.nativeEvent.isComposing || e.keyCode === 229,
        repeat: e.repeat,
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
      },
      { blind },
    );
    const n = ds.values.length;
    switch (action) {
      case 'next':
        go(idx + 1);
        break;
      case 'prev':
        go(idx < 0 ? 0 : idx - 1);
        break;
      case 'max':
        go(st.maxI);
        break;
      case 'min':
        go(st.minI);
        break;
      case 'first':
        go(0);
        break;
      case 'last':
        go(n - 1);
        break;
      case 'togglePlay':
        togglePlay();
        break;
      case 'escape':
        if (blind) toggleBlind(false);
        else if (playModeRef.current !== 'idle') stopPlayback();
        else stopAudio();
        break;
      case 'summary':
        stopAudio();
        speak(summary);
        break;
      case 'reread':
        if (idx >= 0) go(idx);
        else speak('还没有选中数据点，按右方向键开始。');
        break;
      case 'reference':
        stopAudio();
        sonifier.current!.playReference(ds.values);
        speak(REFERENCE_HINT);
        break;
      case 'help':
        stopAudio();
        speak(HELP);
        break;
      case 'blindExit':
        blindExitRef.current?.focus();
        break;
      case 'blindToggle':
        toggleBlind(!blind);
        break;
      case 'ttsToggle':
        applyTts(!cfg.tts);
        break;
      case 'switch1':
        switchTo(0);
        break;
      case 'switch2':
        switchTo(1);
        break;
      case 'switch3':
        switchTo(2);
        break;
      case 'switch4':
        switchTo(3);
        break;
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      const action = handleGlobalKey(
        {
          key: e.key,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          isComposing: e.isComposing,
          preventDefault: () => e.preventDefault(),
        },
        { asked: cfg.asked, tourRunning, blind, typing },
      );
      // B、T、1–4 等只在图表焦点内处理，普通按钮或页面空白处不再误触
      if (action === 'abortTour') abortTour();
      else if (action === 'exitBlind') toggleBlind(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [cfg.asked, tourRunning, blind, abortTour, toggleBlind]);

  useEffect(() => {
    if (!tourRunning) return;
    const stop = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // 点导览按钮本身交给 click 处理（重启），不要在这里先中断
      if (target?.closest?.('.tour-btn')) return;
      e.stopPropagation();
      abortTour();
    };
    document.addEventListener('pointerdown', stop, { capture: true });
    return () => document.removeEventListener('pointerdown', stop, { capture: true });
  }, [tourRunning, abortTour]);

  useEffect(() => {
    let alive = true;
    void probeVoiceSupport().then((ok) => {
      if (alive) setVoiceOk(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const unlock = () => {
      sonifier.current?.unlock();
      unlockSpeech();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(
    () => () => {
      sonifier.current?.stop();
      stopSpeech();
    },
    [],
  );

  return (
    <>
      {!cfg.asked && (
        <FirstRunDialog
          onChoose={(sr) => {
            ttsRef.current = !sr;
            updateCfg({ tts: !sr, asked: true });
            say(sr ? '已设置为读屏模式，浏览器语音关闭。' : '已打开浏览器语音。', !sr);
            // 对话框关闭后把焦点交给图表，避免键盘用户从页面顶部重新 Tab
            window.setTimeout(() => focusChart(), 50);
          }}
        />
      )}

      <header>
        <h1>听见图表</h1>
        <p className="lead">
          给视障和低视力同学的图表阅读器：用方向键逐点“听”数据，音高代表数值，左右声道代表先后。请先打开声音或戴上耳机。
        </p>
        <div className="ctrl">
          <button
            type="button"
            className="go tour-btn"
            onClick={() => (tourRunning ? restartTour() : startTour())}
          >
            {tourRunning ? '体验中…按任意键停止，点击可重开' : '▶ 30 秒体验'}
          </button>
        </div>
      </header>

      {wechat && (
        <div className="banner" role="status">
          {WECHAT_NOTICE}
        </div>
      )}
      {!voiceOk && (
        <div className="banner" role="status">
          {NO_VOICE_NOTICE}
        </div>
      )}

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
            aria-label={`${ds.title}，${typeName(ds)}`}
            aria-describedby="chart-help"
            onKeyDown={onChartKey}
            onFocus={onChartFocus}
            onPointerDown={() => focusChart()}
          >
            <div className="ctitle">
              {ds.title}（{typeName(ds)}，单位：{ds.unit || '无'}）
            </div>
            <ChartView ds={ds} idx={idx} onPick={go} />
          </div>
          <p id="chart-help" className="sr">
            {CHART_SHORT_HINT}
          </p>

          <BrowseButtons
            onPrev={() => go(idx <= 0 ? 0 : idx - 1)}
            onNext={() => go(idx < 0 ? 0 : idx + 1)}
            disabled={ds.values.length === 0}
          />

          <div className="now">{idx >= 0 ? <b>{pointText(ds, idx, st)}</b> : '点一下图表，或按 → 开始'}</div>
          <div className="sum">总结：{summary}</div>

          <div className="ctrl">
            <button type="button" className="go" onClick={togglePlay} aria-keyshortcuts="Space">
              {playMode === 'playing'
                ? '⏸ 暂停（空格）'
                : playMode === 'paused'
                  ? '▶ 继续（空格）'
                  : '▶ 播放整条（空格）'}
            </button>
            <button
              type="button"
              onClick={stopPlayback}
              disabled={playMode === 'idle'}
              aria-keyshortcuts="Escape"
            >
              ■ 停止（Esc）
            </button>
            <button
              type="button"
              onClick={() => {
                stopAudio();
                speak(summary);
              }}
            >
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
          <SettingsPanel
            tts={cfg.tts}
            setTts={applyTts}
            speed={cfg.speed}
            setSpeed={(v) => updateCfg({ speed: v })}
            refTone={cfg.refTone}
            setRefTone={(v) => updateCfg({ refTone: v })}
          />
          <CustomDataForm onCreate={addCustom} />
        </aside>
      </main>

      <footer>示例数据为虚构，仅用于演示。</footer>

      <div className={blind ? 'blind on' : 'blind'}>
        <p className="blind-tip">闭眼模式 · ←→ 听数据 · 空格播放/暂停/继续 · S 总结 · Esc 退出</p>
        <button
          ref={blindExitRef}
          type="button"
          className="blind-exit"
          onClick={() => toggleBlind(false)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              focusChart();
            }
          }}
        >
          退出闭眼模式
        </button>
      </div>
      <div ref={bindLive} className="sr" aria-live="polite" />
    </>
  );
}
