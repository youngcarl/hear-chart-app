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
  | 'blindExit'
  | 'blindToggle'
  | 'ttsToggle'
  | 'switch1'
  | 'switch2'
  | 'switch3'
  | 'switch4';

export interface ChartKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** 输入法组合输入中：方向键等正被用来选字，不能抢 */
  isComposing?: boolean;
  /** 按住不放产生的自动重复 keydown */
  repeat?: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface ChartKeyContext {
  blind: boolean;
}

/**
 * 返回要执行的动作；重复空格只阻止默认行为，不返回动作。
 * Ctrl / Meta / Alt 组合键和输入法组合状态一律放行（刷新、保存、打印、返回等）。
 */
const REPEATABLE_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

export function handleChartKey(e: ChartKeyEvent, ctx: ChartKeyContext): ChartAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.isComposing || e.key === 'Process') return null;
  if (e.repeat && e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    return null;
  }
  if (e.repeat && !REPEATABLE_KEYS.has(e.key)) return null;

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
      else if (k === 'b') action = 'blindToggle';
      else if (k === 't') action = 'ttsToggle';
      else if (/^[1-4]$/.test(k)) action = `switch${k}` as ChartAction;
    }
  }

  if (action) {
    e.preventDefault();
    e.stopPropagation();
  }
  return action;
}

export type GlobalAction = 'abortTour' | 'exitBlind' | null;

export interface GlobalKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  preventDefault: () => void;
}

export interface GlobalKeyContext {
  asked: boolean;
  tourRunning: boolean;
  blind: boolean;
  /** 焦点在输入框、文本框或选择框内 */
  typing: boolean;
}

/**
 * 文档级只保留两类按键：导览中任意键取消、闭眼模式下 Esc 退出。
 * B、T、1–4 等图表快捷键必须等焦点进入图表后才由 handleChartKey 处理，
 * 避免焦点在普通按钮时误触。
 */
export function handleGlobalKey(e: GlobalKeyEvent, ctx: GlobalKeyContext): GlobalAction {
  if (!ctx.asked) return null;
  if (ctx.tourRunning) {
    e.preventDefault();
    return 'abortTour';
  }
  if (ctx.typing) return null;
  if (ctx.blind && e.key === 'Escape') return 'exitBlind';
  return null;
}
