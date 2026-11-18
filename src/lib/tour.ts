/** 依次执行体验步骤，任一步被 AbortSignal 取消后不再继续 */
export async function runTour(signal: AbortSignal, steps: Array<() => Promise<void> | void>): Promise<void> {
  for (const step of steps) {
    if (signal.aborted) return;
    await step();
  }
}
