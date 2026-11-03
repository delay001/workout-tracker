import { h } from './dom';
import { t } from './i18n';
import { getSetting } from './settings';

const SIZE = 160;

// Заголовок вкладки с аватаром справа: по нажатию на аватар открываются настройки
export async function pageHeader(title: string, onOpenSettings: () => void): Promise<HTMLElement> {
  const name = await getSetting('name');
  const avatar = await getSetting('avatar');
  return h(
    'div',
    { className: 'home-header' },
    h('h1', {}, title),
    h(
      'button',
      { type: 'button', className: 'avatar-button', ariaLabel: t('settings.open'), onclick: onOpenSettings },
      avatar
        ? h('img', { className: 'avatar', src: avatar, alt: '' })
        : h('span', { className: 'avatar avatar-empty' }, name ? name[0].toUpperCase() : '👤'),
    ),
  );
}

// Уменьшает фото до квадрата, чтобы аватар не занимал много места в базе и в копии
export async function resizeAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas
    .getContext('2d')
    ?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return canvas.toDataURL('image/jpeg', 0.85);
}
