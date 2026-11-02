import { todayLocal } from './dates';
import { h } from './dom';
import { getNameKeys, importParsedWorkouts, parseWorkoutsText, type ParsedText } from './textImport';

export async function renderImportScreen(root: HTMLElement, onBack: () => void): Promise<void> {
  const text = h('textarea', { rows: 8, ariaLabel: 'Текст тренировок' });
  const file = h('input', { type: 'file', hidden: true });
  const result = h('div');

  file.onchange = async () => {
    const chosen = file.files?.[0];
    if (chosen) {
      text.value = await chosen.text();
    }
  };

  function showResult(parsed: ParsedText): void {
    const sets = parsed.workouts.flatMap((workout) => workout.entries).flatMap((entry) => entry.sets);

    result.replaceChildren(
      h('p', {}, `Тренировок: ${parsed.workouts.length}, подходов: ${sets.length}`),
      ...(parsed.skipped.length > 0
        ? [
            h('p', { className: 'hint' }, `Не распознано строк: ${parsed.skipped.length}. Их можно исправить в тексте и разобрать снова.`),
            h('ul', { className: 'skipped' }, ...parsed.skipped.map((line) => h('li', {}, line))),
          ]
        : []),
      ...(parsed.workouts.length > 0
        ? [
            h(
              'button',
              {
                type: 'button',
                className: 'button',
                onclick: async () => {
                  const added = await importParsedWorkouts(parsed.workouts);
                  const repeated = parsed.workouts.length - added;
                  result.replaceChildren(
                    h('p', {}, `Добавлено тренировок: ${added}. Уже были в истории: ${repeated}.`),
                  );
                },
              },
              'Добавить в историю',
            ),
          ]
        : []),
    );
  }

  root.replaceChildren(
    h(
      'div',
      { className: 'screen' },
      h('h1', {}, 'Старые записи'),
      h(
        'p',
        { className: 'hint' },
        'Строка с днём и датой («Верх 25.10.26»), под ней упражнения («Жим лёжа 100кг 3 на 3»). Текущие данные не удаляются.',
      ),
      text,
      file,
      h(
        'button',
        { type: 'button', className: 'button button-secondary', onclick: () => file.click() },
        'Взять из файла',
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button',
          onclick: async () => showResult(parseWorkoutsText(text.value, await getNameKeys(), todayLocal())),
        },
        'Разобрать',
      ),
      result,
      h(
        'button',
        { type: 'button', className: 'button button-secondary bottom-action', onclick: onBack },
        'Назад',
      ),
    ),
  );
}
