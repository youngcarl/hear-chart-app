/** 所有朗读文案集中在这里，方便统一语气和以后做多语言 */
export const HELP =
  '图表已获得焦点。左右方向键逐点收听，上方向键跳到最高点，下方向键跳到最低点，' +
  'Home 和 End 跳到第一个和最后一个，空格播放整条或暂停，暂停后再按空格从暂停处继续，' +
  'Esc 停止播放，S 听总结，R 重读当前点，' +
  'P 听最低音和最高音，T 切换浏览器语音，B 进入闭眼模式，数字键 1 到 4 切换图表，Tab 离开图表。';

export const CHART_HINT = (title: string) =>
  `已进入图表：${title}。左右键浏览，H 听帮助，Tab 离开。`;

/** 图表聚焦时由 aria-describedby 读出的短提示，完整帮助按 H 再听 */
export const CHART_SHORT_HINT = '左右方向键浏览数据，按 H 听完整帮助，按 Tab 离开图表。';

export const WECHAT_NOTICE =
  '当前在微信内打开，声音可能无法播放。请点右上角，选择“在浏览器打开”。';

export const NO_VOICE_NOTICE =
  '当前浏览器没有可用的中文语音，数值仍会显示在屏幕上。建议用 Chrome、Edge 或 Safari 打开。';

export const PLAY_END = '播放结束。';

/** 暂停时读出进度，并说明下一步能做什么，避免用户在“暂停”和“停止”之间猜 */
export const PLAY_PAUSED = (point: string) => `已暂停，当前是${point}。再按空格继续。`;

export const PLAY_PAUSE_REF = '已暂停，参考音还没播完。再按空格继续。';

export const PLAY_RESUME = '继续播放。';

export const PLAY_STOPPED = (point: string | null) =>
  point ? `已停止播放，当前是${point}。再按空格从头播放。` : '已停止播放。再按空格从头播放。';

export const REFERENCE_HINT = '先听最低音，再听最高音。';

export const BLIND_ON =
  '已进入闭眼模式。左右方向键听数据，空格播放或暂停，S 听总结，Esc 退出闭眼模式，退出后按 Esc 停止播放。';

export const BLIND_OFF = '已退出闭眼模式。';

export const TOUR_INTRO = '接下来请闭上眼睛，用耳朵读一张图。';

export const TOUR_OUTRO = '现在你自己试试，按右方向键。';

export const TOUR_ABORTED = '体验已结束，你可以按右方向键自己试。';

export const FIRST_RUN_QUESTION = '你现在在用读屏软件吗？';
