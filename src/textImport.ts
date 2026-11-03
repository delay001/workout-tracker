import { CARDIO_GROUP, CATALOG } from './catalog';
import { db, findOrCreateExercise, saveWorkout, type WorkoutExercise, type WorkoutSet } from './db';
import { normalize, searchOptions } from './workouts';

export interface ParsedEntry {
  name: string;
  sets: WorkoutSet[];
}

export interface ParsedWorkout {
  date: string;
  type: string;
  entries: ParsedEntry[];
  durationMin?: number;
  note?: string;
}

export interface ParsedText {
  workouts: ParsedWorkout[];
  skipped: string[];
}

// Ключ поиска → название упражнения
export type NameKeys = [string, string][];

const HEADING = /^([а-яё ]+?)\s+(\d{1,2})\.(\d{2})(?:\.(\d{2,4}))?\.?\s*г?\.?\s*(?:\(.*\))?$/i;
const ITEM = /^\d+\s*[.)]\s*(.+)$/;
const DURATION = /^время(?: тренировки)?:?\s*(?:(\d+):(\d+)|(\d+)\s*мин)/i;
const NOTE = /^заметки:\s*(.+)$/i;
const CARDIO = /\d\s*мин/i;
// Вес можно не писать только у коротких записей вида «8 на 3»
const SET_TOKENS =
  /(\d+(?:[.,]\d+)?)\s*(кг)?\s*на\s*(\d+)\s*на\s*(\d+)|(\d+(?:[.,]\d+)?)\s*(кг)?\s+(\d+)\s*на\s*(\d+)|(\d+(?:[.,]\d+)?)\s*(кг)?\s*(на|x|х|×)\s*(\d+)|,\s*(\d+)(?=\s*(?:,|$))/gi;

function parseWeight(text: string): number {
  return Math.round(Number(text.replace(',', '.')) * 2) / 2;
}

export function parseSets(text: string): WorkoutSet[] {
  const clean = text
    .toLowerCase()
    // Вес бывает записан в скобках: «(81кг) 8 на 3»
    .replace(/\((\d+(?:[.,]\d+)?\s*кг)[^)]*\)/g, ' $1 ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/на (?:каждую|одну)(?: руку)?|по одной руке|на руку/g, ' ')
    .replace(/(\d)\s*(?:кгт|кг|к|уг|аг)(?![а-яё])/g, '$1кг');

  const sets: WorkoutSet[] = [];
  const add = (weight: number, reps: number, count: number): void => {
    for (let index = 0; index < count; index++) {
      sets.push({ weight, reps, warmup: false });
    }
  };

  let lastWeight: number | undefined;
  for (const match of clean.matchAll(SET_TOKENS)) {
    if (match[1]) {
      lastWeight = parseWeight(match[1]);
      add(lastWeight, Number(match[3]), Number(match[4]));
    } else if (match[5]) {
      lastWeight = parseWeight(match[5]);
      add(lastWeight, Number(match[7]), Number(match[8]));
    } else if (match[9]) {
      const first = parseWeight(match[9]);
      const reps = Number(match[12]);
      const isWeight = Boolean(match[10]) || match[11] !== 'на' || sets.length > 0 || first >= 20;
      if (isWeight) {
        lastWeight = first;
        add(first, reps, 1);
      } else {
        // Упражнение со своим весом: «8 на 3» — восемь повторений, три подхода
        add(0, first, reps);
      }
    } else if (lastWeight !== undefined) {
      add(lastWeight, Number(match[13]), 1);
    }
  }
  return sets;
}

function workoutType(title: string): string {
  const key = title.trim().toLowerCase();
  if (key === 'низ' || key === 'ноги') {
    return 'lower';
  }
  return ['верх', 'грудь', 'спина', 'плечи'].includes(key) ? 'upper' : 'other';
}

// Без года берется последняя такая дата не позже сегодняшней
function fullDate(day: string, month: string, year: string | undefined, today: string): string {
  const pad = (value: string): string => value.padStart(2, '0');
  if (year) {
    return `${year.length === 2 ? `20${year}` : year}-${month}-${pad(day)}`;
  }
  const thisYear = `${today.slice(0, 4)}-${month}-${pad(day)}`;
  return thisYear <= today ? thisYear : `${Number(today.slice(0, 4)) - 1}-${month}-${pad(day)}`;
}

function findName(line: string, keys: NameKeys): { name: string; rest: string } | undefined {
  const text = normalize(line);
  for (const [key, name] of keys) {
    if (text.startsWith(key) && !/[а-яё]/.test(text[key.length] ?? '')) {
      return { name, rest: text.slice(key.length) };
    }
  }
  return undefined;
}

export function parseWorkoutsText(text: string, keys: NameKeys, today: string): ParsedText {
  const sortedKeys = [...keys].sort((a, b) => b[0].length - a[0].length);
  const workouts: ParsedWorkout[] = [];
  const skipped: string[] = [];
  let current: ParsedWorkout | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    // Строка могла быть скопирована из чата с датой и именем отправителя
    const line = rawLine.replace(/^\[[^\]]*\]\s*[^:]*:\s*/, '').trim();
    const heading = HEADING.exec(line);
    if (!line) {
      continue;
    }

    if (heading) {
      current = {
        date: fullDate(heading[2], heading[3], heading[4], today),
        type: workoutType(heading[1]),
        entries: [],
      };
      workouts.push(current);
      continue;
    }

    const duration = DURATION.exec(line);
    const note = NOTE.exec(line);
    const body = ITEM.exec(line)?.[1] ?? line;
    if (!current || line.endsWith(':')) {
      if (!line.endsWith(':')) {
        skipped.push(line);
      }
    } else if (duration) {
      current.durationMin = duration[3] ? Number(duration[3]) : Number(duration[1]) * 60 + Number(duration[2]);
    } else if (note) {
      current.note = [current.note, note[1]].filter(Boolean).join('. ');
    } else if (CARDIO.test(body) && !/\d\.\d{2}\.?$/.test(body)) {
      const cardio = findName(body, sortedKeys);
      const minutes = Number(/(\d+)\s*мин/i.exec(body)?.[1]);
      if (cardio && CATALOG.some((item) => item.name === cardio.name && item.group === CARDIO_GROUP)) {
        current.entries.push({ name: cardio.name, sets: [{ weight: 0, reps: 0, warmup: false, minutes }] });
      } else {
        current.note = [current.note, body].filter(Boolean).join('. ');
      }
    } else {
      const found = findName(body, sortedKeys);
      const sets = found ? parseSets(found.rest) : [];
      if (found && sets.length > 0) {
        current.entries.push({ name: found.name, sets });
      } else {
        skipped.push(line);
      }
    }
  }

  return { workouts: workouts.filter((workout) => workout.entries.length > 0), skipped };
}

export async function getNameKeys(): Promise<NameKeys> {
  return (await searchOptions('')).flatMap((option) =>
    option.keys.map((key): [string, string] => [key, option.name]),
  );
}

// Тренировка, которая уже есть в истории с той же датой и типом, пропускается
export async function importParsedWorkouts(workouts: ParsedWorkout[]): Promise<number> {
  let added = 0;
  for (const workout of workouts) {
    const exists = await db.workouts
      .where('date')
      .equals(workout.date)
      .filter((item) => item.type === workout.type)
      .count();
    if (exists > 0) {
      continue;
    }

    const exercises: WorkoutExercise[] = [];
    for (const entry of workout.entries) {
      const group = CATALOG.find((item) => item.name === entry.name)?.group;
      const { id } = await findOrCreateExercise(entry.name, group);
      const same = exercises.find((item) => item.exerciseId === id);
      if (same) {
        same.sets.push(...entry.sets);
      } else {
        exercises.push({ exerciseId: id, sets: entry.sets });
      }
    }

    const { entries: _entries, ...details } = workout;
    await saveWorkout({ ...details, status: 'finished', exercises });
    added++;
  }
  return added;
}
