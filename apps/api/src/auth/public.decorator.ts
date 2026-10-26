import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Opts a route out of the session guard (health checks, public invite pages). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
