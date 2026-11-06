import type { ZodType, ZodTypeDef } from 'zod'

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    /** Seconds; sent as Retry-After. */
    public retryAfter?: number,
  ) {
    super(message)
  }
}

/** Validate untrusted input; a failure becomes a 400. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const r = schema.safeParse(data)
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), 'invalid_input')
  return r.data
}
