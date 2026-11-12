import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(128).refine((value) => new TextEncoder().encode(value).length <= 128),
});
export const loginFailure = "Unable to sign in. Check your credentials or wait 15 minutes before trying again.";
