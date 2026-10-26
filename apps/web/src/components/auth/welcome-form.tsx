'use client';

import { ArrowRight, BadgeCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Field, Input, PhoneInput } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useMe, useUpdateMe } from '@/lib/me';

import { FullPageLoading } from './full-page-loading';

/**
 * Welcome (Stitch "Welcome"): name, and an optional Indian mobile number for WhatsApp later.
 * New email accounts land here because they have no name yet; Google accounts arrive with
 * one, marked "From Google".
 */
export function WelcomeForm() {
  const t = useTranslations('auth.welcome');
  const router = useRouter();
  const { data: me, isPending } = useMe();
  const update = useUpdateMe();

  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (me === null) router.replace('/sign-in');
  }, [me, router]);

  if (isPending || !me) {
    return <FullPageLoading />;
  }

  const fromProvider = me.user.name.trim() !== '';
  const nameValue = name ?? me.user.name;
  const fieldErrors = new Map(
    update.error instanceof ApiError
      ? (update.error.problem?.fields ?? []).map((field) => [field.path, field.message] as const)
      : [],
  );
  const failed = update.isError && fieldErrors.size === 0;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      { name: nameValue, phone: phone ? `+91${phone}` : null },
      { onSuccess: () => router.replace('/app') },
    );
  }

  return (
    <Reveal className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
        <p className="text-body text-fg-secondary">{t('subtitle')}</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          id="name"
          label={t('nameLabel')}
          error={fieldErrors.get('name')}
          aside={
            fromProvider && name === null ? (
              <span className="flex items-center gap-1 text-primary-text">
                <BadgeCheck aria-hidden className="size-4" />
                {t('fromGoogle')}
              </span>
            ) : undefined
          }
        >
          <Input
            id="name"
            autoComplete="name"
            required
            maxLength={80}
            value={nameValue}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={fieldErrors.has('name') || undefined}
            aria-describedby={fieldErrors.has('name') ? 'name-error' : undefined}
            autoFocus={!fromProvider}
          />
        </Field>
        <Field
          id="phone"
          label={t('phoneLabel')}
          aside={t('optional')}
          hint={t('phoneHint')}
          error={fieldErrors.get('phone')}
        >
          <PhoneInput
            id="phone"
            placeholder="98765 43210"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
            aria-invalid={fieldErrors.has('phone') || undefined}
            aria-describedby={fieldErrors.has('phone') ? 'phone-error' : 'phone-hint'}
          />
        </Field>
        {failed && (
          <p role="alert" className="text-small text-danger-text">
            {t('failed')}
          </p>
        )}
        <Button type="submit" loading={update.isPending} disabled={update.isSuccess}>
          {t('continue')}
          <ArrowRight aria-hidden />
        </Button>
      </form>
    </Reveal>
  );
}
