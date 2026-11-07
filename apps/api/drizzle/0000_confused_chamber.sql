CREATE TABLE "categories" (
	"curriculum_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"required" integer NOT NULL,
	"color" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "categories_curriculum_id_key_pk" PRIMARY KEY("curriculum_id","key"),
	CONSTRAINT "categories_required_not_negative" CHECK ("categories"."required" >= 0)
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"curriculum_id" text NOT NULL,
	"id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"category_key" text NOT NULL,
	"group_key" text,
	"pool_key" text,
	"semester" text NOT NULL,
	"offered" text[],
	"position" integer NOT NULL,
	CONSTRAINT "courses_curriculum_id_id_pk" PRIMARY KEY("curriculum_id","id"),
	CONSTRAINT "courses_credits_positive" CHECK ("courses"."credits" > 0),
	CONSTRAINT "courses_semester_format" CHECK ("courses"."semester" ~ '^[1-5]/[12]$'),
	CONSTRAINT "courses_offered_valid" CHECK ("courses"."offered" IS NULL OR (cardinality("courses"."offered") > 0 AND "courses"."offered" <@ ARRAY['1','2']::text[]))
);
--> statement-breakpoint
CREATE TABLE "curricula" (
	"id" text PRIMARY KEY NOT NULL,
	"list_name" text NOT NULL,
	"name" text NOT NULL,
	"total_credits" integer NOT NULL,
	"max_credits_per_semester" integer NOT NULL,
	"note" text,
	"offered_note" text,
	"position" integer NOT NULL,
	CONSTRAINT "curricula_total_credits_positive" CHECK ("curricula"."total_credits" > 0),
	CONSTRAINT "curricula_max_credits_positive" CHECK ("curricula"."max_credits_per_semester" > 0)
);
--> statement-breakpoint
CREATE TABLE "curriculum_notices" (
	"curriculum_id" text NOT NULL,
	"notice_slug" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "curriculum_notices_curriculum_id_notice_slug_pk" PRIMARY KEY("curriculum_id","notice_slug")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"curriculum_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "groups_curriculum_id_key_pk" PRIMARY KEY("curriculum_id","key")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"slug" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_option_prerequisites" (
	"curriculum_id" text NOT NULL,
	"pool_key" text NOT NULL,
	"option_id" text NOT NULL,
	"prereq_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "pool_option_prerequisites_curriculum_id_pool_key_option_id_prereq_id_pk" PRIMARY KEY("curriculum_id","pool_key","option_id","prereq_id")
);
--> statement-breakpoint
CREATE TABLE "pool_options" (
	"curriculum_id" text NOT NULL,
	"pool_key" text NOT NULL,
	"id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"offered" text[],
	"position" integer NOT NULL,
	CONSTRAINT "pool_options_curriculum_id_pool_key_id_pk" PRIMARY KEY("curriculum_id","pool_key","id"),
	CONSTRAINT "pool_options_credits_positive" CHECK ("pool_options"."credits" > 0),
	CONSTRAINT "pool_options_offered_valid" CHECK ("pool_options"."offered" IS NULL OR (cardinality("pool_options"."offered") > 0 AND "pool_options"."offered" <@ ARRAY['1','2']::text[]))
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"curriculum_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"position" integer NOT NULL,
	CONSTRAINT "pools_curriculum_id_key_pk" PRIMARY KEY("curriculum_id","key")
);
--> statement-breakpoint
CREATE TABLE "prerequisites" (
	"curriculum_id" text NOT NULL,
	"course_id" text NOT NULL,
	"prereq_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "prerequisites_curriculum_id_course_id_prereq_id_pk" PRIMARY KEY("curriculum_id","course_id","prereq_id"),
	CONSTRAINT "prerequisites_not_self" CHECK ("prerequisites"."course_id" <> "prerequisites"."prereq_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_curriculum_id_category_key_categories_curriculum_id_key_fk" FOREIGN KEY ("curriculum_id","category_key") REFERENCES "public"."categories"("curriculum_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_curriculum_id_group_key_groups_curriculum_id_key_fk" FOREIGN KEY ("curriculum_id","group_key") REFERENCES "public"."groups"("curriculum_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_curriculum_id_pool_key_pools_curriculum_id_key_fk" FOREIGN KEY ("curriculum_id","pool_key") REFERENCES "public"."pools"("curriculum_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_notices" ADD CONSTRAINT "curriculum_notices_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_notices" ADD CONSTRAINT "curriculum_notices_notice_slug_notices_slug_fk" FOREIGN KEY ("notice_slug") REFERENCES "public"."notices"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_option_prerequisites" ADD CONSTRAINT "pool_option_prerequisites_curriculum_id_pool_key_option_id_pool_options_curriculum_id_pool_key_id_fk" FOREIGN KEY ("curriculum_id","pool_key","option_id") REFERENCES "public"."pool_options"("curriculum_id","pool_key","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_option_prerequisites" ADD CONSTRAINT "pool_option_prerequisites_curriculum_id_prereq_id_courses_curriculum_id_id_fk" FOREIGN KEY ("curriculum_id","prereq_id") REFERENCES "public"."courses"("curriculum_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_options" ADD CONSTRAINT "pool_options_curriculum_id_pool_key_pools_curriculum_id_key_fk" FOREIGN KEY ("curriculum_id","pool_key") REFERENCES "public"."pools"("curriculum_id","key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_curriculum_id_course_id_courses_curriculum_id_id_fk" FOREIGN KEY ("curriculum_id","course_id") REFERENCES "public"."courses"("curriculum_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_curriculum_id_prereq_id_courses_curriculum_id_id_fk" FOREIGN KEY ("curriculum_id","prereq_id") REFERENCES "public"."courses"("curriculum_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prerequisites_reverse_idx" ON "prerequisites" USING btree ("curriculum_id","prereq_id");