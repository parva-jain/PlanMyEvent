import { z } from 'zod';

type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    const lines = issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    super(`Invalid environment variables:\n${lines.join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Parses environment variables against a Zod object schema and fails fast,
 * listing every missing or invalid variable at once.
 */
export function defineEnv<TShape extends z.ZodRawShape>(
  shape: TShape,
  source: EnvSource = process.env,
): z.infer<z.ZodObject<TShape>> {
  // Treat empty strings as unset so `FOO=` in a .env file falls back to defaults.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = z.object(shape).safeParse(cleaned);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}

/**
 * Applies a default outside production only, so a fresh clone runs against the
 * docker-compose services with no .env file while production must set every value.
 */
export function devDefault<TSchema extends z.ZodType>(
  schema: TSchema,
  value: z.util.NoUndefined<z.input<TSchema>>,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): TSchema | z.ZodDefault<TSchema> {
  return nodeEnv === 'production' ? schema : schema.default(value as never);
}

/** Building blocks shared by app env schemas. */
export const envSchemas = {
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  port: (fallback: number) => z.coerce.number().int().min(1).max(65535).default(fallback),
  url: z.url(),
  postgresUrl: z.url({ protocol: /^postgres(ql)?$/ }),
  redisUrl: z.url({ protocol: /^rediss?$/ }),
  bool: (fallback: boolean) => z.stringbool().default(fallback),
} as const;
