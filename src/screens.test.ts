// @vitest-environment happy-dom
// Сценарии целиком через экраны: приложение запускается в имитации браузера, тест нажимает кнопки по надписям
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';

let t: typeof import('./i18n').t;

async function waitFor<T>(find: () => T | null | undefined, what: string): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const found = find();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Не появилось: ${what}`);
}

const button = (text: string): Promise<HTMLButtonElement> =>
  waitFor(
    () => [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === text),
    `кнопка «${text}»`,
  );

// Поле по началу подписи: у обязательных полей в подписи еще звездочка
const input = (label: string): Promise<HTMLInputElement> =>
  waitFor(
    () =>
      [...document.querySelectorAll('label.field')]
        .find((item) => item.querySelector('span')?.textContent?.startsWith(label))
        ?.querySelector('input'),
    `поле «${label}»`,
  );

function type(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

const heading = (text: string): Promise<Element> =>
  waitFor(() => [...document.querySelectorAll('h1')].find((item) => item.textContent === text), `заголовок «${text}»`);

beforeAll(async () => {
  localStorage.setItem('language', 'ru');
  document.body.innerHTML = '<div id="app"></div>';
  // В имитации браузера нет анимаций; экранам они не важны
  Element.prototype.animate ??= (() => ({}) as Animation) as never;
  const { setSetting } = await import('./settings');
  await setSetting('onboarded', 'yes');
  ({ t } = await import('./i18n'));
  await import('./main');
});

describe('экраны', () => {
  it('тренировка: начать, добавить упражнение и подход, завершить, увидеть в статистике', async () => {
    (await button(t('home.newEntry'))).click();
    (await button(t('type.upper'))).click();

    (await button(t('workout.addExercise'))).click();
    type(await input(t('common.name')), 'Жим лежа');
    (await button('Жим лежа')).click();

    type(await input(t('weight.input', { unit: 'кг' })), '60');
    type(await input(t('set.reps')), '8');
    (await button(t('set.record'))).click();
    await waitFor(() => document.querySelector('.set-list li'), 'записанный подход');
    expect(document.querySelector('.set-list li')?.textContent).toContain('60');

    (await button(t('workout.finish'))).click();
    type(await input(t('workout.hours')), '1');
    type(await input(t('workout.minutes')), '0');
    document.querySelector<HTMLInputElement>('input[name="rating"]')?.click();
    (await button(t('workout.finishShort'))).click();
    await heading(t('finish.title'));

    (await button(t('finish.done'))).click();
    (await button(t('tab.stats'))).click();
    const tile = await waitFor(() => document.querySelector('.stat strong'), 'плитка статистики');
    expect(tile.textContent).toBe('1');
  });
});
