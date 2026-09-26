import LegalPage from '@/components/LegalPage';

export const metadata = { title: 'Privacy Policy · Heavy' };

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      updated="26 September 2026"
      sections={[
        { h: 'Who we are', p: ['Heavy is operated by Mohamed El-Samman. Contact: mohamed@el-samman.com.'] },
        { h: 'What we collect', p: [
          'Account: your email address and a password. Passwords are stored only as a secure hash by our authentication provider.',
          'Training data you enter: workouts, sets (weight and reps), notes, bodyweight, body measurements and app settings.',
          'Apple Health (iPhone app, only if you connect it): weight, body fat, lean body mass, height, resting heart rate, daily steps, daily active energy, sleep, and heart rate and active energy during your Heavy workouts. Heavy also saves each finished workout to Apple Health as a strength training session. You choose what to share in Apple\'s permission screen and can change it any time in iPhone Settings → Health → Data Access & Devices → Heavy.',
          'We do not collect your location, contacts, advertising identifiers or analytics about how you use the app.',
        ] },
        { h: 'How we use it', p: [
          'Only to run the app for you: to save your workouts, show your history and calculate your progress. We do not sell or share your data, show ads, or use it for tracking.',
          'Health data read from Apple Health is used only to show your body and recovery trends in Heavy. It is never used for advertising or marketing, never sold, never shared with third parties, and never stored in iCloud.',
        ] },
        { h: 'Where it is stored', p: ['Your data is stored with Supabase (database and sign-in), hosted in Frankfurt, Germany. The web version is served by Vercel. Both act only as processors on our behalf.'] },
        { h: 'Keeping and deleting your data', p: [
          'We keep your data while your account exists.',
          'You can delete your account at any time in the app: Profile → Delete account. This permanently removes your account and all of your training data straight away.',
        ] },
        { h: 'Your rights', p: ['You can ask for a copy of your data, a correction or deletion by emailing mohamed@el-samman.com.'] },
        { h: 'Changes', p: ['If this policy changes, we will update the date at the top of this page.'] },
      ]}
    />
  );
}
