/** 图表焦点内的快捷键映射。独立成纯函数，便于回归测试组合键与输入法状态。 */

export type ChartAction =
  | 'next'
  | 'prev'
  | 'max'
  | 'min'
  | 'first'
  | 'last'
  | 'togglePlay'
  | 'escape'
  | 'summary'
  | 'reread'
  | 'reference'
  | 'help'
  | 'blindExit';

export interface ChartKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** 输入法组合输入中：方向键等正被用来选字，不能抢 */
  isComposing?: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface ChartKeyContext {
  blind: boolean;
}

/**
 * 处理图表按键：返回要执行的动作，或 null 表示不拦截。
 * Ctrl / Meta / Alt 组合键和输入法组合状态一律放行（刷新、保存、打印、返回等）。
 */
export function handleChartKey(e: ChartKeyEvent, ctx: ChartKeyContext): ChartAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.isComposing || e.key === 'Process') return null;

  let action: ChartAction | null = null;
  switch (e.key) {
    case 'ArrowRight':
      action = 'next';
      break;
    case 'ArrowLeft':
      action = 'prev';
      break;
    case 'ArrowUp':
      action = 'max';
      break;
    case 'ArrowDown':
      action = 'min';
      break;
    case 'Home':
      action = 'first';
      break;
    case 'End':
      action = 'last';
      break;
    case ' ':
      action = 'togglePlay';
      break;
    case 'Escape':
      action = 'escape';
      break;
    case 'Tab':
      action = ctx.blind ? 'blindExit' : null;
      break;
    default: {
      const k = e.key.toLowerCase();
      if (k === 's') action = 'summary';
      else if (k === 'r') action = 'reread';
      else if (k === 'p') action = 'reference';
      else if (k === 'h') action = 'help';
    }
  }

  if (action) {
    e.preventDefault();
    e.stopPropagation();
  }
  return action;
}
