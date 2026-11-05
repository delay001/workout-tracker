// Вкладка «Шаги» в «Статистике» (только apk): шаги из Health Connect
import { h, statRow } from './dom';
import { t } from './i18n';

export async function renderStepsView(root: HTMLElement): Promise<void> {
  try {
    await showSteps(root);
  } catch {
    // Health Connect ответил ошибкой (например, доступ отозвали): подсказка вместо сломанной вкладки
    root.replaceChildren(h('p', { className: 'hint' }, t('steps.error')));
  }
}

async function showSteps(root: HTMLElement): Promise<void> {
  const native = await import('./native');
  const access = await native.stepsAccess();
  if (access === 'missing') {
    root.replaceChildren(h('p', { className: 'hint' }, t('steps.missing')));
    return;
  }
  if (access === 'denied') {
    root.replaceChildren(
      h('p', { className: 'hint' }, t('steps.why')),
      h(
        'button',
        {
          type: 'button',
          className: 'button',
          onclick: async () => {
            await native.requestStepsAccess();
            await renderStepsView(root);
          },
        },
        t('steps.allow'),
      ),
    );
    return;
  }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = await native.stepsBetween(midnight, now);
  root.replaceChildren(statRow(t('steps.today'), today.toLocaleString()));
}
