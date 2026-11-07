CREATE TABLE "rate_limit_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limit_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "rate_limit_counters_reset_idx" ON "rate_limit_counters" USING btree ("reset_at");