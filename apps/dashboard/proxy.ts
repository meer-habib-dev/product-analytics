import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";

const isLoginPage = createRouteMatcher(["/login"]);

/** Everything except the login page requires a signed-in dashboard user. */
export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authenticated = await convexAuth.isAuthenticated();
  if (isLoginPage(request) && authenticated) return nextjsMiddlewareRedirect(request, "/");
  if (!isLoginPage(request) && !authenticated) return nextjsMiddlewareRedirect(request, "/login");
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
