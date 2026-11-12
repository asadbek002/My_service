-- Pictures of the device's condition taken at intake (files live under UPLOAD_DIR).
CREATE TABLE "OrderPhoto" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderPhoto_organizationId_orderId_idx" ON "OrderPhoto"("organizationId", "orderId");
ALTER TABLE "OrderPhoto" ADD CONSTRAINT "OrderPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
