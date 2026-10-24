export const ROLES = ['artist', 'client'] as const;

export type Role = (typeof ROLES)[number];
