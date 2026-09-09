import { z } from "zod";
import { CURRENCIES, HORIZONS, OBJECTIVES, RISK_SCORES } from "./enums";

export const credentialsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export const registerSchema = credentialsSchema.extend({
  name: z.string().min(1).max(120).optional(),
});

export const onboardingSchema = z.object({
  capitalAmount: z.number().positive().max(1_000_000_000),
  capitalCurrency: z.enum(CURRENCIES),
  riskScore: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  horizon: z.enum(HORIZONS),
  objective: z.enum(OBJECTIVES),
  existingPositions: z
    .array(
      z.object({
        ticker: z.string().min(1).max(12),
        quantity: z.number().positive(),
        avgPrice: z.number().positive(),
      }),
    )
    .max(50)
    .optional()
    .default([]),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

void RISK_SCORES;
