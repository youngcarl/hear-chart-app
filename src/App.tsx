import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Dataset } from './lib/types';
import { briefSummary, pointText, stats, summarize, typeName } from './lib/analyze';
import { Sonifier } from './lib/sonify';
import {
  bindLive,
  isWeChat,
  probeVoiceSupport,
  say,
  sayAsync,
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
  REFERENCE_HINT,
  TOUR_ABORTED,
  TOUR_INTRO,
  TOUR_OUTRO,
  WECHAT_NOTICE,
} from './lib/strings';
import { runTour } from './lib/tour';
import { SAMPLES } from './data/samples';
import { ChartView } from './components/ChartView';
import { FirstRunDialog } from './components/FirstRunDialog';
import { BrowseButtons, CustomDataForm, DataTable, KeyHelp, SettingsPanel } from './components/Panels';

export default function App() {
  const [cfg, setCfg] = useState<Settings>(() => loadSettings());
  const [sets, setSets] = useState<Dataset[]>(SAMPLES);
  const [cur, setCur] = useState(() => {
    const i = SAMPLES.findIndex((d) => d.id === cfg.lastChartId);
    return i >= 0 ? i : 0;
  });
  const [idx, setIdx] = useState(-1);
  const [blind, setBlind] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);
  const [wechat] = useState(() => isWeChat());

  const sonifier = useRef<Sonifier | null>(null);
  if (!sonifier.current) sonifier.current = new Sonifier();
  const chartRef = useRef<HTMLDivElement>(null);
  const blindExitRef = useRef<HTMLButtonElement>(null);
  const speakTimer = useRef(0);
  const playTimer = useRef(0);
  const playToken = useRef(0);
  const playingRef = useRef(false);
  const tourRef = useRef<AbortController | null>(null);
  const announced = useRef('');
  const suppressHint = useRef(false);

  const ds = sets[cur] ?? sets[0];
  const st = useMemo(() => stats(ds.values), [ds]);
  const summary = useMemo(() => summarize(ds, st), [ds, st]);

  const speak = useCallback((t: string) => say(t, cfg.tts), [cfg.tts]);

  const updateCfg = useCallback((patch: Partial<Settings>) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const setPlayingBoth = useCallback((v: boolean) => {
    playingRef.current = v;
    setPlaying(v);
  }, []);

  /** 程序化聚焦图表时，避免“已进入图表”的提示盖掉刚说的话 */
  const focusChart = useCallback((suppress = true) => {
    const el = chartRef.current;
    if (!el) return;
    if (suppress && document.activeElement !== el) suppressHint.current = true;
    el.focus();
  }, []);

  const stopAudio = useCallback(() => {
    window.clearTimeout(speakTimer.current);
    window.clearTimeout(playTimer.current);
    playToken.current += 1;
    sonifier.current?.stop();
    stopSpeech();
    setPlayingBoth(false);
  }, [setPlayingBoth]);

  const go = useCallback(
    (i: number) => {
      if (playingRef.current) stopAudio();
      window.clearTimeout(speakTimer.current);
      stopSpeech();
      const s = sonifier.current!;
      if (i < 0 || i >= ds.values.length) {
        s.thud();
        speak(i < 0 ? '已经是第一个点' : '已经是最后一个点');
        return;
      }
      setIdx(i);
      s.playPoint(ds.values, i, ds.type);
      // 先听到音高，再听到数值
      speakTimer.current = window.setTimeout(() => speak(pointText(ds, i, st)), 220);
    },
    [ds, st, speak, stopAudio],
  );

  const playDataset = useCallback(
    (d: Dataset, start: number, onEnd?: () => void, announceEnd = true) => {
      stopAudio();
      const token = (playToken.current += 1);
      setPlayingBoth(true);
      const begin = () => {
        if (token !== playToken.current) return;
        sonifier.current!.playSeries(
          d.values,
          d.type,
          cfg.speed,
          (i) => {
            if (token === playToken.current) setIdx(i);
          },
          () => {
            if (token !== playToken.current) return;
            setPlayingBoth(false);
            if (announceEnd) speak(PLAY_END);
            onEnd?.();
          },
          start,
        );
      };
      if (cfg.refTone) {
        sonifier.current!.playReference(d.values);
        playTimer.current = window.setTimeout(begin, 1300);
      } else {
        begin();
      }
    },
    [cfg.speed, cfg.refTone, speak, stopAudio, setPlayingBoth],
  );

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      const at = idx;
      stopAudio();
      speak(at >= 0 ? `已停止播放，当前是${pointText(ds, at, st)}` : '已停止播放。');
      return;
    }
    playDataset(ds, idx >= 0 ? idx : 0);
  }, [ds, idx, st, playDataset, speak, stopAudio]);

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
    const key = e.key;
    if (key === 'Tab' && blind) {
      // 闭眼模式只有“退出闭眼模式”一个可见控件，Tab 直接送过去
      e.preventDefault();
      blindExitRef.current?.focus();
      return;
    }
    const n = ds.values.length;
    let action: (() => void) | undefined;
    switch (key) {
      case 'ArrowRight':
        action = () => go(idx + 1);
        break;
      case 'ArrowLeft':
        action = () => go(idx < 0 ? 0 : idx - 1);
        break;
      case 'ArrowUp':
        action = () => go(st.maxI);
        break;
      case 'ArrowDown':
        action = () => go(st.minI);
        break;
      case 'Home':
        action = () => go(0);
        break;
      case 'End':
        action = () => go(n - 1);
        break;
      case ' ':
        action = togglePlay;
        break;
      case 'Escape':
        action = () => {
          if (blind) toggleBlind(false);
          else stopAudio();
        };
        break;
      default: {
        const k = key.toLowerCase();
        if (k === 's') {
          action = () => {
            stopAudio();
            speak(summary);
          };
        } else if (k === 'r') {
          action = () => (idx >= 0 ? go(idx) : speak('还没有选中数据点，按右方向键开始。'));
        } else if (k === 'p') {
          action = () => {
            stopAudio();
            sonifier.current!.playReference(ds.values);
            speak(REFERENCE_HINT);
          };
        } else if (k === 'h') {
          action = () => {
            stopAudio();
            speak(HELP);
          };
        }
      }
    }
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!cfg.asked) return;
      if (tourRunning) {
        e.preventDefault();
        abortTour();
        return;
      }
      if (e.key === 'Escape') {
        if (blind) toggleBlind(false);
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        toggleBlind(!blind);
        return;
      }
      if (/^[1-4]$/.test(k)) {
        e.preventDefault();
        switchTo(Number(k) - 1);
        return;
      }
      if (k === 't') {
        e.preventDefault();
        const next = !cfg.tts;
        updateCfg({ tts: next });
        say(next ? '浏览器语音已打开。' : '浏览器语音已关闭，只通过读屏软件朗读。', next);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [cfg.asked, cfg.tts, tourRunning, blind, abortTour, toggleBlind, switchTo, updateCfg]);

  useEffect(() => {
    if (!tourRunning) return;
    const stop = (e: PointerEvent) => {
      e.stopPropagation();
      abortTour();
    };
    document.addEventListener('pointerdown', stop, { capture: true, once: true });
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
          <button type="button" className="go" onClick={startTour}>
            {tourRunning ? '体验中…按任意键停止' : '▶ 30 秒体验'}
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
            <button type="button" className="go" onClick={togglePlay}>
              {playing ? '■ 停止（空格）' : '▶ 播放整条（空格）'}
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
            setTts={(v) => updateCfg({ tts: v })}
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
        <p className="blind-tip">闭眼模式 · ←→ 听数据 · 空格播放/停止 · S 总结 · Esc 退出</p>
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
