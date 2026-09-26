import { Suspense } from 'react';
import Workout from './Workout';

// Static-export friendly: the session id comes from ?id= instead of a dynamic route segment.
export default function WorkoutPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh grid place-items-center eyebrow">Loading</div>}>
      <Workout />
    </Suspense>
  );
}
