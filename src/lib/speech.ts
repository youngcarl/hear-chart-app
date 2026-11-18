/**
 * 两路输出：
 * 1. aria-live 区域 —— 给读屏软件（NVDA、VoiceOver、争渡等）读
 * 2. 浏览器自带语音 —— 给没开读屏的人（比如评委）听；开着读屏时应关掉，否则会读两遍
 */
let live: HTMLElement | null = null;

export function bindLive(el: HTMLElement | null) {
  live = el;
}

let announceTimer = 0;
let pendingTimer = 0;

export function stopSpeech() {
  window.clearTimeout(announceTimer);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** 延迟朗读（先听音效，再读数值）；只保留最后一个待播任务 */
export function scheduleSpeech(task: () => void, delay = 220) {
  window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    pendingTimer = 0;
    task();
  }, delay);
}

/** 取消尚未执行的延迟朗读（关闭浏览器语音、停止或切图时调用） */
export function cancelPendingSpeech() {
  window.clearTimeout(pendingTimer);
  pendingTimer = 0;
}

/** 只写 aria-live，保证同一句话重复时读屏也会再读 */
function announce(text: string) {
  if (!live) return;
  const el = live;
  // 连续两次播报时只保留最后一句，避免 30ms 窗口内互相清空
  window.clearTimeout(announceTimer);
  el.textContent = '';
  announceTimer = window.setTimeout(() => {
    el.textContent = text;
  }, 30);
}

function makeUtterance(text: string): SpeechSynthesisUtterance {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 1.15;
  const voice = synth.getVoices().find((x) => /zh[-_](CN|Hans)/i.test(x.lang));
  if (voice) u.voice = voice;
  return u;
}

function speakNow(text: string) {
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.speak(makeUtterance(text));
}

export function say(text: string, useTts: boolean) {
  announce(text);
  if (useTts) speakNow(text);
}

/** 朗读并等到结束（或估算的结束时间）；体验流程需要按顺序说话 */
export function sayAsync(text: string, useTts: boolean): Promise<void> {
  announce(text);
  if (!useTts || !('speechSynthesis' in window)) {
    const wait = 600 + text.length * 140;
    return new Promise((resolve) => window.setTimeout(resolve, wait));
  }
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = makeUtterance(text);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallback);
      resolve();
    };
    // 某些浏览器不触发 onend，兜底避免体验卡住；封顶 24 秒，长文本也不会拖住流程
    const fallback = window.setTimeout(finish, Math.min(24000, Math.max(6000, text.length * 350)));
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
  });
}

/** iOS 等平台要在用户手势里先说过一次，后续语音才不会被拦截 */
export function unlockSpeech() {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

/** 检测是否有中文语音；最多等 1 秒让 voiceschanged 触发 */
export function probeVoiceSupport(): Promise<boolean> {
  if (!('speechSynthesis' in window)) return Promise.resolve(false);
  const synth = window.speechSynthesis;
  const hasZh = () => synth.getVoices().some((v) => /^zh/i.test(v.lang));
  if (hasZh()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      synth.onvoiceschanged = null;
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(hasZh()), 1000);
    synth.onvoiceschanged = () => {
      if (hasZh()) done(true);
    };
  });
}

export function isWeChat(): boolean {
  return /MicroMessenger/i.test(window.navigator.userAgent);
}
