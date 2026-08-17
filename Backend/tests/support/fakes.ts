import { randomUUID } from 'node:crypto';
import type { Customer, Job, JobStatus, Package, Payment, PaymentStatus, PortalSession, SmsMessage, Voucher, VoucherStatus } from '@prisma/client';
import type { PackageRepository } from '../../src/modules/catalog/package.repository.js';
import type { CustomerRepository } from '../../src/modules/customer/customer.repository.js';
import type {
  CreatePaymentInput,
  PaymentRepository,
  UpdatePaymentInput,
} from '../../src/modules/payment/payment.repository.js';
import type {
  CreatePortalSessionInput,
  PortalSessionRepository,
} from '../../src/modules/portal/portal-session.repository.js';
import type { CreatedVoucherFields, VoucherRepository } from '../../src/modules/voucher/voucher.repository.js';
import type { SmsRepository } from '../../src/modules/sms/sms.repository.js';
import type { JobRepository } from '../../src/modules/jobs/job.repository.js';
import type { JobType } from '../../src/modules/jobs/job.types.js';

const ACTIVE_STATUSES: PaymentStatus[] = ['CREATED', 'PENDING', 'PROCESSING'];

/** In-memory fakes for every repository interface, mirroring the DB constraints
 * that matter for the tests (unique transactionReference, one voucher per
 * payment, idempotent job enqueue) without needing a real Postgres. */

export function makeFakePackageRepository(packages: Package[]): PackageRepository {
  return {
    async findActive() {
      return packages.filter((p) => p.active);
    },
    async findById(id) {
      return packages.find((p) => p.id === id) ?? null;
    },
    async listAll() {
      return packages;
    },
  };
}

export function makeFakeCustomerRepository(): CustomerRepository {
  const byPhone = new Map<string, Customer>();
  return {
    async upsertByNormalizedPhone(phoneNumber, normalizedPhoneNumber) {
      const existing = byPhone.get(normalizedPhoneNumber);
      if (existing) return existing;
      const customer: Customer = {
        id: randomUUID(),
        phoneNumber,
        normalizedPhoneNumber,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      byPhone.set(normalizedPhoneNumber, customer);
      return customer;
    },
    async listRecent() {
      return [...byPhone.values()];
    },
  };
}

export function makeFakePaymentRepository(): PaymentRepository {
  const byId = new Map<string, Payment>();
  return {
    async create(input: CreatePaymentInput) {
      const payment: Payment = {
        id: randomUUID(),
        transactionReference: input.transactionReference,
        customerId: input.customerId,
        packageId: input.packageId,
        amount: input.amount,
        currency: input.currency,
        phoneNumber: input.phoneNumber,
        provider: input.provider,
        providerTransactionId: null,
        status: 'CREATED',
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        paidAt: null,
      };
      byId.set(payment.id, payment);
      return payment;
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async findByTransactionReference(ref) {
      return [...byId.values()].find((p) => p.transactionReference === ref) ?? null;
    },
    async findActiveForCustomerAndPackage(customerId, packageId) {
      return (
        [...byId.values()]
          .filter((p) => p.customerId === customerId && p.packageId === packageId && ACTIVE_STATUSES.includes(p.status))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
      );
    },
    async update(id, input: UpdatePaymentInput) {
      const existing = byId.get(id);
      if (!existing) throw new Error('payment not found');
      const updated: Payment = { ...existing, ...input, updatedAt: new Date() };
      byId.set(id, updated);
      return updated;
    },
    async listRecent() {
      return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };
}

export function makeFakePortalSessionRepository(): PortalSessionRepository {
  const byId = new Map<string, PortalSession>();
  return {
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async findByPaymentId(paymentId) {
      return [...byId.values()].find((s) => s.paymentId === paymentId) ?? null;
    },
    async findOpenByClientMac(clientMac) {
      return (
        [...byId.values()]
          .filter((s) => s.clientMac === clientMac && !s.paymentId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
      );
    },
    async create(input: CreatePortalSessionInput) {
      const session: PortalSession = {
        id: randomUUID(),
        clientMac: input.clientMac,
        apMac: input.apMac ?? null,
        ssid: input.ssid ?? null,
        siteId: input.siteId ?? null,
        omadaRedirectUrl: input.omadaRedirectUrl ?? null,
        customerId: null,
        paymentId: null,
        createdAt: new Date(),
        expiresAt: null,
      };
      byId.set(session.id, session);
      return session;
    },
    async attachPayment(id, paymentId, customerId) {
      const existing = byId.get(id);
      if (!existing) throw new Error('session not found');
      const updated = { ...existing, paymentId, customerId };
      byId.set(id, updated);
      return updated;
    },
  };
}

export function makeFakeVoucherRepository(): VoucherRepository {
  const byPaymentId = new Map<string, Voucher>();
  return {
    async findByPaymentId(paymentId) {
      return byPaymentId.get(paymentId) ?? null;
    },
    async findById(id) {
      return [...byPaymentId.values()].find((v) => v.id === id) ?? null;
    },
    async ensurePending(paymentId, packageId, durationSeconds) {
      const existing = byPaymentId.get(paymentId);
      if (existing) return existing;
      const voucher: Voucher = {
        id: randomUUID(),
        paymentId,
        packageId,
        omadaVoucherId: null,
        voucherCode: null,
        username: null,
        password: null,
        durationSeconds,
        status: 'NOT_CREATED' as VoucherStatus,
        createdAt: new Date(),
        expiresAt: null,
      };
      byPaymentId.set(paymentId, voucher);
      return voucher;
    },
    async markCreating(paymentId) {
      const v = byPaymentId.get(paymentId);
      if (!v) throw new Error('voucher not found');
      const updated = { ...v, status: 'CREATING' as VoucherStatus };
      byPaymentId.set(paymentId, updated);
      return updated;
    },
    async markCreated(paymentId, fields: CreatedVoucherFields) {
      const v = byPaymentId.get(paymentId);
      if (!v) throw new Error('voucher not found');
      const updated: Voucher = {
        ...v,
        status: 'CREATED',
        omadaVoucherId: fields.omadaVoucherId,
        voucherCode: fields.voucherCode,
        expiresAt: fields.expiresAt ?? null,
      };
      byPaymentId.set(paymentId, updated);
      return updated;
    },
    async markFailed(paymentId) {
      const v = byPaymentId.get(paymentId);
      if (!v) throw new Error('voucher not found');
      const updated = { ...v, status: 'FAILED' as VoucherStatus };
      byPaymentId.set(paymentId, updated);
      return updated;
    },
    async listRecent() {
      return [...byPaymentId.values()];
    },
  };
}

export function makeFakeSmsRepository(): SmsRepository {
  const byId = new Map<string, SmsMessage>();
  return {
    async findByPaymentId(paymentId) {
      return (
        [...byId.values()]
          .filter((s) => s.paymentId === paymentId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
      );
    },
    async create(paymentId, phoneNumber, message, provider) {
      const sms: SmsMessage = {
        id: randomUUID(),
        paymentId,
        phoneNumber,
        message,
        provider,
        providerMessageId: null,
        status: 'QUEUED',
        retries: 0,
        sentAt: null,
        createdAt: new Date(),
      };
      byId.set(sms.id, sms);
      return sms;
    },
    async markSent(id, providerMessageId) {
      const s = byId.get(id);
      if (!s) throw new Error('sms not found');
      const updated: SmsMessage = { ...s, status: 'SENT', providerMessageId: providerMessageId ?? null, sentAt: new Date() };
      byId.set(id, updated);
      return updated;
    },
    async markFailed(id) {
      const s = byId.get(id);
      if (!s) throw new Error('sms not found');
      const updated: SmsMessage = { ...s, status: 'FAILED', retries: s.retries + 1 };
      byId.set(id, updated);
      return updated;
    },
  };
}

export function makeFakeJobRepository(): JobRepository {
  const byKey = new Map<string, Job>();
  const key = (type: string, entityId: string) => `${type}:${entityId}`;
  return {
    async enqueue(type: JobType, entityId, payload, paymentId) {
      const k = key(type, entityId);
      const existing = byKey.get(k);
      if (existing) return existing;
      const job: Job = {
        id: randomUUID(),
        type,
        entityId,
        payload: payload as never,
        status: 'PENDING' as JobStatus,
        attempts: 0,
        maxAttempts: 3,
        runAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        paymentId: paymentId ?? null,
      };
      byKey.set(k, job);
      return job;
    },
    async claimDue(limit) {
      const now = Date.now();
      const due = [...byKey.values()]
        .filter((j) => j.status === 'PENDING' && (!j.runAt || j.runAt.getTime() <= now))
        .slice(0, limit);
      const claimed: Job[] = [];
      for (const job of due) {
        const updated: Job = { ...job, status: 'RUNNING', attempts: job.attempts + 1 };
        byKey.set(key(job.type, job.entityId), updated);
        claimed.push(updated);
      }
      return claimed;
    },
    async markDone(id) {
      const job = [...byKey.values()].find((j) => j.id === id);
      if (!job) throw new Error('job not found');
      const updated: Job = { ...job, status: 'DONE', lastError: null };
      byKey.set(key(job.type, job.entityId), updated);
      return updated;
    },
    async markFailedOrRetry(id, error, backoffMs) {
      const job = [...byKey.values()].find((j) => j.id === id);
      if (!job) throw new Error('job not found');
      const updated: Job =
        job.attempts < job.maxAttempts
          ? { ...job, status: 'PENDING', lastError: error, runAt: new Date(Date.now() + backoffMs) }
          : { ...job, status: 'FAILED', lastError: error };
      byKey.set(key(job.type, job.entityId), updated);
      return updated;
    },
  };
}

export function makePackage(partial: Partial<Package> = {}): Package {
  return {
    id: 'package_3_hours',
    name: '3 Hours',
    price: 500,
    currency: 'TZS',
    durationSeconds: 3 * 60 * 60,
    speedLimit: null,
    downloadLimit: null,
    uploadLimit: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}
