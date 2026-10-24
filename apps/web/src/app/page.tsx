import { useTranslations } from 'next-intl';

// Temporary until the home page sections land (step F).
export default function HomePage() {
  const t = useTranslations('home');
  return (
    <main className="mx-auto flex min-h-dvh max-w-content flex-col justify-center gap-4 px-4 lg:px-8">
      <h1 className="text-h1-phone sm:text-h1">{t('placeholderTitle')}</h1>
      <p className="text-body-lg text-fg-secondary">{t('placeholderBody')}</p>
    </main>
  );
}
