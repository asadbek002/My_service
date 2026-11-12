import { Prisma } from '@prisma/client';
type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Money still owed on orders, counted in the database: loading every order with its payments to add
 * them up in Node grew with each order a service ever took and made the dashboard slow under load.
 * `scope` is orderScope(): the service, and a branch or the branches a staff member works in.
 */
function where(scope: Prisma.OrderWhereInput, statuses: { only?: string; except?: string }) {
  const parts = [Prisma.sql`o."organizationId" = ${scope.organizationId as string}`];
  const branch = scope.branchId as string | { in: string[] } | undefined;
  if (typeof branch === 'string') parts.push(Prisma.sql`o."branchId" = ${branch}`);
  else if (branch?.in) parts.push(branch.in.length ? Prisma.sql`o."branchId" IN (${Prisma.join(branch.in)})` : Prisma.sql`FALSE`);
  if (statuses.only) parts.push(Prisma.sql`o.status = ${statuses.only}`);
  if (statuses.except) parts.push(Prisma.sql`o.status <> ${statuses.except}`);
  return Prisma.join(parts, ' AND ');
}
const owed = Prisma.sql`o.total - COALESCE((SELECT SUM(CASE WHEN p.kind = 'REFUND' THEN -p.amount ELSE p.amount END) FROM "Payment" p WHERE p."organizationId" = o."organizationId" AND p."orderId" = o.id), 0)`;

/** Total still to be paid on the matching orders (only what is owed, overpayments do not cancel it). */
export async function debtTotal(db: Db, scope: Prisma.OrderWhereInput, statuses: { only?: string; except?: string }) {
  const [row] = await db.$queryRaw<{ debt: Prisma.Decimal | null }[]>`SELECT SUM(GREATEST(${owed}, 0)) AS debt FROM "Order" o WHERE ${where(scope, statuses)}`;
  return new Prisma.Decimal(row?.debt ?? 0);
}

/** Ids of the matching orders that still owe money, newest first. */
export async function debtorIds(db: Db, scope: Prisma.OrderWhereInput, statuses: { only?: string; except?: string }, limit: number) {
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT o.id FROM "Order" o WHERE ${where(scope, statuses)} AND ${owed} > 0 ORDER BY o."createdAt" DESC LIMIT ${limit}`;
  return rows.map(r => r.id);
}
