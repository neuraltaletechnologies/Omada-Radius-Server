import type { Package } from '@prisma/client';
import type { PackageRepository } from './package.repository.js';

export interface CatalogPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationSeconds: number;
  speedLimit: number | null;
  downloadLimit: number | null;
  uploadLimit: number | null;
}

export class PackageService {
  constructor(private readonly repository: PackageRepository) {}

  async listActivePackages(): Promise<CatalogPackage[]> {
    const packages = await this.repository.findActive();
    return packages.map((p: Package) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      currency: p.currency,
      durationSeconds: p.durationSeconds,
      speedLimit: p.speedLimit,
      downloadLimit: p.downloadLimit,
      uploadLimit: p.uploadLimit,
    }));
  }
}