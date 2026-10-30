CREATE TABLE "task_assignees" (
	"task_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "task_assignees_task_id_member_id_pk" PRIMARY KEY("task_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"sub_event_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"category" text,
	"due_on" date,
	"position" text NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"template_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "tasks_title_check" CHECK (char_length("tasks"."title") between 1 and 200),
	CONSTRAINT "tasks_completed_check" CHECK (("tasks"."status" = 'done') = ("tasks"."completed_at" is not null)),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('todo', 'in_progress', 'blocked', 'done')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" in ('low', 'medium', 'high', 'urgent'))
);
--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_fk" FOREIGN KEY ("event_id","task_id") REFERENCES "public"."tasks"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_member_fk" FOREIGN KEY ("event_id","member_id") REFERENCES "public"."members"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sub_event_fk" FOREIGN KEY ("event_id","sub_event_id") REFERENCES "public"."sub_events"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_fk" FOREIGN KEY ("event_id","parent_task_id") REFERENCES "public"."tasks"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_assignees_member_id_idx" ON "task_assignees" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "tasks_event_status_due_idx" ON "tasks" USING btree ("event_id","status","due_on") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_event_sub_event_idx" ON "tasks" USING btree ("event_id","sub_event_id") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks" USING btree ("parent_task_id") WHERE "tasks"."parent_task_id" is not null;