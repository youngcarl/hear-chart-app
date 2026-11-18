import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { FIRST_RUN_QUESTION } from '../lib/strings';

interface Props {
  onChoose: (usesScreenReader: boolean) => void;
}

/**
 * 首次运行询问：用读屏软件还是浏览器语音。
 * 必须做出选择，所以不响应 Esc；Tab 只在两个按钮之间循环，焦点不会跑到遮罩后面。
 */
export function FirstRunDialog({ onChoose }: Props) {
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    yesRef.current?.focus();
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const first = yesRef.current;
    const last = noRef.current;
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey) {
      // 在第一个按钮上向后 Tab 时回绕到最后一个
      if (active !== last) {
        e.preventDefault();
        last.focus();
      }
    } else if (active !== first) {
      // 在最后一个按钮上 Tab 时回绕到第一个
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="firstrun" onKeyDown={onKeyDown}>
      <div
        className="firstrun-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="firstrunTitle"
        aria-describedby="firstrunDesc"
      >
        <h2 id="firstrunTitle">{FIRST_RUN_QUESTION}</h2>
        <p id="firstrunDesc">选“是”会关闭浏览器语音，只用读屏软件朗读；选“否”会打开浏览器语音。</p>
        <div className="firstrun-actions">
          <button ref={yesRef} type="button" className="go" onClick={() => onChoose(true)}>
            是，我在用读屏软件
          </button>
          <button ref={noRef} type="button" onClick={() => onChoose(false)}>
            否，请用浏览器朗读
          </button>
        </div>
      </div>
    </div>
  );
}
