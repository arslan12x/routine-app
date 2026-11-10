import { SignJWT } from "jose";
import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

export const GET = route(async () => {
  const user = await requireUser();
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    throw new ApiError(503, "REALTIME_NOT_CONFIGURED", "Realtime sync is not configured on the server.");
  }

  const token = await new SignJWT({ role: "authenticated", aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(jwtSecret));
  return { token };
});
