import { Controller, Get, Module, NotFoundException, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { Database } from '../database';
import { CurrentActor, Permissions } from '../auth/security';
import type { Actor } from '../auth/security';
import { createLink } from '../notifications/links.module';
import { orderScope } from '../orders/orders.module';

/**
 * Data for the printable thermal receipt (58/80 mm). The web app renders and prints it;
 * nothing is stored, so no object storage is needed.
 */
@Controller('orders')
class ReceiptController {
  constructor(private readonly db: Database) {}

  @Get(':id/receipt') @Permissions('orders.view')
  async receipt(@CurrentActor() a: Actor, @Param('id') id: string, @Query('type') type?: string) {
    const order = await this.db.order.findFirst({ where: { id, ...orderScope(a) }, include: { customer: true, device: true, payments: true, warranty: true, organization: true } });
    if (!order) throw new NotFoundException();
    const paid = order.payments.reduce((n, p) => p.kind === 'REFUND' ? n.minus(p.amount) : n.plus(p.amount), new Prisma.Decimal(0));
    const settings = await this.db.organizationSetting.findMany({ where: { organizationId: a.organizationId, key: { in: ['general', 'receipt'] } } });
    const value = (key: string) => (settings.find(s => s.key === key)?.value ?? {}) as Record<string, unknown>;
    const text = (v: unknown) => typeof v === 'string' ? v : '';
    const general = value('general'), receipt = value('receipt');

    // Only the hash of a tracking token is stored, so each print mints a new 90-day link for the QR.
    const trackingUrl = process.env.WEB_URL + '/track/' + await createLink(this.db, a.organizationId, id, 'TRACK');

    return {
      type: type === 'delivery' ? 'delivery' : 'receipt',
      width: receipt.width === 58 ? 58 : 80,
      // Social handles printed at the bottom; unset → MyService's own accounts, empty string → hidden.
      service: {
        name: text(general.name) || order.organization.name, phone: text(general.phone), address: text(general.address), footer: text(receipt.footer),
        telegram: typeof receipt.telegram === 'string' ? receipt.telegram.trim() : '@myserviceuzz',
        instagram: typeof receipt.instagram === 'string' ? receipt.instagram.trim() : 'myserviceuz',
      },
      order: {
        number: order.number, status: order.status, createdAt: order.createdAt, complaint: order.complaint, accessories: order.accessories,
        labor: order.labor.toString(), partsTotal: order.partsTotal.toString(), total: order.total.toString(),
        paid: paid.toString(), balance: order.total.minus(paid).toString(),
      },
      customer: { name: [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' '), phone: order.customer.phone },
      device: { category: order.device.category, brand: order.device.brand, model: order.device.model },
      warranty: order.warranty ? { endDate: order.warranty.endDate, terms: order.warranty.terms } : null,
      trackingUrl,
      qrSvg: await QRCode.toString(trackingUrl, { type: 'svg', margin: 0, width: 140 }),
      printedAt: new Date(),
    };
  }
}

@Module({ controllers: [ReceiptController] })
export class DocumentsModule {}
