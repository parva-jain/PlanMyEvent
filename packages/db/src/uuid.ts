import { v7, validate, version } from 'uuid';

/** New primary key: UUIDv7, generated in the app (time-ordered, index-friendly). */
export function newId(): string {
  return v7();
}

export function isUuidV7(value: string): boolean {
  return validate(value) && version(value) === 7;
}
