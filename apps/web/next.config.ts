import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (item 9).
  output: 'standalone',
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
