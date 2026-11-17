import { useEffect, useRef, useState } from 'react';
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
  const m = { l: narrow ? 40 : 56, r: 16, t: 16, b: 36 };
  const iw = Math.max(1, W - m.l - m.r);
  const ih = Math.max(1, H - m.t - m.b);

  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (isBar) {
    lo = Math.min(0, lo);
    hi = hi * 1.1 || 1;
  } else {
    const pad = (hi - lo) * 0.12 || 1;
    lo -= pad;
    hi += pad;
  }
  const y = (val: number) => m.t + ih - ((val - lo) / (hi - lo)) * ih;
  const band = iw / n;
  const x = (i: number) => (isBar ? m.l + band * (i + 0.5) : m.l + (n < 2 ? iw / 2 : (i * iw) / (n - 1)));
  const every = Math.ceil(n / (narrow ? 4 : 8));
  const ticks = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);

  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = clientX - r.left - m.l;
    const i = isBar ? Math.floor(px / band) : Math.round(px / (iw / Math.max(1, n - 1)));
    onPick(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="fig" ref={ref} aria-hidden="true" onClick={(e) => pick(e.clientX)}>
      {W > 0 && H > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {ticks.map((t, k) => (
            <g key={k}>
              <line className="grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
              <text className="tick" x={m.l - 8} y={y(t) + 5} textAnchor="end">
                {fmt(Math.round(t * 10) / 10)}
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
            v.map((val, i) => (
              <rect
                key={i}
                className={i === idx ? 'bar cur' : 'bar'}
                x={x(i) - band * 0.32}
                y={y(Math.max(val, 0))}
                width={band * 0.64}
                height={Math.max(Math.abs(y(val) - y(0)), 1)}
                rx={4}
              />
            ))
          ) : (
            <>
              <polyline className="line" points={v.map((val, i) => `${x(i)},${y(val)}`).join(' ')} />
              {v.map((val, i) => (
                <circle key={i} className={i === idx ? 'dot cur' : 'dot'} cx={x(i)} cy={y(val)} r={i === idx ? 9 : 4.5} />
              ))}
            </>
          )}
        </svg>
      )}
    </div>
  );
}
