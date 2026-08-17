import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../lib/errors.js';
import { PrismaPackageRepository } from '../modules/catalog/package.repository.js';
import { PrismaCustomerRepository } from '../modules/customer/customer.repository.js';
import { PrismaPaymentRepository } from '../modules/payment/payment.repository.js';
import { PrismaPortalSessionRepository } from '../modules/portal/portal-session.repository.js';
import { PrismaVoucherRepository } from '../modules/voucher/voucher.repository.js';
import { PrismaSmsRepository } from '../modules/sms/sms.repository.js';
import { PrismaJobRepository } from '../modules/jobs/job.repository.js';
import { PaymentService } from '../modules/payment/payment.service.js';
import { PaymentWebhookService } from '../modules/payment/payment.webhook.service.js';
import { getPaymentProvider } from '../modules/payment/payment.provider.factory.js';
import { FakePaymentProvider } from '../modules/payment/providers/fake-payment.provider.js';
import { requireAdmin } from './middleware.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const createPaymentSchema = z.object({
  packageId: z.string().min(1),
  phoneNumber: z.string().min(1),
  clientMac: z.string().min(1),
  apMac: z.string().optional(),
  ssid: z.string().optional(),
  siteId: z.string().optional(),
  redirectUrl: z.string().optional(),
});

const simulateSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED']).default('SUCCESS'),
});

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  // Capture the raw body alongside the parsed JSON (scoped to this plugin
  // only, via Fastify's encapsulation) - the webhook needs the exact bytes
  // to verify the provider's signature.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body as Buffer;
    if (!body || (body as Buffer).length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  function requireDatabase(): void {
    if (!env.DATABASE_URL) {
      throw new ValidationError('Database not configured (DATABASE_URL)');
    }
  }

  function buildPaymentService(): PaymentService {
    return new PaymentService(
      new PrismaPackageRepository(prisma),
      new PrismaCustomerRepository(prisma),
      new PrismaPaymentRepository(prisma),
      new PrismaPortalSessionRepository(prisma),
      getPaymentProvider(),
      logger,
    );
  }

  app.post('/api/payments', async (request, reply) => {
    const body = createPaymentSchema.parse(request.body);
    requireDatabase();
    const result = await buildPaymentService().createPayment(body);
    return reply.status(201).send(result);
  });

  app.get('/api/payments/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    requireDatabase();
    const payment = await new PrismaPaymentRepository(prisma).findById(request.params.id);
    if (!payment) throw new NotFoundError('Payment not found');
    return {
      id: payment.id,
      transactionReference: payment.transactionReference,
      packageId: payment.packageId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
    };
  });

  app.get('/api/payments/:id/status', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    requireDatabase();
    const payment = await new PrismaPaymentRepository(prisma).findById(request.params.id);
    if (!payment) throw new NotFoundError('Payment not found');
    const voucher = await new PrismaVoucherRepository(prisma).findByPaymentId(payment.id);
    const sms = await new PrismaSmsRepository(prisma).findByPaymentId(payment.id);
    return {
      paymentStatus: payment.status,
      voucherStatus: voucher?.status ?? 'NOT_CREATED',
      smsStatus: sms?.status ?? 'NOT_SENT',
      voucherCode: voucher?.status === 'CREATED' ? voucher.voucherCode : undefined,
    };
  });

  app.post('/api/payments/webhook', async (request, reply) => {
    requireDatabase();
    const service = new PaymentWebhookService(
      new PrismaPaymentRepository(prisma),
      new PrismaJobRepository(prisma),
      getPaymentProvider(),
      logger,
    );
    const result = await service.handle({
      headers: request.headers as Record<string, string | string[] | undefined>,
      rawBody: request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})),
    });
    return reply.status(result.httpStatus).send(result.body);
  });

  // Dev/test-only: simulate the provider calling our own webhook, so the
  // full payment -> voucher -> SMS pipeline can be exercised without real
  // money (spec section 32). Never available in production or with a real
  // provider configured.
  app.post(
    '/api/dev/payments/:id/simulate',
    { preHandler: async (request) => requireAdmin(request) },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const body = simulateSchema.parse(request.body ?? {});
      requireDatabase();
      if (env.NODE_ENV === 'production' || env.PAYMENT_PROVIDER !== 'fake') {
        throw new UnauthorizedError('Payment simulation is only available with PAYMENT_PROVIDER=fake outside production');
      }
      const payment = await new PrismaPaymentRepository(prisma).findById(request.params.id);
      if (!payment) throw new NotFoundError('Payment not found');

      const provider = getPaymentProvider() as FakePaymentProvider;
      const { body: webhookBody, headers } = provider.buildWebhookPayload(
        payment.transactionReference,
        payment.providerTransactionId ?? `fake_${payment.id}`,
        body.status,
      );

      const injected = await app.inject({
        method: 'POST',
        url: '/api/payments/webhook',
        payload: webhookBody,
        headers,
      });
      return { simulated: true, webhookResponse: JSON.parse(injected.payload) };
    },
  );
}
