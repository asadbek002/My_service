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

const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Summani raqamda yozing");

export const deviceSchema = z.object({
  category: z.string().min(1, "Turini tanlang"),
  brand: z.string().min(1, "Brendni yozing"),
  model: z.string().min(1, "Modelni yozing"),
});

export const orderSchema = z.object({
  customerId: z.string().min(1, "Mijoz tanlanmagan"),
  deviceId: z.string().min(1, "Qurilma tanlanmagan"),
  complaint: z.string().min(1, "Nosozlikni yozing"),
  accessories: z.array(z.string()).default([]),
  labor: money,
  partsTotal: money,
});

export const staffSchema = z.object({
  firstName: z.string().min(1, "Ismni yozing"),
  lastName: z.string().optional(),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Telefon: +998901234567"),
  login: z.string().min(3, "Login kamida 3 belgi").regex(/^[a-zA-Z0-9_.-]+$/, "Faqat lotin harf, raqam va _ . -"),
  temporaryPassword: z.string().min(12, "Parol kamida 12 belgi"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Joriy parol majburiy"),
  newPassword: z.string().min(12, "Yangi parol kamida 12 belgi bo'lishi kerak"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "Parollar bir xil emas",
  path: ["confirmPassword"],
});

export const paymentSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri summa"),
  // Built-in methods plus organization-defined keys (settings → payment methods).
  method: z.string().regex(/^[A-Z0-9_]{1,64}$/, "To'lov usuli tanlanmagan"),
  note: z.string().optional(),
});

export const expenseSchema = z.object({
  amount: money,
  category: z.string().min(1, "Turini tanlang"),
  note: z.string().min(3, "Izoh kamida 3 belgi"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type StaffInput = z.infer<typeof staffSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
