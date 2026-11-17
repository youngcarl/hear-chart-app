export interface Settings {
  /** 是否使用浏览器语音；用读屏软件时应关闭，避免读两遍 */
  tts: boolean;
  /** 整条播放每个数据点的间隔（秒） */
  speed: number;
  /** 是否已经询问过用户是否使用读屏软件 */
  asked: boolean;
  /** 播放整条前是否先播最低音和最高音 */
  refTone: boolean;
  /** 上次查看的图表 id */
  lastChartId: string | null;
}

export const SPEED_OPTIONS = [
  { value: 0.5, label: '慢' },
  { value: 0.32, label: '中' },
  { value: 0.2, label: '快' },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  tts: true,
  speed: 0.32,
  asked: false,
  refTone: true,
  lastChartId: null,
};

const KEY = 'hear-chart.settings.v1';

function isSpeed(v: unknown): v is number {
  return SPEED_OPTIONS.some((o) => o.value === v);
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      tts: typeof saved.tts === 'boolean' ? saved.tts : DEFAULT_SETTINGS.tts,
      speed: isSpeed(saved.speed) ? saved.speed : DEFAULT_SETTINGS.speed,
      asked: saved.asked === true,
      refTone: typeof saved.refTone === 'boolean' ? saved.refTone : DEFAULT_SETTINGS.refTone,
      lastChartId: typeof saved.lastChartId === 'string' ? saved.lastChartId : null,
    };
  } catch {
    // 隐私模式或禁用存储时 localStorage 可能抛错
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 存不下就算了，不打断使用 */
  }
}
