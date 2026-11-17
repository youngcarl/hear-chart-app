/**
 * 两路输出：
 * 1. aria-live 区域 —— 给读屏软件（NVDA、VoiceOver、争渡等）读
 * 2. 浏览器自带语音 —— 给没开读屏的人（比如评委）听；开着读屏时应关掉，否则会读两遍
 */
let live: HTMLElement | null = null;

export function bindLive(el: HTMLElement | null) {
  live = el;
}

export function stopSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function say(text: string, useTts: boolean) {
  if (live) {
    const el = live;
    el.textContent = '';
    // 先清空再写入，保证同一句话重复时读屏也会再读
    window.setTimeout(() => {
      el.textContent = text;
    }, 30);
  }
  if (!useTts || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 1.15;
  const voice = synth.getVoices().find((x) => /zh[-_](CN|Hans)/i.test(x.lang));
  if (voice) u.voice = voice;
  synth.speak(u);
}
