// 与 landing/index.html 原内联 tailwind.config 完全一致（Play CDN = Tailwind v3 引擎）
module.exports = {
  content: ['G:/coder/AI/agent/interview-copilot-3/landing/index.html'],
  theme: {
    extend: {
      colors: {
        ink: '#131212', heading: '#2A2A2E', body: '#484A58', mute: '#767680', faint: '#8D8E99',
        line: '#EBECF0', strong: '#E0E0E0', canvas: '#F2F5FA', fill: '#F7F8FA',
        accent: '#134CFF', 'accent-text': '#2454FF', 'accent-subtle': '#EAF2FF', 'accent-line': '#CEDDF5',
        success: '#06BF7F', 'success-subtle': '#E9F9F3', 'success-line': '#C9ECDD',
        danger: '#F1343A', 'danger-subtle': '#FEF0F1', 'danger-line': '#F6C6C8',
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', '"Cascadia Mono"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.04)',
        pop: '0 15px 35px rgba(0,0,0,0.05), 0 5px 15px rgba(0,0,0,0.03)',
      },
    },
  },
  corePlugins: { preflight: true },
};
