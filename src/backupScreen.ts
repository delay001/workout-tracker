import { exportData, importData, parseBackup, type Backup } from './backup';
import { todayLocal } from './dates';
import { confirmDialog } from './dom';
import { saveFile } from './files';
import { parseHaptics, setHaptics } from './haptics';
import { applySavedLook, getSetting, setSetting } from './settings';
import { t } from './i18n';

function countsOf(backup: Backup): { exercises: number; workouts: number } {
  return { exercises: backup.exercises.length, workouts: backup.workouts.length };
}

export function renderBackupScreen(root: HTMLElement, onImported: (message: string) => void): void {
  root.innerHTML = `
    <h2>${t('backup.title')}</h2>
    <p class="hint">${t('backup.hint')}</p>
    <button type="button" class="button" id="export">${t('backup.save')}</button>
    <button type="button" class="button button-secondary" id="import">${t('backup.restore')}</button>
    <input type="file" id="import-file" hidden />
    <p class="status" id="backup-status" role="status"></p>
  `;

  const status = root.querySelector<HTMLParagraphElement>('#backup-status')!;
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
