import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, unwrap } from '@/api/client';
import { useMe } from '@/api/hooks';
import { getToken, setToken } from '@/api/token';
import { Wordmark } from '@/components/BrandMark';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/input';

export const MIN_PASSWORD = 10;

/** First-sign-in screen: a password an operator handed out must be replaced before anything else works. */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!getToken() || me.isError) return <Navigate to="/login" replace />;
  const forced = me.data?.role === 'password_change';

  const problem = next && next.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : next && next === current ? 'Choose a password different from the current one.' : again && again !== next ? 'The two new passwords do not match.' : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const data = unwrap(await api.POST('/api/v1/auth/change-password', { body: { current_password: current, new_password: next } }));
      setToken(data.token);
      await queryClient.invalidateQueries();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^API error: \d+ /, '') : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-5 rounded-2xl p-8">
        <div>
          <Wordmark className="mb-6 lg:hidden" />
          <h1 className="text-3xl font-extrabold tracking-tight">Choose your password</h1>
          <p className="mt-1 text-muted-foreground">
            {forced ? `Welcome, ${me.data?.sub}. The password you were given is temporary. Set your own to continue.` : 'Set a new password for your account.'}
          </p>
        </div>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold">Current password</span>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required autoFocus />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold">New password</span>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={MIN_PASSWORD} aria-describedby="pw-rules" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold">Repeat the new password</span>
            <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
          </label>
          <p id="pw-rules" className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD} characters, and not your username.
          </p>
        </div>
        {(problem || error) && (
          <p role="alert" className="text-danger">
            {problem ?? error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !current || !next || !again || Boolean(problem)}>
          {busy ? 'Saving…' : 'Save and continue'}
        </Button>
      </form>
    </AuthLayout>
  );
}
