import LegalPage from '@/components/LegalPage';

export const metadata = { title: 'Help · Heavy' };

export default function Help() {
  return (
    <LegalPage
      title="Help"
      updated="29 September 2026"
      sections={[
        { h: 'How do I start?', p: ['Open Plan, choose a plan (the Push / Pull / Legs starter is included) and tap Use this plan. Then go to Today and tap Start workout.'] },
        { h: 'How do I change a plan?', p: ['Starter plans are read-only. Tap Duplicate to make your own copy, then Edit to change days, exercises, sets, reps and rest times. You can also build one from scratch with + New.'] },
        { h: 'How do I log a set?', p: ['Adjust the weight and reps (they start from your last session), then tap Done. A rest timer starts automatically. Tap Skip to end it early, or use −15s and +15s to change that rest.'] },
        { h: 'Can I fix a set I already logged?', p: ['Yes. Tap the set at the top of the exercise, change the numbers and tap Update. Use Undo to remove it. Swap replaces an exercise for that workout only; your plan does not change.'] },
        { h: 'How is my streak counted?', p: ['It is the number of weeks in a row with at least one finished workout. Choose the first day of your week in Profile › Settings.'] },
        { h: 'What is est. 1RM?', p: ['An estimate of the heaviest single rep you could lift, worked out from the weight and reps of a set. It lets you compare sets with different rep counts.'] },
        { h: 'What do Apple Health and lock-screen alerts need?', p: ['The iPhone app. Both are optional. Connect Health in Profile › Apple Health. Rest alerts appear on your lock screen after you allow notifications.'] },
        { h: 'How do I delete my data?', p: ['Profile › Delete account permanently removes your account and all of your training data.'] },
        { h: 'Contact', p: ['Questions or problems? Email mohamed@el-samman.com.'] },
      ]}
    />
  );
}
