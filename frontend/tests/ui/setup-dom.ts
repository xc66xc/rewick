/*
 * jsdom 缺少 Base UI / floating-ui 依赖的浏览器 API,按需补齐(幂等,仅供 tests/ui 引入)。
 */
const g = globalThis as unknown as Record<string, unknown>

g.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined' && window.matchMedia === undefined) {
  window.matchMedia = ((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
