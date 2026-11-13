-- Urgent orders (red, first in lists) and how the device came in: walk-in or by courier/post.
ALTER TABLE "Order" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "intake" TEXT NOT NULL DEFAULT 'WALK_IN';
ALTER TABLE "Order" ADD COLUMN "courier" TEXT;
ALTER TABLE "Order" ADD COLUMN "inboundTracking" TEXT;
ALTER TABLE "Order" ADD COLUMN "shipAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN "returnCourier" TEXT;
ALTER TABLE "Order" ADD COLUMN "returnTracking" TEXT;
