import type { Job } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { JobType } from './job.types.js';

/**
 * Repository abstraction so job.runner.ts is unit-testable without a
 * database. Backed by the `Job` table for now (spec section 23: "can
 * initially be a simple database-backed job mechanism ... upgraded to
 * Redis/BullMQ later").
 */
export interface JobRepository {
  /**
   * Idempotently enqueue a job. `type` + `entityId` is the idempotency key
   * (DB-unique) - enqueueing the same (type, entityId) twice (e.g. a
   * duplicate webhook re-triggering voucher provisioning) is a no-op and
   * returns the existing row.
   */
  enqueue(type: JobType, entityId: string, payload: unknown, paymentId?: string): Promise<Job>;
  /** Atomically claim up to `limit` due PENDING jobs (status -> RUNNING) so two workers never process the same job. */
  claimDue(limit: number): Promise<Job[]>;
  markDone(id: string): Promise<Job>;
  /** Re-queue with backoff if attempts remain, otherwise mark FAILED terminally. */
  markFailedOrRetry(id: string, error: string, backoffMs: number): Promise<Job>;
}

export class PrismaJobRepository implements JobRepository {
  constructor(private readonly client: typeof prisma) {}

  async enqueue(
    type: JobType,
    entityId: string,
    payload: unknown,
    paymentId?: string,
  ): Promise<Job> {
    return this.client.job.upsert({
      where: { type_entityId: { type, entityId } },
      update: {},
      create: {
        type,
        entityId,
        payload: payload as never,
        paymentId,
      },
    });
  }

  async claimDue(limit: number): Promise<Job[]> {
    const now = new Date();
    const candidates = await this.client.job.findMany({
      where: {
        status: 'PENDING',
        OR: [{ runAt: null }, { runAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const claimed: Job[] = [];
    for (const job of candidates) {
      // Conditional update: only succeeds if the job is still PENDING, so
      // concurrent workers never both pick up the same row.
      const result = await this.client.job.updateMany({
        where: { id: job.id, status: 'PENDING' },
        data: { status: 'RUNNING', attempts: { increment: 1 } },
      });
      if (result.count === 1) {
        claimed.push({ ...job, status: 'RUNNING', attempts: job.attempts + 1 });
      }
    }
    return claimed;
  }

  async markDone(id: string): Promise<Job> {
    return this.client.job.update({ where: { id }, data: { status: 'DONE', lastError: null } });
  }

  async markFailedOrRetry(id: string, error: string, backoffMs: number): Promise<Job> {
    const job = await this.client.job.findUniqueOrThrow({ where: { id } });
    if (job.attempts < job.maxAttempts) {
      return this.client.job.update({
        where: { id },
        data: { status: 'PENDING', lastError: error, runAt: new Date(Date.now() + backoffMs) },
      });
    }
    return this.client.job.update({
      where: { id },
      data: { status: 'FAILED', lastError: error },
    });
  }
}
