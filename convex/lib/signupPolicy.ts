/**
 * Who may use the dashboard. A self-hosted analytics instance on a public
 * URL must not let strangers sign up, so production sets one of:
 *   AUTH_ALLOWED_EMAILS   = "me@example.com,teammate@example.com"
 *   AUTH_ALLOWED_DOMAINS  = "example.com"
 * With neither set (local development), anyone can sign up.
 */
export interface AccessPolicy {
  emails: string[];
  domains: string[];
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function policyFromEnv(env: Record<string, string | undefined>): AccessPolicy {
  return { emails: parseList(env.AUTH_ALLOWED_EMAILS), domains: parseList(env.AUTH_ALLOWED_DOMAINS) };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailAllowed(email: string, policy: AccessPolicy): boolean {
  if (policy.emails.length === 0 && policy.domains.length === 0) return true;
  const normalized = normalizeEmail(email);
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  return policy.emails.includes(normalized) || policy.domains.includes(domain);
}
