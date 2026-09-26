import LegalPage from '@/components/LegalPage';

export const metadata = { title: 'Terms & Health Disclaimer · Heavy' };

export default function Terms() {
  return (
    <LegalPage
      title="Terms"
      updated="26 September 2026"
      sections={[
        { h: 'Health disclaimer', p: [
          'Heavy is a logging and tracking tool. It is not medical advice and does not replace a doctor, physiotherapist or qualified coach.',
          'Speak to a medical professional before starting a new training programme, especially if you have an injury, a health condition, or are returning after a break.',
          'Stop immediately if you feel pain, dizziness or shortness of breath. You train at your own risk.',
        ] },
        { h: 'Exercise instructions', p: ['Instructions and images show general technique only. Use a weight you can control and ask a qualified coach to check your form.'] },
        { h: 'Your account', p: ['Keep your password private. You are responsible for activity on your account. You can delete it at any time from Profile → Delete account.'] },
        { h: 'Availability', p: ['We aim to keep the app available but cannot guarantee it will always be uninterrupted or error-free.'] },
        { h: 'Contact', p: ['mohamed@el-samman.com'] },
      ]}
    />
  );
}
