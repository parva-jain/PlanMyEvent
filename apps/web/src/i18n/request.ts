import { getRequestConfig } from 'next-intl/server';

// English only for now; Hindi arrives later with locale routing (CLAUDE.md: India-first, Hindi later).
export default getRequestConfig(async () => {
  const locale = 'en';
  return {
    locale,
    messages: (
      (await import(`../../messages/${locale}.json`)) as { default: Record<string, unknown> }
    ).default,
  };
});
