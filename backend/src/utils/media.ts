import { z } from 'zod';

/** Absolute URLs, data URIs, or same-origin media served by this API. */
export function isAllowedMediaUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  return (
    v.startsWith('http://') ||
    v.startsWith('https://') ||
    v.startsWith('data:') ||
    v.startsWith('/api/media/')
  );
}

export const mediaUrlSchema = z
  .string()
  .min(1)
  .max(2_000_000)
  .refine(isAllowedMediaUrl, 'Media must be a URL, /api/media path, or data URI');

export const optionalMediaUrlSchema = z
  .union([mediaUrlSchema, z.literal('')])
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const profilePhotoUrlSchema = z
  .string()
  .max(2_000_000)
  .refine(
    (value) =>
      !value ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('data:image/') ||
      value.startsWith('/api/media/'),
    'Profile photo must be a URL, /api/media path, or image data URI',
  )
  .optional();

export const coverPhotoUrlSchema = z
  .string()
  .max(2_000_000)
  .refine(
    (value) =>
      !value ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('data:image/') ||
      value.startsWith('/api/media/'),
    'Cover photo must be a URL, /api/media path, or image data URI',
  )
  .optional();
