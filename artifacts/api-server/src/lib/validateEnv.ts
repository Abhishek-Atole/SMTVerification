const REQUIRED = ["DATABASE_URL", "JWT_SECRET", "ALLOWED_ORIGINS"];

export function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}