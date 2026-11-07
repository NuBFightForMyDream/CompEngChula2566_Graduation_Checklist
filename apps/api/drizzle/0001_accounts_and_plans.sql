CREATE TABLE "plan_items" (
	"plan_id" uuid NOT NULL,
	"course_id" text NOT NULL,
	"kind" text NOT NULL,
	"semester" text NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"grade" text,
	"choice_id" text,
	"choice_code" text,
	"choice_name" text,
	"choice_credits" integer,
	"extra_code" text,
	"extra_name" text,
	"extra_credits" integer,
	"extra_category" text,
	"extra_position" integer,
	CONSTRAINT "plan_items_plan_id_course_id_pk" PRIMARY KEY("plan_id","course_id"),
	CONSTRAINT "plan_items_semester_format" CHECK ("plan_items"."semester" ~ '^[1-5]/[12]$'),
	CONSTRAINT "plan_items_grade_valid" CHECK ("plan_items"."grade" IS NULL OR "plan_items"."grade" IN ('A','B+','B','C+','C','D+','D','F','S','U','W')),
	CONSTRAINT "plan_items_grade_matches_passed" CHECK ("plan_items"."grade" IS NULL OR ("plan_items"."grade" IN ('A','B+','B','C+','C','D+','D','S')) = "plan_items"."passed"),
	CONSTRAINT "plan_items_choice_complete" CHECK (("plan_items"."choice_code" IS NULL AND "plan_items"."choice_name" IS NULL AND "plan_items"."choice_credits" IS NULL AND "plan_items"."choice_id" IS NULL)
        OR ("plan_items"."kind" = 'curriculum' AND "plan_items"."choice_code" IS NOT NULL AND "plan_items"."choice_name" IS NOT NULL AND "plan_items"."choice_credits" BETWEEN 1 AND 6)),
	CONSTRAINT "plan_items_extra_complete" CHECK (("plan_items"."kind" = 'curriculum' AND "plan_items"."extra_code" IS NULL AND "plan_items"."extra_name" IS NULL AND "plan_items"."extra_credits" IS NULL AND "plan_items"."extra_category" IS NULL AND "plan_items"."extra_position" IS NULL)
        OR ("plan_items"."kind" = 'extra' AND "plan_items"."extra_code" IS NOT NULL AND "plan_items"."extra_name" IS NOT NULL AND "plan_items"."extra_credits" BETWEEN 1 AND 6 AND "plan_items"."extra_category" IS NOT NULL AND "plan_items"."extra_position" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"curriculum_id" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "plans_version_positive" CHECK ("plans"."version" >= 1),
	CONSTRAINT "plans_name_length" CHECK (char_length("plans"."name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_items_one_choice_per_plan" ON "plan_items" USING btree ("plan_id","choice_id") WHERE "plan_items"."choice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");