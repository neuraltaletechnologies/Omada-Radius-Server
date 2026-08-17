import type { PortalSession } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface CreatePortalSessionInput {
  clientMac: string;
  apMac?: string | null;
  ssid?: string | null;
  siteId?: string | null;
  omadaRedirectUrl?: string | null;
}

/** Repository abstraction so services are unit-testable without a database. */
export interface PortalSessionRepository {
  findById(id: string): Promise<PortalSession | null>;
  findByPaymentId(paymentId: string): Promise<PortalSession | null>;
  /** Most recent still-open (not yet linked to a payment) session for this client MAC. */
  findOpenByClientMac(clientMac: string): Promise<PortalSession | null>;
  create(input: CreatePortalSessionInput): Promise<PortalSession>;
  attachPayment(id: string, paymentId: string, customerId: string): Promise<PortalSession>;
}

export class PrismaPortalSessionRepository implements PortalSessionRepository {
  constructor(private readonly client: typeof prisma) {}

  async findById(id: string): Promise<PortalSession | null> {
    return this.client.portalSession.findUnique({ where: { id } });
  }

  async findByPaymentId(paymentId: string): Promise<PortalSession | null> {
    return this.client.portalSession.findUnique({ where: { paymentId } });
  }

  async findOpenByClientMac(clientMac: string): Promise<PortalSession | null> {
    return this.client.portalSession.findFirst({
      where: { clientMac, paymentId: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: CreatePortalSessionInput): Promise<PortalSession> {
    return this.client.portalSession.create({
      data: {
        clientMac: input.clientMac,
        apMac: input.apMac ?? null,
        ssid: input.ssid ?? null,
        siteId: input.siteId ?? null,
        omadaRedirectUrl: input.omadaRedirectUrl ?? null,
      },
    });
  }

  async attachPayment(id: string, paymentId: string, customerId: string): Promise<PortalSession> {
    return this.client.portalSession.update({
      where: { id },
      data: { paymentId, customerId },
    });
  }
}
