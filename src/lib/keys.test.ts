import { describe, expect, it } from 'vitest';
import { handleChartKey, handleGlobalKey, type ChartKeyEvent } from './keys';

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

  it('长按空格阻止默认滚动，但不会反复切换播放状态', () => {
    const r = press(' ', { repeat: true });
    expect(r.action).toBeNull();
    expect(r.prevented).toBe(true);
    expect(r.stopped).toBe(true);
    expect(press('s', { repeat: true }).action).toBeNull();
  });

  it('长按方向键仍可连续导航', () => {
    const r = press('ArrowRight', { repeat: true });
    expect(r.action).toBe('next');
    expect(r.prevented).toBe(true);
  });

  it('B、T、1–4 只在图表焦点内映射', () => {
    expect(press('b').action).toBe('blindToggle');
    expect(press('T').action).toBe('ttsToggle');
    expect(press('1').action).toBe('switch1');
    expect(press('4').action).toBe('switch4');
    expect(press('5').action).toBeNull();
  });

  it('Tab 只在闭眼模式下拦截并交给退出按钮', () => {
    const blind = press('Tab', {}, true);
    expect(blind.action).toBe('blindExit');
    expect(blind.prevented).toBe(true);
    expect(press('Tab').action).toBeNull();
    expect(press('Tab', { ctrlKey: true }, true).action).toBeNull();
  });
});

describe('handleGlobalKey 全局范围', () => {
  const run = (
    key: string,
    ctx: Partial<{ asked: boolean; tourRunning: boolean; blind: boolean; typing: boolean }> = {},
  ) => {
    let prevented = false;
    const action = handleGlobalKey(
      {
        key,
        preventDefault: () => {
          prevented = true;
        },
      },
      { asked: true, tourRunning: false, blind: false, typing: false, ...ctx },
    );
    return { action, prevented };
  };

  it('普通按钮/空白处按 B、T、1–4、方向键、S 不触发任何图表动作', () => {
    for (const key of ['b', 't', '1', '4', 'ArrowRight', 's', ' ']) {
      const r = run(key);
      expect(r.action, key).toBeNull();
      expect(r.prevented, key).toBe(false);
    }
  });

  it('导览中任意键取消导览', () => {
    expect(run('q', { tourRunning: true })).toEqual({ action: 'abortTour', prevented: true });
  });

  it('闭眼模式下 Esc 退出', () => {
    expect(run('Escape', { blind: true }).action).toBe('exitBlind');
    expect(run('Escape', { blind: false }).action).toBeNull();
  });

  it('闭眼模式下焦点在文本框时 Esc 仍退出', () => {
    expect(run('Escape', { blind: true, typing: true }).action).toBe('exitBlind');
  });

  it('未开启闭眼模式时文本框 Esc 不被拦截', () => {
    expect(run('Escape', { blind: false, typing: true })).toEqual({
      action: null,
      prevented: false,
    });
  });

  it('首次运行对话框未选择前不响应全局按键', () => {
    expect(run('q', { asked: false, tourRunning: true }).action).toBeNull();
  });
});
