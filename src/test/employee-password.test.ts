import { describe, it, expect } from "vitest";
import { ResetPasswordSchema, generatePassword } from "@/lib/employee-password";

const id = "123e4567-e89b-12d3-a456-426614174000";
describe("Passwort zurücksetzen", () => {
  it("lehnt Passwörter unter 8 Zeichen ab", () => {
    expect(ResetPasswordSchema.safeParse({ user_id: id, password: "1234567" }).success).toBe(false);
  });
  it("akzeptiert 8 Zeichen", () => {
    expect(ResetPasswordSchema.safeParse({ user_id: id, password: "12345678" }).success).toBe(true);
  });
  it("erzeugt gültige Zufallspasswörter", () => {
    expect(ResetPasswordSchema.safeParse({ user_id: id, password: generatePassword() }).success).toBe(true);
  });
});
