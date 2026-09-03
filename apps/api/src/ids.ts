import { ulid } from 'ulid';
// Prefixed ids so anything on screen is greppable in the database.
export const id = (prefix: string) => `${prefix}_${ulid()}`;
