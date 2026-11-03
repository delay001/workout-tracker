import { getBodyWeights } from './bodyWeight';
import { formatDate } from './dates';
import { db } from './db';
import { field, h } from './dom';
import { bodyMassIndex, estimateOneRepMax, navyBodyFat, type Sex } from './formulas';
import { t } from './i18n';
import { getMeasurements } from './measurements';
import { getSetting } from './settings';
import { numberInput } from './ui';
import { formatWeight, fromWeight, toWeight, weightUnit } from './units';
import { bestSet, getExerciseHistory } from './workouts';

export async function renderCalcScreen(root: HTMLElement, onBack: () => void): Promise<void> {
  const bench = await db.exercises.where('nameKey').equals('жим лежа').first();
  const benchSets = bench ? (await getExerciseHistory(bench.id)).flatMap((entry) => entry.sets) : [];
  const best = bestSet(benchSets);

  const weight = numberInput('decimal', best ? String(toWeight(best.weight)) : '');
  const reps = numberInput('integer', best ? String(best.reps) : '', 2);
  const result = h('div');

  function showEstimate(): void {
    const kg = fromWeight(Number(weight.value));
    const count = Number(reps.value);
    if (!(kg > 0) || kg > 700 || !(count >= 1 && count <= 12)) {
      result.replaceChildren(h('p', { className: 'hint' }, t('calc.enterSet')));
      return;
    }
    const estimate = estimateOneRepMax(kg, count);
    result.replaceChildren(
      h('p', { className: 'set-row' }, t('calc.epley'), h('span', {}, formatWeight(estimate.epley))),
      h('p', { className: 'set-row' }, t('calc.brzycki'), h('span', {}, formatWeight(estimate.brzycki))),
      h('p', { className: 'set-row' }, t('calc.lombardi'), h('span', {}, formatWeight(estimate.lombardi))),
      h('p', { className: 'set-row' }, t('calc.average'), h('strong', {}, formatWeight(estimate.average))),
    );
  }
  weight.addEventListener('input', showEstimate);
  reps.addEventListener('input', showEstimate);
  showEstimate();

  const heightCm = Number(await getSetting('heightCm'));
  const sex: Sex = (await getSetting('sex')) === 'female' ? 'female' : 'male';
  const lastWeight = (await getBodyWeights()).at(-1);
  const bodyKg = lastWeight?.kg;
  // Берется самый свежий замер, где есть все нужное для формулы: запись с одной талией пропускается
  const measured = (await getMeasurements())
    .filter(({ values }) => values.waist && values.neck && (sex === 'male' || values.hips))
    .at(-1);
  const fat =
    heightCm > 0 && measured
      ? navyBodyFat(sex, heightCm, measured.values.waist, measured.values.neck, measured.values.hips)
      : undefined;

  root.replaceChildren(
    h(
      'div',
      { className: 'screen' },
      h('h1', {}, t('calc.title')),
      h('h2', {}, t('calc.oneRepMax')),
      h('p', { className: 'hint' }, t('calc.oneRepMaxHint')),
      h(
        'div',
        { className: 'set-inputs' },
        field(t('weight.input', { unit: weightUnit() }), weight),
        field(t('set.reps'), reps),
      ),
      result,
      h('h2', {}, t('calc.bmi')),
      h(
        'p',
        { className: 'set-row' },
        t('calc.bmiValue'),
        h('strong', {}, heightCm > 0 && bodyKg ? String(bodyMassIndex(bodyKg, heightCm)) : '—'),
      ),
      ...(heightCm > 0 && lastWeight
        ? [h('p', { className: 'hint' }, t('calc.bmiFrom', { weight: formatWeight(lastWeight.kg), date: formatDate(lastWeight.date) }))]
        : [h('p', { className: 'hint' }, t('calc.needHeightWeight'))]),
      h('p', { className: 'hint' }, t('calc.bmiNote')),
      h('h2', {}, t('calc.bodyFat')),
      h('p', { className: 'set-row' }, t('calc.bodyFatValue'), h('strong', {}, fat === undefined ? '—' : `${fat}%`)),
      h(
        'p',
        { className: 'hint' },
        fat === undefined || !measured ? t('calc.needMeasurements') : t('calc.bodyFatFrom', { date: formatDate(measured.date) }),
      ),
      h('p', { className: 'hint' }, t('calc.bodyFatNote')),
      h(
        'button',
        { type: 'button', className: 'button button-secondary bottom-action', onclick: onBack },
        t('common.back'),
      ),
    ),
  );
}
