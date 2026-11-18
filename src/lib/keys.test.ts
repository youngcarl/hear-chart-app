import { describe, expect, it } from 'vitest';
import { handleChartKey, type ChartKeyEvent } from './keys';

function press(key: string, mods: Partial<ChartKeyEvent> = {}, blind = false) {
  let prevented = false;
  let stopped = false;
  const action = handleChartKey(
    {
      key,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
      ...mods,
    },
    { blind },
  );
  return { action, prevented, stopped };
}

describe('handleChartKey 组合键', () => {
  it('Ctrl/Meta/Alt 组合键一律不拦截、不触发图表动作', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      for (const key of ['r', 's', 'p', 'ArrowLeft', 'ArrowRight', ' ']) {
        const r = press(key, { [mod]: true });
        expect(r.action, `${mod}+${key}`).toBeNull();
        expect(r.prevented, `${mod}+${key}`).toBe(false);
        expect(r.stopped, `${mod}+${key}`).toBe(false);
      }
    }
  });

  it('输入法组合输入中不抢方向键', () => {
    expect(press('ArrowRight', { isComposing: true }).action).toBeNull();
    expect(press('ArrowRight', { isComposing: true }).prevented).toBe(false);
    expect(press('Process').action).toBeNull();
  });
});

describe('handleChartKey 裸键', () => {
  it('方向键、Home/End、空格映射到对应动作', () => {
    expect(press('ArrowRight').action).toBe('next');
    expect(press('ArrowLeft').action).toBe('prev');
    expect(press('ArrowUp').action).toBe('max');
    expect(press('ArrowDown').action).toBe('min');
    expect(press('Home').action).toBe('first');
    expect(press('End').action).toBe('last');
    expect(press(' ').action).toBe('togglePlay');
    expect(press('Escape').action).toBe('escape');
  });

  it('字母键不区分大小写', () => {
    expect(press('s').action).toBe('summary');
    expect(press('S').action).toBe('summary');
    expect(press('r').action).toBe('reread');
    expect(press('P').action).toBe('reference');
    expect(press('h').action).toBe('help');
  });

  it('有效动作会阻止默认行为并停止冒泡', () => {
    const r = press('ArrowRight');
    expect(r.prevented).toBe(true);
    expect(r.stopped).toBe(true);
  });

  it('无关键不拦截', () => {
    const r = press('q');
    expect(r.action).toBeNull();
    expect(r.prevented).toBe(false);
  });

  it('Tab 只在闭眼模式下拦截并交给退出按钮', () => {
    const blind = press('Tab', {}, true);
    expect(blind.action).toBe('blindExit');
    expect(blind.prevented).toBe(true);
    expect(press('Tab').action).toBeNull();
    expect(press('Tab', { ctrlKey: true }, true).action).toBeNull();
  });
});
