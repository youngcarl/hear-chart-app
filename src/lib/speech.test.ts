import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelPendingSpeech, say, scheduleSpeech, stopSpeech } from './speech';

const speakMock = vi.fn();
const cancelMock = vi.fn();

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  volume = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    speechSynthesis: {
      speak: speakMock,
      cancel: cancelMock,
      getVoices: () => [{ lang: 'zh-CN' }],
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  speakMock.mockReset();
  cancelMock.mockReset();
});

describe('say', () => {
  it('关闭浏览器语音时不调用 speechSynthesis', () => {
    say('只是一条读屏提示', false);
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('stopSpeech 立即取消当前朗读', () => {
    say('一段很长的摘要', true);
    expect(speakMock).toHaveBeenCalledTimes(1);

    cancelMock.mockClear();
    stopSpeech();
    expect(cancelMock).toHaveBeenCalledTimes(1);

    // 关闭后即使再触发旧文本的朗读请求，也不应启动浏览器语音
    say('已关闭', false);
    expect(speakMock).toHaveBeenCalledTimes(1);
  });
});

describe('scheduleSpeech', () => {
  it('关闭语音后，等待中的逐点朗读不会启动', () => {
    let tts = true;
    scheduleSpeech(() => say('86', tts), 220);
    // 模拟 220ms 内用户按 T 关闭
    tts = false;
    vi.advanceTimersByTime(300);
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('取消后不再执行待播任务', () => {
    scheduleSpeech(() => say('旧文本', true), 220);
    cancelPendingSpeech();
    vi.advanceTimersByTime(300);
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('新的待播任务替换旧任务', () => {
    scheduleSpeech(() => say('旧文本', true), 220);
    scheduleSpeech(() => say('新文本', true), 220);
    vi.advanceTimersByTime(300);
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect((speakMock.mock.calls[0][0] as FakeUtterance).text).toBe('新文本');
  });
});
