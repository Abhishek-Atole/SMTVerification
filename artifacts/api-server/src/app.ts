import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { validateEnv } from "./lib/validateEnv";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

validateEnv();

const app: Express = express();

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Scan rate limit exceeded." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cookieParser());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
  }),
);

// Custom CSP policy (managed separately from Helmet)
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", cspDirectives);
  next();
});

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

app.use("/api/auth/login", loginLimiter);
app.use("/api/verification/scan", scanLimiter);
app.use("/api/", apiLimiter);

// Root route - explains API structure
app.get("/", (req, res) => {
  res.json({
    name: "SMT Verification API",
    version: "1.0.0",
    message: "Backend API for SMT Feeder Scanning & Verification System",
    endpoints: {
      bom: "/api/bom - Bill of Materials management",
      sessions: "/api/sessions - Production session management",
      analytics: "/api/analytics - System analytics",
    },
    frontend: "http://localhost:5173 (when running React dev server)",
    docs: "Refer to backend routes for API documentation",
  });
});

// Diagnostic endpoint
app.get("/api/test-db", async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL || "NOT SET";
    const maskedUrl = dbUrl.replace(/:[^@]+@/, ":***@");
    const result = await db.execute(sql`SELECT 1 as test`);
    res.json({ status: "Database connection OK", databaseUrl: maskedUrl, result });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const dbUrl = process.env.DATABASE_URL || "NOT SET";
    const maskedUrl = dbUrl.replace(/:[^@]+@/, ":***@");
    res.status(500).json({ status: "Database connection FAILED", databaseUrl: maskedUrl, error: errorMessage });
  }
});

// Handle common browser requests silently (no 404 logs)
app.use((req, res, next): void => {
  const url = req.url;
  // Silently handle these common requests
  if (
    url === "/favicon.ico" ||
    url === "/robots.txt" ||
    url.startsWith("/.well-known/") ||
    url.startsWith("/apple-touch-icon")
  ) {
    res.status(204).end();
    return;
  }
  next();
});

app.use("/api", router);

// 404 handler with proper CSP
app.use((req, res) => {
  res.setHeader("Content-Security-Policy", cspDirectives);
  res.status(404).json({ error: "Not Found" });
});

// Error handler with proper CSP
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    res.setHeader("Content-Security-Policy", cspDirectives);
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal Server Error" });
  },
);

export default app;
