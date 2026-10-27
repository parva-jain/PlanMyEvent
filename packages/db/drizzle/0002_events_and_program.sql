CREATE TABLE "event_modules" (
	"event_id" uuid NOT NULL,
	"module" text NOT NULL,
	"enabled" boolean NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "event_modules_event_id_module_pk" PRIMARY KEY("event_id","module"),
	CONSTRAINT "event_modules_module_check" CHECK ("event_modules"."module" in ('guests', 'registration', 'gallery'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"guest_scope" text DEFAULT 'whole_event' NOT NULL,
	"response_mode" text DEFAULT 'invite_only' NOT NULL,
	"roles_version" integer DEFAULT 1 NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"budget_paise" bigint,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug"),
	CONSTRAINT "events_type_check" CHECK ("events"."type" in ('wedding', 'conference', 'fair', 'celebration', 'custom')),
	CONSTRAINT "events_status_check" CHECK ("events"."status" in ('draft', 'planning', 'live', 'completed', 'archived')),
	CONSTRAINT "events_guest_scope_check" CHECK ("events"."guest_scope" in ('whole_event', 'per_sub_event')),
	CONSTRAINT "events_response_mode_check" CHECK ("events"."response_mode" in ('invite_only', 'invite_rsvp', 'open_registration')),
	CONSTRAINT "events_dates_check" CHECK ("events"."ends_on" >= "events"."starts_on"),
	CONSTRAINT "events_slug_check" CHECK ("events"."slug" ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
	CONSTRAINT "events_budget_check" CHECK ("events"."budget_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"status" text NOT NULL,
	"response_status" smallint,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key"),
	CONSTRAINT "idempotency_keys_status_check" CHECK ("idempotency_keys"."status" in ('in_progress', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "sub_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"venue_id" uuid,
	"capacity" integer,
	"visibility" text DEFAULT 'invite_only' NOT NULL,
	"response_mode" text,
	"group_label" text,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_events_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "sub_events_times_check" CHECK ("sub_events"."ends_at" > "sub_events"."starts_at"),
	CONSTRAINT "sub_events_capacity_check" CHECK ("sub_events"."capacity" > 0),
	CONSTRAINT "sub_events_visibility_check" CHECK ("sub_events"."visibility" in ('public', 'private', 'invite_only')),
	CONSTRAINT "sub_events_response_mode_check" CHECK ("sub_events"."response_mode" in ('invite_only', 'invite_rsvp', 'open_registration'))
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"map_url" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_event_id_id_unique" UNIQUE("event_id","id")
);
--> statement-breakpoint
ALTER TABLE "event_modules" ADD CONSTRAINT "event_modules_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_events" ADD CONSTRAINT "sub_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_events" ADD CONSTRAINT "sub_events_venue_fk" FOREIGN KEY ("event_id","venue_id") REFERENCES "public"."venues"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_workspace_status_idx" ON "events" USING btree ("workspace_id","status") WHERE "events"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "events_owner_user_id_idx" ON "events" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sub_events_event_starts_idx" ON "sub_events" USING btree ("event_id","starts_at") WHERE "sub_events"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "venues_event_id_idx" ON "venues" USING btree ("event_id");