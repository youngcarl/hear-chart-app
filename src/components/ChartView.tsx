import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Dataset } from '../lib/types';
import { fmt } from '../lib/analyze';

function useSize<T extends Element>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

interface Props {
  ds: Dataset;
  idx: number;
  onPick: (i: number) => void;
}

/** 视觉图表：给明眼人和低视力用户看。对读屏隐藏，读屏走数据表和朗读。 */
export function ChartView({ ds, idx, onPick }: Props) {
  const [ref, { w: W, h: H }] = useSize<HTMLDivElement>();
  const v = ds.values;
  const n = v.length;
  const isBar = ds.type === 'bar';
  const narrow = W < 520;

  // 先过滤非有限值再取范围，避免 NaN / Infinity 传染整个坐标系
  const finite = v.filter((x) => Number.isFinite(x));
  let lo = finite.length > 0 ? Math.min(...finite) : 0;
  let hi = finite.length > 0 ? Math.max(...finite) : 0;

  if (isBar) {
    // 0 基线始终留在绘图区内：全负数据不能把 0 挤出画面，全正数据从 0 起
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
    if (hi === lo) hi = lo + 1;
    // 顶部留 8% 空白，柱子不会贴着上边框
    hi += (hi - lo) * 0.08;
  } else if (hi === lo) {
    // 所有点相同（单点、全零、水平线）时上下各留 1 的跨度，避免除以 0
    lo -= 1;
    hi += 1;
  } else {
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  }

  const ticks = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);
  const tickText = (t: number) => fmt(Math.round(t * 10) / 10);
  // 左侧留白跟着最长刻度走，1e9 这类大数不会被裁掉
  const tickW = Math.max(...ticks.map((t) => tickText(t).length)) * 7.5 + 14;
  const m = { l: Math.max(narrow ? 40 : 56, tickW), r: 16, t: 16, b: 36 };
  const iw = Math.max(1, W - m.l - m.r);
  const ih = Math.max(1, H - m.t - m.b);

  const y = (val: number) => m.t + ih - ((val - lo) / (hi - lo)) * ih;
  const band = iw / Math.max(1, n);
  const x = (i: number) => (isBar ? m.l + band * (i + 0.5) : m.l + (n < 2 ? iw / 2 : (i * iw) / (n - 1)));
  const every = Math.ceil(n / (narrow ? 4 : 8));

  // 拖动状态放在 ref 里，pointermove 不依赖渲染后的 props
  const drag = useRef<{ active: boolean; last: number }>({ active: false, last: -1 });

  const indexAt = (clientX: number): number | null => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || n === 0) return null;
    const px = clientX - r.left - m.l;
    const i = isBar ? Math.floor(px / band) : Math.round(px / (iw / Math.max(1, n - 1)));
    return Math.max(0, Math.min(n - 1, i));
  };

  /** 鼠标点击与触摸拖动都走 Pointer Events，按下即选中。 */
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const i = indexAt(e.clientX);
    if (i === null) return;
    // 不调用 preventDefault：保留鼠标点击后焦点落到图表容器、方向键可继续用
    drag.current = { active: true, last: i };
    e.currentTarget.setPointerCapture(e.pointerId);
    onPick(i);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const i = indexAt(e.clientX);
    if (i === null || i === drag.current.last) return;
    drag.current.last = i;
    onPick(i);
  };

  const onEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="fig"
      ref={ref}
      aria-hidden="true"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onLostPointerCapture={onEnd}
    >
      {W > 0 && H > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {ticks.map((t, k) => (
            <g key={k}>
              <line className="grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
              <text className="tick" x={m.l - 8} y={y(t) + 5} textAnchor="end">
                {tickText(t)}
              </text>
            </g>
          ))}

          {ds.labels.map((lb, i) =>
            i % every === 0 || i === idx ? (
              <text key={i} className={i === idx ? 'tick cur' : 'tick'} x={x(i)} y={H - 10} textAnchor="middle">
                {lb}
              </text>
            ) : null,
          )}

          {idx >= 0 && (
            <rect
              className="spot"
              x={x(idx) - (isBar ? band * 0.45 : 14)}
              y={m.t}
              width={isBar ? band * 0.9 : 28}
              height={ih}
              rx={6}
            />
          )}

          {isBar ? (
            v.map((raw, i) => {
              const val = Number.isFinite(raw) ? raw : 0;
              // 柱高从 y(0) 量到 y(val)：负值自然向下，高度始终非负
              const top = Math.min(y(0), y(val));
              const height = Math.max(Math.abs(y(val) - y(0)), 1);
              return (
                <rect
                  key={i}
                  className={i === idx ? 'bar cur' : 'bar'}
                  x={x(i) - band * 0.32}
                  y={top}
                  width={band * 0.64}
                  height={height}
                  rx={4}
                />
              );
            })
          ) : (
            <>
              <polyline
                className="line"
                points={v.map((raw, i) => `${x(i)},${y(Number.isFinite(raw) ? raw : 0)}`).join(' ')}
              />
              {v.map((raw, i) => (
                <circle
                  key={i}
                  className={i === idx ? 'dot cur' : 'dot'}
                  cx={x(i)}
                  cy={y(Number.isFinite(raw) ? raw : 0)}
                  r={i === idx ? 9 : 4.5}
                />
              ))}
            </>
          )}
        </svg>
      )}
    </div>
  );
}
