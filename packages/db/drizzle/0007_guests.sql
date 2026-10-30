CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"household_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"email" "citext",
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_event_id_id_unique" UNIQUE("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"expected_count" smallint DEFAULT 1 NOT NULL,
	"primary_contact_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "households_expected_count_check" CHECK ("households"."expected_count" between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_household_fk" FOREIGN KEY ("event_id","household_id") REFERENCES "public"."households"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_primary_contact_fk" FOREIGN KEY ("event_id","primary_contact_id") REFERENCES "public"."contacts"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_event_household_idx" ON "contacts" USING btree ("event_id","household_id");--> statement-breakpoint
CREATE INDEX "contacts_tags_idx" ON "contacts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "contacts_name_trgm_idx" ON "contacts" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "contacts_event_phone_idx" ON "contacts" USING btree ("event_id","phone");--> statement-breakpoint
CREATE INDEX "contacts_event_email_idx" ON "contacts" USING btree ("event_id","email");--> statement-breakpoint
CREATE INDEX "households_event_idx" ON "households" USING btree ("event_id") WHERE "households"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "households_name_trgm_idx" ON "households" USING gin ("name" gin_trgm_ops);