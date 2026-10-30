CREATE TABLE "activity_log" (
	"id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"channel" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"undo_of_id" uuid,
	"undone_at" timestamp with time zone,
	CONSTRAINT "activity_log_pkey" PRIMARY KEY("created_at","id"),
	CONSTRAINT "activity_log_channel_check" CHECK ("activity_log"."channel" in ('app', 'public_link', 'system', 'ai', 'whatsapp'))
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_log_id_unique" ON "activity_log" USING btree ("id");--> statement-breakpoint
CREATE INDEX "activity_log_event_created_idx" ON "activity_log" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);