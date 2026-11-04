// Сохранение файла (резервная копия, картинка итогов года).
// В браузере файл скачивается. В apk скачивания нет: файл пишется в «Документы/WorkoutTracker»
// и открывается системное окно «Поделиться» (Telegram, Google Диск, почта).
// Ветка apk вырезается из браузерной сборки целиком, поэтому сайт работает как раньше.
export async function saveFile(fileName: string, blob: Blob): Promise<void> {
  if (import.meta.env.MODE === 'apk') {
    await saveInApk(fileName, blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function saveInApk(fileName: string, blob: Blob): Promise<void> {
  const { Directory, Encoding, Filesystem } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const isText = blob.type.startsWith('application/json') || blob.type.startsWith('text/');
  const data = isText ? await blob.text() : await toBase64(blob);
  const options = { path: `WorkoutTracker/${fileName}`, data, recursive: true, ...(isText ? { encoding: Encoding.UTF8 } : {}) };
  // Если в «Документы» записать нельзя (старый Android, нет доступа), файл кладется во временную папку приложения
  const saved = await Filesystem.writeFile({ ...options, directory: Directory.Documents }).catch(() =>
    Filesystem.writeFile({ ...options, directory: Directory.Cache }),
  );
  // Пользователь мог закрыть окно «Поделиться» — это не ошибка, файл уже сохранен
  await Share.share({ title: fileName, url: saved.uri }).catch(() => undefined);
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
