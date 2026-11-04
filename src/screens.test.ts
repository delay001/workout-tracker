// @vitest-environment happy-dom
// Сценарии целиком через экраны: приложение запускается в имитации браузера, тест нажимает кнопки по надписям
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';

let t: typeof import('./i18n').t;

async function waitFor<T>(find: () => T | null | undefined | Promise<T | null | undefined>, what: string): Promise<T> {
  // До 10 секунд: экран статистики в имитации браузера рисуется не мгновенно
  for (let i = 0; i < 500; i++) {
    const found = await find();
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

describe('экраны', { timeout: 30_000 }, () => {
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
    // Плитки с числами есть и на главном экране: сначала дождаться, что открылась именно статистика
    await heading(t('tab.stats'));
    const tile = await waitFor(() => document.querySelector('.stat strong'), 'плитка статистики');
    expect(tile.textContent).toBe('1');
  });

  it('тренировка: перетаскивание меняет порядок упражнений, «Отменить» возвращает удаленный подход', async () => {
    const { getActiveWorkout } = await import('./workouts');
    const names = async (): Promise<string[]> => {
      const { db } = await import('./db');
      const workout = await getActiveWorkout();
      const exercises = await db.exercises.bulkGet(workout?.exercises.map((item) => item.exerciseId) ?? []);
      return exercises.map((exercise) => exercise?.name ?? '');
    };
    const addSet = async (name: string, weight: string, reps: string): Promise<void> => {
      (await button(t('workout.addExercise'))).click();
      type(await input(t('common.name')), name);
      (await button(name)).click();
      type(await input(t('weight.input', { unit: 'кг' })), weight);
      type(await input(t('set.reps')), reps);
      (await button(t('set.record'))).click();
      await waitFor(() => document.querySelector('.card-current .set-list li'), `подход в «${name}»`);
    };

    (await button(t('tab.workout'))).click();
    await waitFor(() => !document.querySelector('h1')?.textContent?.includes(t('tab.stats')), 'главный экран');
    (await button(t('home.newEntry'))).click();
    (await button(t('type.upper'))).click();
    await addSet('Жим лежа', '60', '8');
    await addSet('Подтягивания', '0', '10');
    expect(await names()).toEqual(['Жим лежа', 'Подтягивания']);

    // Тянем «Жим лежа» за ручку вниз и отпускаем
    const handle = await waitFor(() => document.querySelector<HTMLElement>('.card .drag-handle'), 'ручка перетаскивания');
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 500, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 500, pointerId: 1 }));
    await waitFor(async () => (await names())[0] === 'Подтягивания', 'новый порядок в базе');
    expect(await names()).toEqual(['Подтягивания', 'Жим лежа']);

    // Удаляем подход в раскрытом упражнении и отменяем удаление
    const sets = async (): Promise<number> =>
      (await getActiveWorkout())?.exercises.reduce((sum, item) => sum + item.sets.length, 0) ?? 0;
    expect(await sets()).toBe(2);
    [...document.querySelectorAll<HTMLButtonElement>('.card-current button')]
      .find((item) => item.ariaLabel === t('set.delete'))!
      .click();
    (await button(t('common.undo'))).click();
    await waitFor(async () => (await sets()) === 2 && document.querySelectorAll('.set-list li').length === 2, 'подход вернулся');
  });
});
