import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Logger, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Database } from '../database';
import { AllowBlocked, CurrentActor } from '../auth/security';
import type { Actor } from '../auth/security';
import { BotService } from '../bot/bot.service';
import { OwnBots } from '../bot/own-bot';
import { esc } from '../bot/telegram.client';
import { UPLOAD_DIR } from '../orders/photos.module';

class DeleteAccountDto {
  @IsString() @MaxLength(200) password!: string;
  /** The owner types the service's name to confirm that everything goes. */
  @IsOptional() @IsString() @MaxLength(200) confirm?: string;
}

/**
 * Removes a service and everything it ever stored: every table that has an organizationId, its users'
 * sessions and Telegram links, its photo files. Tables reference each other (orders → customers → …),
 * so each table is tried in turn and the ones still referenced are tried again on the next pass.
 */
export async function purgeOrganization(db: Database, orgId: string) {
  const users = await db.user.findMany({ where: { organizationId: orgId }, select: { id: true } });
  const tables = (await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name = 'organizationId' AND table_name <> 'Organization'`).map(t => t.table_name);
  await db.$transaction(async tx => {
    await tx.telegramLink.deleteMany({ where: { targetId: { in: [orgId, ...users.map(u => u.id)] } } });
    let left = tables;
    for (let pass = 0; left.length; pass++) {
      const stuck: string[] = [];
      for (const table of left) {
        await tx.$executeRawUnsafe('SAVEPOINT purge');
        try {
          await tx.$executeRawUnsafe(`DELETE FROM "${table.replace(/"/g, '')}" WHERE "organizationId" = $1`, orgId);
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT purge');
        } catch {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT purge');
          stuck.push(table);
        }
      }
      if (stuck.length === left.length || pass > 30) throw new Error('PURGE_STUCK: ' + stuck.join(', '));
      left = stuck;
    }
    await tx.organization.delete({ where: { id: orgId } });
  }, { timeout: 120_000, maxWait: 10_000 });
  await rm(path.join(UPLOAD_DIR, orgId), { recursive: true, force: true });
}

/**
 * Deleting one's account from the app (App Store 5.1.1(v), Google Play's account deletion policy).
 * The owner deletes the whole service; anyone else deletes their own staff account, whose name and
 * phone are wiped while the orders they worked on stay with the service.
 */
@Controller('account')
export class AccountDeletionController {
  private readonly logger = new Logger('AccountDeletion');
  constructor(private readonly db: Database, private readonly bot: BotService, private readonly own: OwnBots) {}

  @Post('delete') @AllowBlocked() @HttpCode(200)
  async remove(@CurrentActor() a: Actor, @Body() d: DeleteAccountDto) {
    if (a.support) throw new ForbiddenException('SUPPORT_SESSION');
    const user = await this.db.user.findFirstOrThrow({ where: { id: a.userId, organizationId: a.organizationId } });
    if (!await argon2.verify(user.passwordHash, d.password)) throw new BadRequestException('WRONG_PASSWORD');

    if (!a.owner) {
      await this.db.$transaction([
        this.db.user.update({ where: { id: user.id }, data: {
          status: 'ARCHIVED', login: 'deleted-' + user.id, firstName: "O'chirilgan xodim", lastName: null, phone: '',
          telegramChatId: null, passwordHash: await argon2.hash(randomBytes(32), { type: argon2.argon2id }),
        } }),
        this.db.session.deleteMany({ where: { userId: user.id } }),
        this.db.telegramLink.deleteMany({ where: { targetId: user.id } }),
        this.db.pushDevice.deleteMany({ where: { userId: user.id } }),
        this.db.auditLog.create({ data: { organizationId: a.organizationId, actorId: user.id, action: 'ACCOUNT_DELETED', entityId: user.id } }),
      ]);
      return { deleted: 'user' };
    }

    const org = await this.db.organization.findUniqueOrThrow({ where: { id: a.organizationId }, select: { name: true } });
    const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!d.confirm || norm(d.confirm) !== norm(org.name)) throw new BadRequestException('CONFIRM_NAME');
    // The service's own Telegram bot stops pointing at us before its settings go.
    await this.own.disconnect(a.organizationId, user.id).catch(() => undefined);
    await purgeOrganization(this.db, a.organizationId);
    this.logger.log(`organization ${a.organizationId} deleted by its owner`);
    void this.bot.notifyAdmins(`🗑 <b>${esc(org.name)}</b> servisi egasi tomonidan o'chirildi (barcha ma'lumotlari bilan).`).catch(() => undefined);
    return { deleted: 'organization' };
  }
}
