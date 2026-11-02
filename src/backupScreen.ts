import { exportData, importData, parseBackup } from './backup';

function downloadJson(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function localDate(): string {
  // Шведский формат даты совпадает с ГГГГ-ММ-ДД
  return new Date().toLocaleDateString('sv-SE');
}

export function renderBackupScreen(root: HTMLElement): void {
  root.innerHTML = `
    <h2>Резервная копия</h2>
    <p class="hint">Данные хранятся только на этом телефоне. Регулярно сохраняй копию в файл.</p>
    <button type="button" class="button" id="export">Сохранить копию в файл</button>
    <button type="button" class="button button-secondary" id="import">Восстановить из файла</button>
    <input type="file" id="import-file" hidden />
    <p class="status" id="backup-status" role="status"></p>
  `;

  const status = root.querySelector<HTMLParagraphElement>('#backup-status')!;
  const fileInput = root.querySelector<HTMLInputElement>('#import-file')!;

  root.querySelector('#export')!.addEventListener('click', async () => {
    const backup = await exportData();
    downloadJson(`workout-backup-${localDate()}.json`, JSON.stringify(backup, null, 2));
    status.textContent = `Сохранено: упражнений ${backup.exercises.length}, тренировок ${backup.workouts.length}`;
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
        `В копии: упражнений ${backup.exercises.length}, тренировок ${backup.workouts.length}.\n\n` +
        'Все текущие данные будут заменены. Продолжить?';
      if (!confirm(question)) {
        return;
      }

      await importData(backup);
      status.textContent = `Восстановлено: упражнений ${backup.exercises.length}, тренировок ${backup.workouts.length}`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Не удалось прочитать файл';
    }
  });
}
