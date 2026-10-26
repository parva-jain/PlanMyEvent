import { defineEnv, devDefault, envSchemas } from '@pme/config';

export const LOCAL_DATABASE_URL = 'postgres://pme:pme@localhost:5432/pme';

export function loadDbEnv(source: Record<string, string | undefined> = process.env) {
  return defineEnv(
    { DATABASE_URL: devDefault(envSchemas.postgresUrl, LOCAL_DATABASE_URL, source.NODE_ENV) },
    source,
  );
}
