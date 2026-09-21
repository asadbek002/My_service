import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string().min(3, "Login kamida 3 belgi"),
  password: z.string().min(8, "Parol kamida 8 belgi"),
});

export const customerSchema = z.object({
  firstName: z.string().min(1, "Ism majburiy"),
  lastName: z.string().optional(),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Noto'g'ri telefon raqam"),
  telegramUsername: z.string().optional(),
  notificationPreference: z.enum(['AUTO', 'TELEGRAM', 'SMS']).default('AUTO'),
});

export const deviceSchema = z.object({
  category: z.string().min(1, "Kategoriya majburiy"),
  brand: z.string().min(1, "Brend majburiy"),
  model: z.string().min(1, "Model majburiy"),
  imei: z.string().optional(),
  serialNumber: z.string().optional(),
  color: z.string().optional(),
});

export const orderSchema = z.object({
  customerId: z.string().min(1, "Mijoz tanlanmagan"),
  deviceId: z.string().min(1, "Qurilma tanlanmagan"),
  branchId: z.string().min(1, "Filial tanlanmagan"),
  complaint: z.string().min(3, "Shikoyat majburiy"),
  accessories: z.string().optional(),
  condition: z.string().optional(),
});

export const staffSchema = z.object({
  login: z.string().min(3).regex(/^[a-zA-Z0-9_.-]+$/, "Faqat harf, raqam va _ . -"),
  firstName: z.string().min(1, "Ism majburiy"),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Noto'g'ri telefon"),
  temporaryPassword: z.string().min(12, "Kamida 12 belgi"),
  role: z.enum(['ADMIN', 'MANAGER', 'TECHNICIAN']),
  branchId: z.string().min(1, "Filial tanlanmagan"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Joriy parol majburiy"),
  newPassword: z.string().min(12, "Kamida 12 belgi"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, { message: "Parollar mos emas", path: ["confirmPassword"] });

export const diagnosisSchema = z.object({
  diagnosis: z.string().min(3, "Diagnostika majburiy"),
  requiredWork: z.string().min(3, "Ish turi majburiy"),
  laborAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri summa"),
  partsAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri summa"),
  estimatedMinutes: z.number().min(1).optional(),
});

export const paymentSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri summa"),
  method: z.enum(['CASH', 'CARD', 'CLICK', 'PAYME', 'TRANSFER', 'OTHER']),
  note: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type StaffInput = z.infer<typeof staffSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DiagnosisInput = z.infer<typeof diagnosisSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
