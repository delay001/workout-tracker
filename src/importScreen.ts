import { todayLocal } from './dates';
import { h } from './dom';
import { getNameKeys, importParsedWorkouts, parseWorkoutsText, type ParsedText } from './textImport';
import { t } from './i18n';

export async function renderImportScreen(root: HTMLElement, onBack: () => void): Promise<void> {
  const text = h('textarea', { rows: 8, ariaLabel: t('import.textLabel') });
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
      h('p', {}, t('import.found', { workouts: parsed.workouts.length, sets: sets.length })),
      ...(parsed.skipped.length > 0
        ? [
            h('p', { className: 'hint' }, t('import.skipped', { count: parsed.skipped.length })),
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
                    h('p', {}, t('import.done', { added, repeated })),
                  );
                },
              },
              t('import.add'),
            ),
          ]
        : []),
    );
  }

  root.replaceChildren(
    h(
      'div',
      { className: 'screen' },
      h('h1', {}, t('import.title')),
      h(
        'p',
        { className: 'hint' },
        t('import.hint'),
      ),
      text,
      file,
      h(
        'button',
        { type: 'button', className: 'button button-secondary', onclick: () => file.click() },
        t('import.fromFile'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button',
          onclick: async () => showResult(parseWorkoutsText(text.value, await getNameKeys(), todayLocal())),
        },
        t('import.parse'),
      ),
      result,
      h(
        'button',
        { type: 'button', className: 'button button-secondary bottom-action', onclick: onBack },
        t('common.back'),
      ),
    ),
  );
}
