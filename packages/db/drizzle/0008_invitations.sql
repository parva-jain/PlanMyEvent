CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"sub_event_id" uuid,
	"household_id" uuid,
	"contact_id" uuid,
	"invitation_id" uuid,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"party_size" smallint DEFAULT 1 NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"responded_at" timestamp with time zone,
	"qr_token_hash" "bytea",
	"checked_in_at" timestamp with time zone,
	"checked_in_by_member_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "attendance_guest_scope_unique" UNIQUE NULLS NOT DISTINCT("event_id","sub_event_id","household_id","contact_id"),
	CONSTRAINT "attendance_one_guest_check" CHECK (num_nonnulls("attendance"."household_id", "attendance"."contact_id") = 1),
	CONSTRAINT "attendance_invited_check" CHECK ("attendance"."source" <> 'invited' or "attendance"."invitation_id" is not null),
	CONSTRAINT "attendance_party_size_check" CHECK ("attendance"."party_size" between 1 and 50),
	CONSTRAINT "attendance_source_check" CHECK ("attendance"."source" in ('invited', 'registered')),
	CONSTRAINT "attendance_status_check" CHECK ("attendance"."status" in ('invited', 'confirmed', 'declined', 'registered', 'waitlisted', 'cancelled', 'checked_in'))
);
--> statement-breakpoint
CREATE TABLE "invitation_sub_events" (
	"invitation_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"sub_event_id" uuid NOT NULL,
	CONSTRAINT "invitation_sub_events_invitation_id_sub_event_id_pk" PRIMARY KEY("invitation_id","sub_event_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"household_id" uuid,
	"contact_id" uuid,
	"token_hash" "bytea" NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"delivery_status" text DEFAULT 'not_sent' NOT NULL,
	"distributor_member_id" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "invitations_one_guest_check" CHECK (num_nonnulls("invitations"."household_id", "invitations"."contact_id") = 1),
	CONSTRAINT "invitations_delivery_status_check" CHECK ("invitations"."delivery_status" in ('not_sent', 'sent_digitally', 'delivered_in_person'))
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_sub_event_fk" FOREIGN KEY ("event_id","sub_event_id") REFERENCES "public"."sub_events"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_household_fk" FOREIGN KEY ("event_id","household_id") REFERENCES "public"."households"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_contact_fk" FOREIGN KEY ("event_id","contact_id") REFERENCES "public"."contacts"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_invitation_fk" FOREIGN KEY ("event_id","invitation_id") REFERENCES "public"."invitations"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_checked_in_by_fk" FOREIGN KEY ("event_id","checked_in_by_member_id") REFERENCES "public"."members"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_sub_events" ADD CONSTRAINT "invitation_sub_events_invitation_fk" FOREIGN KEY ("event_id","invitation_id") REFERENCES "public"."invitations"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_sub_events" ADD CONSTRAINT "invitation_sub_events_sub_event_fk" FOREIGN KEY ("event_id","sub_event_id") REFERENCES "public"."sub_events"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_household_fk" FOREIGN KEY ("event_id","household_id") REFERENCES "public"."households"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_contact_fk" FOREIGN KEY ("event_id","contact_id") REFERENCES "public"."contacts"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_distributor_fk" FOREIGN KEY ("event_id","distributor_member_id") REFERENCES "public"."members"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_event_sub_event_status_idx" ON "attendance" USING btree ("event_id","sub_event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_qr_token_hash_unique" ON "attendance" USING btree ("qr_token_hash") WHERE "attendance"."qr_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "invitation_sub_events_sub_event_idx" ON "invitation_sub_events" USING btree ("sub_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_event_household_unique" ON "invitations" USING btree ("event_id","household_id") WHERE "invitations"."deleted_at" is null and "invitations"."household_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_event_contact_unique" ON "invitations" USING btree ("event_id","contact_id") WHERE "invitations"."deleted_at" is null and "invitations"."contact_id" is not null;--> statement-breakpoint
CREATE INDEX "invitations_event_delivery_idx" ON "invitations" USING btree ("event_id","delivery_status");--> statement-breakpoint
CREATE INDEX "invitations_distributor_idx" ON "invitations" USING btree ("distributor_member_id");