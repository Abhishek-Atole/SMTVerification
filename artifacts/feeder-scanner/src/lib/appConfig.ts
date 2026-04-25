export const appConfig = {
  companyName: import.meta.env.VITE_COMPANY_NAME ?? "Your Company",
  companyShort: import.meta.env.VITE_COMPANY_SHORT ?? "CO",
  systemTitle: import.meta.env.VITE_SYSTEM_TITLE ?? "SMT Verification",
  version: import.meta.env.VITE_SYSTEM_VERSION ?? "1.0.0",
  logoUrl: import.meta.env.VITE_LOGO_URL ?? null,
} as const;