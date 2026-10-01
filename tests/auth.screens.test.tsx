// Sign-in, password reset and e-mail confirmation screens. Supabase's auth calls are replaced by spies.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import Login from '@/app/login/page';
import ResetPassword from '@/app/reset-password/page';
import EmailConfirmed from '@/app/email-confirmed/page';
import { supabase } from '@/lib/supabase';
import { renderScreen } from './helpers';

const auth = supabase.auth;
const ok = { data: {}, error: null } as never;
const err = (message: string) => ({ data: {}, error: { message } }) as never;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

let reset: ReturnType<typeof vi.spyOn>, signIn: ReturnType<typeof vi.spyOn>, signUp: ReturnType<typeof vi.spyOn>, resend: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  reset = vi.spyOn(auth, 'resetPasswordForEmail').mockResolvedValue(ok);
  signIn = vi.spyOn(auth, 'signInWithPassword').mockResolvedValue(ok);
  signUp = vi.spyOn(auth, 'signUp').mockResolvedValue({ data: { session: null, user: {} }, error: null } as never);
  resend = vi.spyOn(auth, 'resend').mockResolvedValue(ok);
});
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

const openLogin = async () => { const s = await renderScreen(<Login />, { path: '/login' }); await waitFor(() => expect(s.getByPlaceholderText('Email')).toBeTruthy()); return s; };
type S = Awaited<ReturnType<typeof openLogin>>;
const submitForm = (s: S) => fireEvent.submit(s.container.querySelector('form')!);

describe('forgot password', () => {
  it('asks for just an email, sends the link, and says the same thing whether or not the address has an account', async () => {
    const s = await openLogin();
    fireEvent.click(s.getByText('Forgot your password?'));
    expect(s.queryByPlaceholderText('Password')).toBeNull();
    type(s.getByPlaceholderText('Email'), 'me@example.com');
    submitForm(s);
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    expect(reset).toHaveBeenCalledWith('me@example.com', { redirectTo: expect.stringMatching(/\/reset-password\/$/) });
    await waitFor(() => expect(s.container.textContent).toMatch(/Check your email/));
    expect(s.container.textContent).toMatch(/If an account exists for me@example\.com/);
  });

  it('can send again only after the cooldown, to protect the e-mail limit', async () => {
    const s = await openLogin();
    fireEvent.click(s.getByText('Forgot your password?'));
    type(s.getByPlaceholderText('Email'), 'me@example.com'); submitForm(s);
    const again = await s.findByRole('button', { name: /send again in \d+s/i });
    expect((again as HTMLButtonElement).disabled).toBe(true);
  });

  it('a rate-limit error is explained plainly', async () => {
    reset.mockResolvedValue(err('email rate limit exceeded'));
    const s = await openLogin();
    fireEvent.click(s.getByText('Forgot your password?'));
    type(s.getByPlaceholderText('Email'), 'me@example.com'); submitForm(s);
    await waitFor(() => expect(s.container.textContent).toMatch(/Too many tries/));
  });
});

describe('signing in and up', () => {
  it('a wrong password points to the reset link instead of a bare error', async () => {
    signIn.mockResolvedValue(err('Invalid login credentials'));
    const s = await openLogin();
    type(s.getByPlaceholderText('Email'), 'me@example.com'); type(s.getByPlaceholderText('Password'), 'wrongwrong'); submitForm(s);
    await waitFor(() => expect(s.container.textContent).toMatch(/don't match.*Forgot your password/));
  });

  it('an unconfirmed address gets "check your email" and a working Send again', async () => {
    signIn.mockResolvedValue(err('Email not confirmed'));
    const s = await openLogin();
    type(s.getByPlaceholderText('Email'), 'me@example.com'); type(s.getByPlaceholderText('Password'), 'password123'); submitForm(s);
    await waitFor(() => expect(s.container.textContent).toMatch(/confirmation link to/));
    fireEvent.click(s.getByRole('button', { name: /^send again$/i }));
    await waitFor(() => expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'me@example.com', options: { emailRedirectTo: expect.stringMatching(/\/email-confirmed\/$/) } }));
    expect(await s.findByRole('button', { name: /send again in \d+s/i })).toBeTruthy();
  });

  it('creating an account that needs confirmation ends on "check your email", not on a raw error', async () => {
    signIn.mockResolvedValue(err('Email not confirmed'));
    const s = await openLogin();
    fireEvent.click(s.getByText('First time? Create your account'));
    type(s.getByPlaceholderText('Email'), 'new@example.com'); type(s.getByPlaceholderText('Password'), 'password123'); submitForm(s);
    await waitFor(() => expect(signUp).toHaveBeenCalledWith({ email: 'new@example.com', password: 'password123', options: { emailRedirectTo: expect.stringMatching(/\/email-confirmed\/$/) } }));
    await waitFor(() => expect(s.container.textContent).toMatch(/Check your email/));
    expect(s.container.textContent).not.toMatch(/not confirmed/i);
  });

  it('closed sign-ups say so', async () => {
    signUp.mockResolvedValue(err('Database error saving new user'));
    const s = await openLogin();
    fireEvent.click(s.getByText('First time? Create your account'));
    type(s.getByPlaceholderText('Email'), 'new@example.com'); type(s.getByPlaceholderText('Password'), 'password123'); submitForm(s);
    await waitFor(() => expect(s.container.textContent).toMatch(/Sign-ups are currently closed/));
  });
});

describe('reset password page', () => {
  const openReset = async (hash = '') => {
    window.history.replaceState(null, '', `/reset-password/${hash}`);
    let handler: ((e: string) => void) | undefined;
    vi.spyOn(auth, 'onAuthStateChange').mockImplementation(((cb: (e: string) => void) => { handler = cb; return { data: { subscription: { unsubscribe() {} } } }; }) as never);
    const s = await renderScreen(<ResetPassword />, { path: '/reset-password' });
    return { s, recover: () => act(async () => { handler!('PASSWORD_RECOVERY'); }) };
  };
  const fill = (s: Awaited<ReturnType<typeof openReset>>['s'], a: string, b: string) => {
    type(s.getByLabelText('New password'), a); type(s.getByLabelText('Repeat new password'), b);
    fireEvent.submit(s.container.querySelector('form')!);
  };

  it('an expired link (error in the address) says so right away and offers a way back', async () => {
    const { s } = await openReset('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await waitFor(() => expect(s.container.textContent).toMatch(/Link expired/));
    expect(s.container.querySelector('a[href="/login/"]')).not.toBeNull();
  });

  it('no valid session after a moment also means the link is no good', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);
    const { s } = await openReset();
    expect(s.container.textContent).toMatch(/Checking your link/);
    await waitFor(() => expect(s.container.textContent).toMatch(/Link expired/), { timeout: 4000 });
  });

  it('a good link shows the form; short and mismatched passwords are refused before anything is sent', async () => {
    const update = vi.spyOn(auth, 'updateUser').mockResolvedValue(ok);
    const { s, recover } = await openReset();
    await recover();
    await waitFor(() => expect(s.getByLabelText('New password')).toBeTruthy());
    fill(s, 'short', 'short');
    await waitFor(() => expect(s.container.textContent).toMatch(/at least 8 characters/i));
    fill(s, 'longenough1', 'longenough2');
    await waitFor(() => expect(s.container.textContent).toMatch(/do not match/i));
    expect(update).not.toHaveBeenCalled();
  });

  it('saves the new password, signs the temporary session out, and tells you to sign in', async () => {
    const update = vi.spyOn(auth, 'updateUser').mockResolvedValue(ok);
    const out = vi.spyOn(auth, 'signOut').mockResolvedValue({ error: null } as never);
    const { s, recover } = await openReset();
    await recover();
    await waitFor(() => expect(s.getByLabelText('New password')).toBeTruthy());
    fill(s, 'correct horse battery', 'correct horse battery');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ password: 'correct horse battery' }));
    await waitFor(() => expect(s.container.textContent).toMatch(/Password updated/));
    expect(out).toHaveBeenCalled();
    expect(s.container.textContent).toMatch(/sign in with your new password/i);
  });

  it('a rejected password (for example a known-leaked one) shows the reason and keeps the form', async () => {
    vi.spyOn(auth, 'updateUser').mockResolvedValue(err('Password is known to be weak and easy to guess, please choose a different one.'));
    const { s, recover } = await openReset();
    await recover();
    await waitFor(() => expect(s.getByLabelText('New password')).toBeTruthy());
    fill(s, 'password123', 'password123');
    await waitFor(() => expect(s.container.textContent).toMatch(/known to be weak/));
    expect(s.getByLabelText('New password')).toBeTruthy();
  });
});

describe('email confirmed page', () => {
  it('thanks you and sends you back to the app', async () => {
    const s = await renderScreen(<EmailConfirmed />, { path: '/email-confirmed' });
    expect(s.container.textContent).toMatch(/Email confirmed/); expect(s.container.textContent).toMatch(/Open the Heavy app and sign in/);
  });
});
