import { exportData, importData, parseBackup, type Backup } from './backup';
import { todayLocal } from './dates';
import { confirmDialog } from './dom';
import { saveFile } from './files';
import { clearStopwatch } from './stopwatch';
import { getActiveWorkout } from './workouts';
import { parseHaptics, setHaptics } from './haptics';
import { applySavedLook, getSetting, setSetting } from './settings';
import { t } from './i18n';

// «сегодня», «вчера», «5 дней назад»
function daysAgo(date: string): string {
  const days = Math.round((Date.parse(`${todayLocal()}T00:00:00`) - Date.parse(`${date}T00:00:00`)) / 86_400_000);
  return days <= 0 ? t('backup.today') : days === 1 ? t('backup.yesterday') : t('backup.daysAgo', { count: days });
}

function countsOf(backup: Backup): { exercises: number; workouts: number } {
  return { exercises: backup.exercises.length, workouts: backup.workouts.length };
}

export function renderBackupScreen(root: HTMLElement, onImported: (message: string) => void): void {
  root.innerHTML = `
    <h2>${t('backup.title')}</h2>
    <p class="hint">${t(import.meta.env.MODE === 'apk' ? 'backup.autoHint' : 'backup.hint')}</p>
    <p class="hint" id="last-backup"></p>
    <button type="button" class="button" id="export">${t('backup.save')}</button>
    <button type="button" class="button button-secondary" id="import">${t('backup.restore')}</button>
    <input type="file" id="import-file" hidden />
    <p class="status" id="backup-status" role="status"></p>
  `;

  const status = root.querySelector<HTMLParagraphElement>('#backup-status')!;
  const last = root.querySelector<HTMLParagraphElement>('#last-backup')!;
  const showLast = async (): Promise<void> => {
    const date = await getSetting('lastBackupDate');
    last.textContent = date ? t('backup.last', { when: daysAgo(date) }) : t('backup.lastNever');
  };
  void showLast();
  const fileInput = root.querySelector<HTMLInputElement>('#import-file')!;

  root.querySelector('#export')!.addEventListener('click', async () => {
    const backup = await exportData();
    try {
      await saveFile(
        `workout-backup-${todayLocal()}.json`,
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      );
      status.textContent = t('backup.saved', countsOf(backup));
      // От этой даты считается напоминание «Пора сохранить копию»
      await setSetting('lastBackupDate', todayLocal());
      await showLast();
    } catch {
      status.textContent = t('backup.saveFailed');
    }
  });

  root.querySelector('#import')!.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) {
      return;
    }

    try {
      const backup = parseBackup(await file.text());
      const question =
        `${t('backup.inFile', countsOf(backup))}\n\n` +
        t('backup.replaceWarning');
      if (!(await confirmDialog(question))) {
        return;
      }

      // Начатая тренировка заменяется данными из файла: ее секундомер (и таймер в шторке) больше не нужен
      const active = await getActiveWorkout();
      if (active) clearStopwatch(active.id);
      await importData(backup);
      await applySavedLook();
      setHaptics(parseHaptics(await getSetting('haptics')));
      // В копии может быть начатая тренировка, поэтому экран строится заново
      onImported(t('backup.restored', countsOf(backup)));
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : t('backup.readFailed');
    }
  });
}
