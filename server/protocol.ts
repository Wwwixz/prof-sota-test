import { z } from 'zod';
export const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), city: z.number().int().min(0).max(24), skin: z.number().int().min(0).max(2) }).strict(),
  z.object({ type: z.literal('join'), code: z.string().regex(/^[A-Z2-9]{5}$/), skin: z.number().int().min(0).max(2) }).strict(),
  z.object({ type: z.literal('resume'), token: z.string().uuid() }).strict(),
  z.object({ type: z.literal('move'), level: z.number().int().positive(), seq: z.number().int().min(1).max(1000000000), dx: z.number().int().min(-1).max(1), dy: z.number().int().min(-1).max(1) }).strict(),
  z.object({ type: z.literal('question'), level: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('answer'), level: z.number().int().positive(), questionId: z.string().uuid(), value: z.number().finite() }).strict(),
  z.object({ type: z.literal('hint'), level: z.number().int().positive(), questionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('next'), level: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('cancel'), level: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
  z.object({ type: z.literal('ping') }).strict()
]);
export type Message = z.infer<typeof messageSchema>;
export class GameError extends Error {}
export class RateLimit {
  private tokens: number;
  private last: number;
  constructor(private capacity = 40, private perSecond = 25, private clock = Date.now) { this.tokens = capacity; this.last = clock(); }
  take(): boolean {
    const now = this.clock(); this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.perSecond / 1000); this.last = now;
    if (this.tokens < 1) return false; this.tokens--; return true;
  }
}
