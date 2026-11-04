import { getSetting } from './settings';

// Экран не гаснет, пока открыта начатая тренировка (настройка «Не гасить экран», по умолчанию включена).
// В apk это флаг окна Android, в браузере — Wake Lock: браузер снимает его, когда вкладка скрыта,
// поэтому при возвращении он берется снова.
let wanted = false;
let lock: WakeLockSentinel | undefined;

async function requestLock(): Promise<void> {
  if (lock || !('wakeLock' in navigator)) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => (lock = undefined));
  } catch {
    // Браузер отказал (например, экономия батареи): экран просто погаснет как обычно
  }
}

export async function keepAwake(on: boolean): Promise<void> {
  wanted = on && (await getSetting('keepAwake')) !== 'off';
  if (import.meta.env.MODE === 'apk') {
    const native = await import('./native');
    await native.setKeepAwake(wanted).catch(() => undefined);
    return;
  }
  if (wanted) {
    await requestLock();
  } else {
    await lock?.release();
    lock = undefined;
  }
}

if (import.meta.env.MODE !== 'apk' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted) void requestLock();
  });
}
