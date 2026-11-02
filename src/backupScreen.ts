import { exportData, importData, parseBackup, type Backup } from './backup';
import { todayLocal } from './dates';
import { t } from './i18n';

function downloadJson(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

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
    downloadJson(`workout-backup-${todayLocal()}.json`, JSON.stringify(backup, null, 2));
    status.textContent = t('backup.saved', countsOf(backup));
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
      if (!confirm(question)) {
        return;
      }

      await importData(backup);
      // В копии может быть начатая тренировка, поэтому экран строится заново
      onImported(t('backup.restored', countsOf(backup)));
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : t('backup.readFailed');
    }
  });
}
