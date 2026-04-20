-- Create reporting tables for analytics and report generation

CREATE TABLE "reports" (
    "id" serial PRIMARY KEY NOT NULL,
    "report_type" text NOT NULL,
    "session_id" integer,
    "bom_id" integer,
    "filters" jsonb NOT NULL,
    "format" text NOT NULL,
    "file_path" text,
    "generated_at" timestamp DEFAULT now() NOT NULL,
    "generated_by" text NOT NULL,
    "expires_at" timestamp,
    "query_time" integer,
    "record_count" integer,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "deleted_at" timestamp,
    "deleted_by" text,
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE set null,
    FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE set null
);

CREATE INDEX "reports_report_type_idx" on "reports" ("report_type");
CREATE INDEX "reports_generated_at_idx" on "reports" ("generated_at");
CREATE INDEX "reports_generated_by_idx" on "reports" ("generated_by");
CREATE INDEX "reports_created_at_idx" on "reports" ("created_at");

CREATE TABLE "report_exports" (
    "id" serial PRIMARY KEY NOT NULL,
    "report_id" integer NOT NULL,
    "user_id" text NOT NULL,
    "format" text NOT NULL,
    "downloaded_at" timestamp DEFAULT now() NOT NULL,
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE cascade
);

CREATE INDEX "report_exports_report_id_idx" on "report_exports" ("report_id");
CREATE INDEX "report_exports_user_id_idx" on "report_exports" ("user_id");
CREATE INDEX "report_exports_downloaded_at_idx" on "report_exports" ("downloaded_at");
