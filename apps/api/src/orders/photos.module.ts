import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Logger, Module, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Post, StreamableFile } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { orderScope } from './orders.module';

/** Where photo files live: a folder on the server (docker: ./uploads on the host). Backed up by docker/backup.sh. */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
const MAX_BYTES = 1_500_000; // the browser resizes to ~1600 px JPEG first, usually 150–400 KB
const MAX_PER_ORDER = 10;
const KEEP_DAYS_AFTER_CLOSE = 180;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

class PhotoDto { @IsString() @MaxLength(2_100_000) image!: string; }

/** Whether a service takes intake photos (Sozlamalar → «Qabulda qurilma rasmi»); off unless the owner turns it on. */
export async function photosEnabled(db: Database, organizationId: string) {
  const row = await db.organizationSetting.findUnique({ where: { organizationId_key: { organizationId, key: 'photos' } } });
  return (row?.value as { enabled?: unknown } | undefined)?.enabled === true;
}
const fileOf = (p: { organizationId: string; orderId: string; id: string; mime: string }) =>
  path.join(UPLOAD_DIR, p.organizationId, p.orderId, `${p.id}.${TYPES[p.mime] ?? 'bin'}`);

/**
 * Photos of a device's condition at intake: taken on the new-order screen (or later on the order),
 * seen by everyone who can see the order. A service turns the feature on or off in its settings.
 */
@Controller('orders/:id/photos')
class OrderPhotosController {
  constructor(private readonly db: Database) {}

  private async order(actor: Actor, id: string) {
    const order = await this.db.order.findFirst({ where: { id, ...orderScope(actor) }, select: { id: true } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  @Get() @Permissions('orders.view')
  async list(@CurrentActor() a: Actor, @Param('id') id: string) {
    await this.order(a, id);
    return this.db.orderPhoto.findMany({ where: { organizationId: a.organizationId, orderId: id }, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true, size: true } });
  }

  @Post() @Permissions('orders.create')
  async add(@CurrentActor() a: Actor, @Param('id') id: string, @Body() d: PhotoDto) {
    if (!await photosEnabled(this.db, a.organizationId)) throw new ForbiddenException('PHOTOS_DISABLED');
    await this.order(a, id);
    const m = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(d.image);
    if (!m) throw new BadRequestException('PHOTO_TYPE');
    const bytes = Buffer.from(m[2]!, 'base64');
    if (bytes.length > MAX_BYTES) throw new BadRequestException('PHOTO_TOO_LARGE');
    if (await this.db.orderPhoto.count({ where: { organizationId: a.organizationId, orderId: id } }) >= MAX_PER_ORDER) throw new BadRequestException('TOO_MANY_PHOTOS');
    const photo = await this.db.orderPhoto.create({ data: { organizationId: a.organizationId, orderId: id, mime: m[1]!, size: bytes.length, createdById: a.userId } });
    try {
      const file = fileOf(photo);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    } catch (e) {
      await this.db.orderPhoto.delete({ where: { id: photo.id } });
      throw e;
    }
    return { id: photo.id, createdAt: photo.createdAt, size: photo.size };
  }

  @Get(':photoId') @Permissions('orders.view')
  async file(@CurrentActor() a: Actor, @Param('id') id: string, @Param('photoId') photoId: string) {
    await this.order(a, id);
    const photo = await this.db.orderPhoto.findFirst({ where: { id: photoId, organizationId: a.organizationId, orderId: id } });
    if (!photo) throw new NotFoundException();
    return new StreamableFile(createReadStream(fileOf(photo)), { type: photo.mime, length: photo.size, disposition: 'inline' });
  }

  @Delete(':photoId') @Permissions('orders.edit') @HttpCode(200)
  async remove(@CurrentActor() a: Actor, @Param('id') id: string, @Param('photoId') photoId: string) {
    await this.order(a, id);
    const photo = await this.db.orderPhoto.findFirst({ where: { id: photoId, organizationId: a.organizationId, orderId: id } });
    if (!photo) throw new NotFoundException();
    await this.db.orderPhoto.delete({ where: { id: photo.id } });
    await rm(fileOf(photo), { force: true });
    await this.db.auditLog.create({ data: { organizationId: a.organizationId, actorId: a.userId, action: 'ORDER_PHOTO_DELETED', entityId: id } });
    return { ok: true };
  }
}

/** Photos are kept until 180 days after the order closed (handed over or cancelled), then removed with their files. */
class PhotoRetention implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger('PhotoRetention');
  constructor(private readonly db: Database) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch(e => this.logger.warn(String(e))), 6 * 3600_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async sweep() {
    const before = new Date(Date.now() - KEEP_DAYS_AFTER_CLOSE * 86400_000);
    const old = await this.db.orderPhoto.findMany({ where: { order: { status: { in: ['DELIVERED', 'CANCELLED'] }, updatedAt: { lt: before } } }, take: 500 });
    for (const p of old) { await rm(fileOf(p), { force: true }); await this.db.orderPhoto.delete({ where: { id: p.id } }); }
    if (old.length) this.logger.log(`removed ${old.length} old intake photos`);
  }
}

@Module({ controllers: [OrderPhotosController], providers: [{ provide: PhotoRetention, useFactory: (db: Database) => new PhotoRetention(db), inject: [Database] }] })
export class OrderPhotosModule {}
