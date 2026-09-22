import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string().min(3, "Login kamida 3 belgi bo'lishi kerak"),
  password: z.string().min(8, "Parol kamida 8 belgi bo'lishi kerak"),
});

export const customerSchema = z.object({
  firstName: z.string().min(1, "Ism majburiy"),
  lastName: z.string().optional(),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Noto'g'ri telefon raqam (+998...)"),
  telegramUsername: z.string().optional(),
  notificationPreference: z.enum(['AUTO', 'TELEGRAM', 'SMS']).default('AUTO'),
  notes: z.string().optional(),
});

export const deviceSchema = z.object({
  category: z.string().min(1, "Kategoriya majburiy"),
  brand: z.string().min(1, "Brend majburiy"),
  model: z.string().min(1, "Model majburiy"),
  imei: z.string().optional(),
  serialNumber: z.string().optional(),
  color: z.string().optional(),
  notes: z.string().optional(),
});

export const orderSchema = z.object({
  customerId: z.string().min(1, "Mijoz tanlanmagan"),
  deviceId: z.string().min(1, "Qurilma tanlanmagan"),
  branchId: z.string().min(1, "Filial tanlanmagan"),
  complaint: z.string().min(3, "Mijoz shikoyati majburiy"),
  accessories: z.array(z.string()).default([]),
  condition: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const staffSchema = z.object({
  login: z.string().min(3).regex(/^[a-zA-Z0-9_.-]+$/, "Faqat harf, raqam va _ . -"),
  firstName: z.string().min(1, "Ism majburiy"),
  lastName: z.string().optional(),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Noto'g'ri telefon (+998...)"),
  temporaryPassword: z.string().min(12, "Vaqtinchalik parol kamida 12 belgi bo'lishi kerak"),
  role: z.enum(['ADMIN', 'MANAGER', 'TECHNICIAN']),
  branchId: z.string().min(1, "Filial tanlanmagan"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Joriy parol majburiy"),
  newPassword: z.string().min(12, "Yangi parol kamida 12 belgi bo'lishi kerak"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "Parollar bir xil emas",
  path: ["confirmPassword"],
});

export const diagnosisSchema = z.object({
  diagnosis: z.string().min(3, "Diagnostika xulosasi majburiy"),
  requiredWork: z.string().min(3, "Bajariladigan ish turi majburiy"),
  labor: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri xizmat narxi"),
  partsTotal: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri ehtiyot qism narxi"),
  estimatedMinutes: z.number().min(1).optional(),
});

export const paymentSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri summa"),
  method: z.enum(['CASH', 'CARD', 'CLICK', 'PAYME', 'TRANSFER', 'OTHER']),
  note: z.string().optional(),
});

export const expenseSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri summa"),
  category: z.string().min(1, "Kategoriya majburiy"),
  branchId: z.string().min(1, "Filial majburiy"),
  description: z.string().optional(),
});

export const partSchema = z.object({
  name: z.string().min(1, "Nomi majburiy"),
  sku: z.string().min(1, "SKU majburiy"),
  barcode: z.string().optional(),
  brand: z.string().min(1, "Brend majburiy"),
  compatibleModels: z.array(z.string()).default([]),
  storageLocation: z.string().optional(),
  minimumQuantity: z.number().min(0).default(0),
  purchasePrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri kirim narxi"),
  salePrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri sotuv narxi"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type StaffInput = z.infer<typeof staffSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DiagnosisInput = z.infer<typeof diagnosisSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type PartInput = z.infer<typeof partSchema>;
