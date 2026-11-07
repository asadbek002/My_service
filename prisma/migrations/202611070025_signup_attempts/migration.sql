-- Self sign-up progress per phone, so the platform sees who started, how far they got and what failed.
CREATE TABLE "SignupAttempt" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'CODE_SENT',
    "method" TEXT,
    "codesSent" INTEGER NOT NULL DEFAULT 0,
    "wrongCodes" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "serviceName" TEXT,
    "login" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SignupAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SignupAttempt_stage_check" CHECK ("stage" IN ('CODE_SENT', 'VERIFIED', 'COMPLETED'))
);
CREATE UNIQUE INDEX "SignupAttempt_phone_key" ON "SignupAttempt"("phone");
CREATE INDEX "SignupAttempt_updatedAt_idx" ON "SignupAttempt"("updatedAt");
