import type { WorkoutType } from './db';
import { field, h } from './dom';
import { getTemplate, getWorkoutTypes, saveTemplate, searchOptions, workoutTypeName } from './workouts';
import { t } from './i18n';

export async function renderTemplateSettings(root: HTMLElement, onBack: () => void): Promise<void> {
  function backButton(onclick: () => void): HTMLButtonElement {
    return h(
      'button',
      { type: 'button', className: 'button button-secondary bottom-action', onclick },
      t('common.back'),
    );
  }

  async function showTemplate(type: WorkoutType): Promise<void> {
    const names = await getTemplate(type);
    const options = await searchOptions('');
    const input = h('input', { type: 'text', autocomplete: 'off' });
    input.setAttribute('list', 'exercise-names');
    const error = h('p', { className: 'error', role: 'alert' });

    async function save(next: string[]): Promise<void> {
      await saveTemplate(type, next);
      await showTemplate(type);
    }

    const rows = names.map((name, index) =>
      h(
        'li',
        { className: 'set-row' },
        name,
        h(
          'button',
          {
            type: 'button',
            className: 'remove-button',
            ariaLabel: t('template.remove', { name }),
            onclick: () => void save(names.filter((_, other) => other !== index)),
          },
          '✕',
        ),
      ),
    );

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, t('template.title', { type: workoutTypeName(type) })),
        h('p', { className: 'hint' }, t('template.hint')),
        h('ol', { className: 'set-list' }, ...rows),
        h(
          'form',
          {
            onsubmit: (event: Event) => {
              event.preventDefault();
              const name = input.value.trim();
              if (!name || names.includes(name)) {
                error.textContent = name ? t('template.exists') : t('template.enterName');
                return;
              }
              void save([...names, name]);
            },
          },
          field(t('workout.addExercise'), input),
          h('datalist', { id: 'exercise-names' }, ...options.map((option) => h('option', { value: option.name }))),
          error,
          h('button', { type: 'submit', className: 'button' }, t('common.add')),
        ),
        backButton(() => void showList()),
      ),
    );
  }

  async function showList(): Promise<void> {
    const types = await getWorkoutTypes();
    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, t('settings.templates')),
        ...types.map((type) =>
          h(
            'button',
            { type: 'button', className: 'list-button', onclick: () => void showTemplate(type) },
            workoutTypeName(type),
          ),
        ),
        backButton(onBack),
      ),
    );
  }

  await showList();
}
