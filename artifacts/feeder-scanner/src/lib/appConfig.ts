export const appConfig = {
  companyName: import.meta.env.VITE_COMPANY_NAME ?? "UCAL Fuel Systems Limited",
  companyShort: import.meta.env.VITE_COMPANY_SHORT ?? "UCAL",
  systemTitle: import.meta.env.VITE_SYSTEM_TITLE ?? "SMT Changeover Verification System",
  version: import.meta.env.VITE_SYSTEM_VERSION ?? "1.0.0",
  logoUrl: import.meta.env.VITE_LOGO_URL ?? "/assets/ucal-logo.png",
} as const;