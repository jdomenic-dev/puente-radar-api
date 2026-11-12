/**
 * cameras.service.ts
 *
 * The YouTube live cameras of the bridges. The public read answers the "En vivo" screen in one
 * call (bridges with their views, credit included) and is cached for a minute; the admin
 * writes exist so a broken stream id is fixed in minutes without releasing the app.
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { BridgesService } from '../bridges/bridges.service.js';
import type { Bridge } from '../bridges/entities/bridge.entity.js';
import { CameraStatus } from '../../common/enums/camera.enum.js';
import { BridgeCamera } from './entities/bridge-camera.entity.js';
import type { CreateCameraDto } from './dto/create-camera.dto.js';
import type { UpdateCameraDto } from './dto/update-camera.dto.js';

export interface PublicCamera {
  id: string;
  videoId: string;
  label: string;
  description: string | null;
  status: CameraStatus;
  source: { name: string; url: string };
}

export interface BridgeCameras {
  bridgeId: string;
  slug: string;
  name: string;
  /** Very short name for tabs: tabLabel, else shortName, else name. */
  tabLabel: string;
  cameras: PublicCamera[];
}

export interface CamerasResponse {
  generatedAt: string;
  bridges: BridgeCameras[];
}

/** Camera lists change when someone edits them or a stream restarts; a minute is plenty. */
const CACHE_TTL_MS = 60_000;

const UNIQUE_VIOLATION = '23505';

function isDuplicateKey(error: unknown): boolean {
  return (
    error instanceof QueryFailedError && (error.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class CamerasService {
  private cache: { value: CamerasResponse; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(BridgeCamera)
    private readonly cameraRepository: Repository<BridgeCamera>,
    private readonly bridgesService: BridgesService,
  ) {}

  async getPublicCameras(): Promise<CamerasResponse> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;

    const [bridges, cameras] = await Promise.all([
      this.bridgesService.findActive(),
      this.cameraRepository.find({ where: { isActive: true }, order: { sortOrder: 'ASC', createdAt: 'ASC' } }),
    ]);

    const byBridge = new Map<string, BridgeCamera[]>();
    for (const camera of cameras) {
      byBridge.set(camera.bridgeId, [...(byBridge.get(camera.bridgeId) ?? []), camera]);
    }

    const value: CamerasResponse = {
      generatedAt: new Date(now).toISOString(),
      bridges: bridges
        .filter((bridge) => (byBridge.get(bridge.id) ?? []).length > 0)
        .map((bridge) => this.toBridgeCameras(bridge, byBridge.get(bridge.id) ?? [])),
    };
    this.cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  }

  async create(dto: CreateCameraDto): Promise<BridgeCamera> {
    if ((dto.bridgeId === undefined) === (dto.bridgeSlug === undefined)) {
      throw new BadRequestException('Send exactly one of bridgeId and bridgeSlug');
    }
    const bridge =
      dto.bridgeId !== undefined
        ? await this.bridgesService.findOneById(dto.bridgeId)
        : await this.bridgesService.findOneBySlug(dto.bridgeSlug as string);

    const camera = this.cameraRepository.create({
      bridgeId: bridge.id,
      videoId: dto.videoId,
      label: dto.label,
      description: dto.description ?? null,
      sortOrder: dto.sortOrder ?? (await this.cameraRepository.count({ where: { bridgeId: bridge.id } })),
    });
    return this.save(camera);
  }

  async update(id: string, dto: UpdateCameraDto): Promise<BridgeCamera> {
    const camera = await this.cameraRepository.findOne({ where: { id } });
    if (!camera) throw new NotFoundException(`Camera ${id} not found`);

    if (dto.videoId !== undefined) camera.videoId = dto.videoId;
    if (dto.label !== undefined) camera.label = dto.label;
    if (dto.description !== undefined) camera.description = dto.description;
    if (dto.sortOrder !== undefined) camera.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) camera.isActive = dto.isActive;
    if (dto.status !== undefined) {
      camera.status = dto.status;
      camera.lastCheckedAt = new Date();
    }
    return this.save(camera);
  }

  /**
   * Seed helper, safe to re-run: creates the camera if its video is unknown, otherwise refreshes the
   * reference data (label, description, order). What operations set (isActive, status) is never reset.
   */
  async upsertSeed(seed: {
    bridgeSlug: string;
    videoId: string;
    label: string;
    description: string;
    sortOrder: number;
  }): Promise<BridgeCamera> {
    const existing = await this.cameraRepository.findOne({ where: { videoId: seed.videoId } });
    if (existing) {
      existing.label = seed.label;
      existing.description = seed.description;
      existing.sortOrder = seed.sortOrder;
      return this.save(existing);
    }
    const bridge = await this.bridgesService.findOneBySlug(seed.bridgeSlug);
    return this.save(
      this.cameraRepository.create({
        bridgeId: bridge.id,
        videoId: seed.videoId,
        label: seed.label,
        description: seed.description,
        sortOrder: seed.sortOrder,
      }),
    );
  }

  private async save(camera: BridgeCamera): Promise<BridgeCamera> {
    try {
      const saved = await this.cameraRepository.save(camera);
      this.cache = null; // the next public read sees the change
      return saved;
    } catch (error) {
      if (isDuplicateKey(error)) throw new ConflictException('That YouTube video is already registered');
      throw error;
    }
  }

  private toBridgeCameras(bridge: Bridge, cameras: BridgeCamera[]): BridgeCameras {
    return {
      bridgeId: bridge.id,
      slug: bridge.slug,
      name: bridge.name,
      tabLabel: bridge.tabLabel ?? bridge.shortName ?? bridge.name,
      cameras: [...cameras]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((camera) => ({
          id: camera.id,
          videoId: camera.videoId,
          label: camera.label,
          description: camera.description,
          status: camera.status,
          source: { name: camera.sourceName, url: camera.sourceUrl },
        })),
    };
  }
}
