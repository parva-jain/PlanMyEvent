import { useTranslations } from 'next-intl';

import { LogoMark } from '@/components/motion/logo-mark';

const COLUMNS = [
  {
    key: 'product',
    links: [
      { key: 'features', href: '#features' },
      { key: 'howItWorks', href: '#how-it-works' },
      { key: 'pricing', href: '#pricing' },
    ],
  },
  {
    key: 'useCases',
    links: [
      { key: 'weddings', href: '#use-cases' },
      { key: 'conferences', href: '#use-cases' },
      { key: 'collegeFests', href: '#use-cases' },
      { key: 'fairs', href: '#use-cases' },
    ],
  },
] as const;

/** Footer. Company pages (privacy, terms) are added when they exist. */
export function SiteFooter() {
  const t = useTranslations('home.footer');

  return (
    <footer className="border-t border-border bg-surface-band">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] lg:px-8">
        <div className="max-w-xs">
          <p className="flex items-center gap-2">
            <LogoMark size={28} play="static" />
            <span className="text-h3 font-bold">{t('brand')}</span>
          </p>
          <p className="mt-3 text-small text-fg-secondary">{t('tagline')}</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.key} aria-label={t(`${column.key}.title`)}>
            <p className="text-caption font-semibold tracking-wide uppercase">
              {t(`${column.key}.title`)}
            </p>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.href}
                    className="rounded-sm text-small text-fg-secondary transition-colors duration-(--dur-fast) hover:text-fg"
                  >
                    {t(`${column.key}.${link.key}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto max-w-content border-t border-border px-4 py-6 lg:px-8">
        <p className="text-small text-fg-secondary">{t('copyright')}</p>
      </div>
    </footer>
  );
}
