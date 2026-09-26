// Source of truth for the trainer's plans (Team Zoher "High Volume Pro Split" PDFs).
// target = reps per set (array length = number of sets). unit: 'reps' | 'steps'.

const T_FAST_UP = 'Up fast, 3 s down';
const T_CURL = 'Lower slow, lift fast, hold 1 s at top';
const T_SQUEEZE = 'Lower slowly, drive up fast, squeeze hard at the top';

const ex = (name, muscle, target, cue = null, extra = {}) => ({ name, muscle, target, cue, unit: 'reps', ...extra });

const CHEST_BI = [
  ex('Barbell Bench Press', 'Chest', [12, 12, 12, 12], T_FAST_UP),
  ex('Incline Dumbbell Press', 'Chest', [12, 12, 12, 12], T_FAST_UP),
  ex('Machine Flyes', 'Chest', [15, 15, 15, 15], 'Squeeze the chest at the close; contract on the way up'),
  ex('Dips', 'Chest', [15, 15, 15, 15], 'Hold 2 s at the bottom · 20 s rest only', { rest: 20 }),
  ex('Svend Press', 'Chest', [15, 12, 10, 10]),
  ex('Barbell Curl', 'Biceps', [10, 10, 10, 10, 10, 10]),
  ex('Machine Preacher Curl', 'Biceps', [20, 20, 15, 15], T_CURL),
  ex('Hammer Curl', 'Biceps', [15, 12, 10, 10], 'Lower slowly on every rep'),
  ex('Dumbbell Concentration Curl', 'Biceps', [20, 20, 15, 15], T_CURL),
];

const BACK_TRI = [
  ex('Lat Pulldown', 'Back', [10, 10, 10, 10], T_FAST_UP),
  ex('Barbell Bent-Over Row', 'Back', [10, 10, 10, 10]),
  ex('T-Bar Row', 'Back', [15, 15, 15, 15, 15]),
  ex('One-Arm Dumbbell Row', 'Back', [12, 10, 8, 6], 'Add weight every set'),
  ex('Seated Cable Row', 'Back', [15, 15, 15, 15, 15]),
  ex('Lying Triceps Extension', 'Triceps', [12, 12, 12, 12]),
  ex('Triceps Kickback', 'Triceps', [20, 20, 15, 15]),
  ex('Rope Pushdown', 'Triceps', [15, 15, 15, 15, 15]),
  ex('Overhead Dumbbell Extension', 'Triceps', [15, 15, 15, 15, 15]),
];

const LEGS = [
  ex('Barbell Squat', 'Quads', [20, 15, 12, 10], T_FAST_UP),
  ex('Leg Press', 'Quads', [20, 20, 15, 15], '2 s up, 3 s down'),
  ex('Goblet Squat', 'Quads', [15, 15, 12, 12]),
  ex('Stiff-Leg Deadlift', 'Hamstrings', [12, 12, 12, 12], 'Lower slowly, up fast, squeeze hamstrings at top · bar never touches the floor'),
  ex('Leg Curl', 'Hamstrings', [15, 15, 12, 12], 'Control the weight down, lift with force'),
  ex('Leg Extension', 'Quads', [15, 15, 12, 12], 'Hold and squeeze 2 s at top, lower slowly'),
  ex('Hack Squat', 'Quads', [15, 15, 12, 12], T_SQUEEZE),
  ex('Walking Lunges', 'Quads', [50, 50, 50, 50], 'Steps per set', { unit: 'steps' }),
  ex('Seated Calf Raise', 'Calves', [15, 15, 12, 12], T_SQUEEZE),
  ex('Standing Calf Raise', 'Calves', [15, 15, 12, 12], T_SQUEEZE),
];

const SHOULDERS_TRAPS = [
  ex('Standing Military Press', 'Shoulders', [12, 12, 12, 12], T_FAST_UP),
  ex('Seated Dumbbell Press', 'Shoulders', [12, 12, 12, 12], T_FAST_UP),
  ex('Bent-Over Rear Delt Flyes', 'Rear Delts', [15, 15, 15, 15, 15]),
  ex('Lateral Raises', 'Shoulders', [20, 20, 15, 15, 10, 10], 'PDF also notes "4 sets" — confirm with trainer'),
  ex('Reverse Pec Deck', 'Rear Delts', [15, 15, 15]),
  ex('Barbell Shrugs', 'Traps', [15, 15, 15, 15, 15], 'Hold 2 s at the top every rep'),
  ex('Dumbbell Upright Row', 'Shoulders', [15, 15, 15]),
  ex('Dumbbell Shrugs', 'Traps', [15, 15, 15, 15, 15], 'Hold 2 s at the top every rep'),
];

const CHEST_BACK = [
  ex('Incline Dumbbell Press', 'Chest', [12, 12, 12, 12], T_FAST_UP),
  ex('Lat Pulldown', 'Back', [10, 10, 10, 10], T_FAST_UP),
  ex('Machine Flyes', 'Chest', [15, 15, 15, 15], 'Squeeze the chest at the close; contract on the way up'),
  ex('One-Arm Dumbbell Row', 'Back', [12, 10, 8, 6], 'Add weight every set'),
  ex('Dips', 'Chest', [15, 15, 15, 15], 'Hold 2 s at the bottom · 20 s rest only (name missing in PDF — assumed Dips)', { rest: 20 }),
  ex('Barbell Bent-Over Row', 'Back', [10, 10, 10, 10]),
  ex('Barbell Bench Press', 'Chest', [20, 20, 20, 20], 'Light weight — pump'),
  ex('Seated Cable Row', 'Back', [15, 15, 15, 15, 15]),
];

const ARMS = [
  ex('Barbell Curl', 'Biceps', [10, 10, 10, 10, 10, 10]),
  ex('Rope Pushdown', 'Triceps', [15, 15, 15, 15, 15]),
  ex('Machine Preacher Curl', 'Biceps', [20, 20, 15, 15], T_CURL),
  ex('Lying Triceps Extension', 'Triceps', [12, 12, 12, 12]),
  ex('Hammer Curl', 'Biceps', [15, 12, 10, 10], 'Lower slowly on every rep'),
  ex('Triceps Kickback', 'Triceps', [20, 20, 15, 15]),
  ex('Dumbbell Concentration Curl', 'Biceps', [20, 20, 15, 15], T_CURL),
  ex('Overhead Dumbbell Extension', 'Triceps', [15, 15, 15, 15, 15]),
];

export const plans = [
  {
    slug: 'split-1',
    name: 'High Volume Pro Split 1',
    description: '4 training days + 1 rest, rotating',
    days: [
      { name: 'Chest & Biceps', exercises: CHEST_BI },
      { name: 'Back & Triceps', exercises: BACK_TRI },
      { name: 'Legs', exercises: LEGS },
      { name: 'Shoulders & Traps', exercises: SHOULDERS_TRAPS },
      { name: 'Rest', rest: true, exercises: [] },
    ],
  },
  {
    slug: 'split-2',
    name: 'High Volume Pro Split 2',
    description: '6 training days + 1 rest, rotating',
    days: [
      { name: 'Chest & Biceps', exercises: CHEST_BI },
      { name: 'Back & Triceps', exercises: BACK_TRI },
      { name: 'Shoulders & Traps', exercises: SHOULDERS_TRAPS },
      { name: 'Chest & Back', exercises: CHEST_BACK },
      { name: 'Legs', exercises: LEGS },
      { name: 'Biceps & Triceps', exercises: ARMS },
      { name: 'Rest', rest: true, exercises: [] },
    ],
  },
];
