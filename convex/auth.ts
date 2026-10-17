import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { isEmailAllowed, normalizeEmail, policyFromEnv } from "./lib/signupPolicy";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Runs for every flow, so removing someone from the allowlist also blocks their sign-in.
      profile(params) {
        const email = normalizeEmail(String(params.email ?? ""));
        if (!isEmailAllowed(email, policyFromEnv(process.env))) {
          throw new ConvexError({ code: "forbidden", message: "This email is not allowed to access this dashboard." });
        }
        return { email };
      },
    }),
  ],
});
