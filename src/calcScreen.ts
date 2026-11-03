import { getBodyWeights } from './bodyWeight';
import { formatDate, todayLocal } from './dates';
import { db } from './db';
import { field, h } from './dom';
import { radioChips, segmented } from './ui';
import { activityFor, bodyMassIndex, dailyCalories, estimateOneRepMax, navyBodyFat, type Activity, type Sex } from './formulas';
import { LOCALE, t } from './i18n';
import { getMeasurements } from './measurements';
import { getSetting, setSetting } from './settings';
import { numberInput } from './ui';
import { formatWeight, fromWeight, toWeight, weightUnit } from './units';
import { bestSet, getExerciseHistory, getFinishedWorkouts } from './workouts';
import { shiftDays } from './volume';

export async function renderCalcScreen(root: HTMLElement, onBack: () => void): Promise<void> {
  const bench = await db.exercises.where('nameKey').equals('жим лежа').first();
  const benchSets = bench ? (await getExerciseHistory(bench.id)).flatMap((entry) => entry.sets) : [];
  const best = bestSet(benchSets);

  const weight = numberInput('decimal', best ? String(toWeight(best.weight)) : '');
  const reps = numberInput('integer', best ? String(best.reps) : '', 2);
  const result = h('div', { className: 'calc-result' });

  function showEstimate(): void {
    const kg = fromWeight(Number(weight.value));
    const count = Number(reps.value);
    if (!(kg > 0) || kg > 700 || !(count >= 1 && count <= 12)) {
      result.replaceChildren(h('p', { className: 'hint' }, t('calc.enterSet')));
      return;
    }
    const estimate = estimateOneRepMax(kg, count);
    result.replaceChildren(
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

  // Калории: возраст берется из знакомства и сохраняется, если его поправить здесь
  const age = numberInput('integer', await getSetting('age'), 3);
  const recent = (await getFinishedWorkouts()).filter((workout) => workout.date >= shiftDays(todayLocal(), -28)).length;
  let activity: Activity = activityFor(recent / 4);
  const calories = h('div');
  function showCalories(): void {
    const years = Number(age.value);
    if (!(heightCm > 0) || !bodyKg || !(years >= 14 && years <= 100)) {
      calories.replaceChildren(h('p', { className: 'hint' }, t('calc.needCalories')));
      return;
    }
    const keep = dailyCalories(sex, bodyKg, heightCm, years, activity);
    const row = (label: string, value: number): HTMLElement =>
      h('p', { className: 'set-row' }, label, h('strong', {}, t('calc.kcal', { value: value.toLocaleString(LOCALE) })));
    calories.replaceChildren(
      row(t('calc.keep'), keep),
      row(t('calc.cut'), Math.round((keep * 0.85) / 10) * 10),
      row(t('calc.bulk'), Math.round((keep * 1.1) / 10) * 10),
    );
  }
  age.addEventListener('input', showCalories);
  age.addEventListener('change', () => void setSetting('age', age.value));
  showCalories();

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
      h('h2', {}, t('calc.calories')),
      field(t('calc.age'), age),
      h(
        'div',
        { className: 'field' },
        h('span', {}, t('calc.activity')),
        segmented(
        radioChips<Activity>(
          'activity',
          t('calc.activity'),
          [
            ['low', t('calc.activityLow')],
            ['medium', t('calc.activityMedium')],
            ['high', t('calc.activityHigh')],
            ['veryHigh', t('calc.activityVeryHigh')],
          ],
          activity,
          (value) => {
            activity = value;
            showCalories();
          },
        ),
      ),
      ),
      calories,
      ...(lastWeight ? [h('p', { className: 'hint' }, t('calc.caloriesFrom', { weight: formatWeight(lastWeight.kg), date: formatDate(lastWeight.date) }))] : []),
      h('p', { className: 'hint' }, t('calc.caloriesNote')),
      h(
        'button',
        { type: 'button', className: 'button button-secondary bottom-action', onclick: onBack },
        t('common.back'),
      ),
    ),
  );
}
