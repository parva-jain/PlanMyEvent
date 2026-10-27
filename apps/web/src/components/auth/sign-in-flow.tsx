'use client';

import type { Me } from '@pme/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { CheckDraw } from '@/components/motion/check-draw';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import {
  authClient,
  authErrorKey,
  callAuth,
  GOOGLE_SIGN_IN,
  type AuthErrorKey,
} from '@/lib/auth-client';
import { ME_KEY } from '@/lib/me';
import { distance, duration, ease } from '@/lib/motion';

import { CodeInput } from './code-input';
import { GoogleIcon } from './google-icon';
import { destinationFor, useRedirectSignedIn } from './use-redirect-signed-in';

/** Seconds before "Resend code" is offered again. */
const RESEND_AFTER = 30;
/** How long the success check shows before the page fades into the app (MOTION.md 6.3). */
const SUCCESS_PAUSE_MS = duration.slow * 1000;

type Step = 'email' | 'code';

/**
 * Sign in with Google, or with a 6-digit code sent by email (decision 010). The code step
 * submits on the sixth digit; a wrong code shakes the boxes, success draws a check and
 * fades into the app (or Welcome, for a new account).
 */
export function SignInFlow() {
  const t = useTranslations('auth.signIn');
  const tErrors = useTranslations('auth.errors');
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduced = useShouldReduceMotion();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useRedirectSignedIn(!succeeded);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error: sendError } = await callAuth(() =>
      authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' }),
    );
    setBusy(false);
    if (sendError) {
      setError(authErrorKey(sendError));
      return false;
    }
    setCode('');
    setResendIn(RESEND_AFTER);
    return true;
  }

  async function onEmailSubmit(event: FormEvent) {
    event.preventDefault();
    if (await sendCode()) setStep('code');
  }

  async function verify(otp: string) {
    setBusy(true);
    setError(null);
    const { error: signInError } = await callAuth(() => authClient.signIn.emailOtp({ email, otp }));
    if (signInError) {
      setBusy(false);
      setError(authErrorKey(signInError));
      setErrorKey((key) => key + 1);
      return;
    }
    setSucceeded(true);
    // staleTime 0: the page cached "signed out" a moment ago, so ask again. If that fails,
    // go to the app anyway: its session gate shows a retry instead of a stuck page.
    const destination = await queryClient
      .fetchQuery({ queryKey: ME_KEY, queryFn: () => apiFetch<Me>('/v1/me'), staleTime: 0 })
      .then(destinationFor, () => '/app');
    setTimeout(() => router.replace(destination), SUCCESS_PAUSE_MS);
  }

  function signInWithGoogle() {
    const origin = window.location.origin;
    void authClient.signIn.social({
      provider: 'google',
      callbackURL: `${origin}/app`,
      newUserCallbackURL: `${origin}/welcome`,
      errorCallbackURL: `${origin}/sign-in`,
    });
  }

  const slide = {
    initial: { opacity: 0, x: reduced ? 0 : distance.riseLarge },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: reduced ? 0 : -distance.riseLarge },
    transition: { duration: reduced ? duration.fast : duration.moderate, ease: ease.out },
  };

  return (
    <m.div
      animate={{ opacity: succeeded ? 0 : 1 }}
      transition={{ duration: duration.slow, delay: SUCCESS_PAUSE_MS / 1000, ease: ease.inOut }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === 'email' ? (
          <m.section key="email" {...slide} className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
              <p className="text-body text-fg-secondary">{t('subtitle')}</p>
            </header>

            {GOOGLE_SIGN_IN && (
              <>
                <Button variant="secondary" icon={<GoogleIcon />} onClick={signInWithGoogle}>
                  {t('google')}
                </Button>
                <div className="flex items-center gap-3 text-small text-fg-muted">
                  <span className="h-px flex-1 bg-border" />
                  {t('or')}
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form onSubmit={(event) => void onEmailSubmit(event)} className="flex flex-col gap-4">
              <Field
                id="email"
                label={t('emailLabel')}
                hint={t('emailHint')}
                error={error ? tErrors(error) : undefined}
              >
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'email-error' : 'email-hint'}
                />
              </Field>
              <Button type="submit" loading={busy} icon={<Mail aria-hidden />}>
                {t('continueWithEmail')}
              </Button>
            </form>
          </m.section>
        ) : (
          <m.section key="code" {...slide} className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              <h1 className="text-h1-phone sm:text-h1">{t('codeTitle')}</h1>
              <p className="text-body text-fg-secondary">
                {t('codeSentTo')} <strong className="font-semibold text-fg">{email}</strong>
              </p>
            </header>

            <div className="flex flex-col gap-3">
              <CodeInput
                value={code}
                onChange={(value) => {
                  setCode(value);
                  if (error) setError(null);
                }}
                onComplete={(value) => void verify(value)}
                errorKey={errorKey}
                invalid={error !== null && !succeeded}
                disabled={busy || succeeded}
                label={t('codeLabel')}
                describedBy={error ? 'code-error' : undefined}
              />
              <div className="min-h-6">
                {succeeded ? (
                  <p role="status" className="flex items-center gap-2 text-label text-success-text">
                    <CheckDraw checked size={20} className="border-success bg-success" />
                    {t('success')}
                  </p>
                ) : (
                  error && (
                    <p id="code-error" role="alert" className="text-small text-danger-text">
                      {tErrors(error)}
                    </p>
                  )
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-small">
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowLeft aria-hidden />}
                onClick={() => {
                  setStep('email');
                  setError(null);
                }}
              >
                {t('changeEmail')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={resendIn > 0 || busy}
                onClick={() => void sendCode()}
              >
                {resendIn > 0 ? t('resendIn', { seconds: resendIn }) : t('resend')}
                {resendIn <= 0 && <ArrowRight aria-hidden />}
              </Button>
            </div>
            <p className="text-small text-fg-muted">{t('spamHint')}</p>
          </m.section>
        )}
      </AnimatePresence>
    </m.div>
  );
}
