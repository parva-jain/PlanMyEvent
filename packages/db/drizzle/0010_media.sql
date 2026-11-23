CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sub_event_id" uuid,
	"caption" text,
	"uploaded_by_user_id" uuid,
	"uploaded_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('gallery', 'receipt', 'cover')),
	CONSTRAINT "media_status_check" CHECK ("media"."status" in ('pending', 'ready', 'failed')),
	CONSTRAINT "media_bucket_check" CHECK ("media"."bucket" in ('public', 'private')),
	CONSTRAINT "media_receipt_private_check" CHECK ("media"."kind" <> 'receipt' or "media"."bucket" = 'private'),
	CONSTRAINT "media_bytes_check" CHECK ("media"."bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_media_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_sub_event_fk" FOREIGN KEY ("event_id","sub_event_id") REFERENCES "public"."sub_events"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_event_kind_created_idx" ON "media" USING btree ("event_id","kind","created_at" DESC NULLS LAST) WHERE "media"."status" = 'ready' and "media"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "media_unconfirmed_idx" ON "media" USING btree ("created_at") WHERE "media"."uploaded_at" is null;--> statement-breakpoint
CREATE INDEX "media_deleted_idx" ON "media" USING btree ("deleted_at") WHERE "media"."deleted_at" is not null;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_media_fk" FOREIGN KEY ("event_id","receipt_media_id") REFERENCES "public"."media"("event_id","id") ON DELETE no action ON UPDATE no action;