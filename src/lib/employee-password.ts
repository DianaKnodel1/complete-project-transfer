import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;

export const ResetPasswordSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`).max(72),
});

/** Lesbares Zufallspasswort ohne verwechselbare Zeichen (0/O, 1/l/I). */
export function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
