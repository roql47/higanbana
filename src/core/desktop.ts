import { isTauri, invoke } from '@tauri-apps/api/core';

export const isDesktop = () => isTauri();

/** Bounded local diagnostics for missing textures and driver failures in packaged builds. */
export function installDesktopDiagnostics() {
  if (!isDesktop()) return;
  let count = 0;
  const report = (message: string) => {
    if (count++ < 200) void invoke('report_diagnostic', { message: message.slice(0, 4096) }).catch(() => {});
  };
  const describe = (value: unknown) => {
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
    try { return typeof value === 'string' ? value : JSON.stringify(value); } catch { return String(value); }
  };
  for (const level of ['info', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => { original(...args); report(`[${level}] ${args.map(describe).join(' ')}`); };
  }
  window.addEventListener('error', e => report(`[error] ${e.message} ${e.filename}:${e.lineno}`));
  document.addEventListener('securitypolicyviolation', e => report(`[csp] ${e.effectiveDirective}: ${e.blockedURI}`));
  window.addEventListener('unhandledrejection', e => report(`[promise] ${describe(e.reason)}`));
  report(`[startup] ${new Date().toISOString()} ${navigator.userAgent}`);
}
let nativeFullscreen = false;
export const isFullscreen = () => isDesktop() ? nativeFullscreen : !!document.fullscreenElement;
export const fullscreenAvailable = () => isDesktop() || !!document.fullscreenEnabled;

export async function toggleFullscreen() {
  try {
    if (isDesktop()) {
      nativeFullscreen = await invoke<boolean>('toggle_fullscreen');
      document.dispatchEvent(new Event('fullscreenchange'));
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen?.();
  } catch (error) { console.warn('[window] 전체 화면 전환 실패', error); }
}

export async function closeDesktop() {
  if (isDesktop()) await invoke('close_game');
}

/** Only the selected language's compact fonts are decoded before canvas text is drawn. */
export async function prepareLocalFonts(language: 'ko' | 'ja') {
  const suffix = language === 'ko' ? 'KR' : 'JP';
  await Promise.all([
    document.fonts.load(`400 16px "Higanbana Serif ${suffix}"`),
    document.fonts.load(`600 16px "Higanbana Serif ${suffix}"`),
    document.fonts.load(`400 16px "Higanbana Hand ${suffix}"`),
  ]).catch(error => { console.warn('[fonts] 로컬 서체 로딩 실패 — 시스템 서체 사용', error); });
}
