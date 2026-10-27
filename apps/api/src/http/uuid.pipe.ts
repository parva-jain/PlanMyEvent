import { Injectable, type PipeTransform } from '@nestjs/common';
import { ActionError } from '@pme/core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path ids that can't exist are simply not found (no hint about valid formats). */
@Injectable()
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) {
      throw new ActionError('not_found', 'Not found');
    }
    return value.toLowerCase();
  }
}
