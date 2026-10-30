CREATE TABLE "budget_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"planned_paise" bigint DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_categories_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "budget_categories_planned_check" CHECK ("budget_categories"."planned_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"sub_event_id" uuid,
	"title" text NOT NULL,
	"vendor_name" text,
	"amount_paise" bigint NOT NULL,
	"paid_paise" bigint DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'planned' NOT NULL,
	"due_on" date,
	"paid_on" date,
	"paid_by_member_id" uuid,
	"transaction_ref" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount_paise" > 0),
	CONSTRAINT "expenses_paid_check" CHECK ("expenses"."paid_paise" >= 0 and "expenses"."paid_paise" <= "expenses"."amount_paise"),
	CONSTRAINT "expenses_status_amounts_check" CHECK (case "expenses"."payment_status"
        when 'planned' then "expenses"."paid_paise" = 0
        when 'paid' then "expenses"."paid_paise" = "expenses"."amount_paise"
        else "expenses"."paid_paise" > 0 and "expenses"."paid_paise" < "expenses"."amount_paise" end),
	CONSTRAINT "expenses_payment_status_check" CHECK ("expenses"."payment_status" in ('planned', 'advance_paid', 'partially_paid', 'paid'))
);
--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_fk" FOREIGN KEY ("event_id","category_id") REFERENCES "public"."budget_categories"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_sub_event_fk" FOREIGN KEY ("event_id","sub_event_id") REFERENCES "public"."sub_events"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_member_fk" FOREIGN KEY ("event_id","paid_by_member_id") REFERENCES "public"."members"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_categories_event_name_unique" ON "budget_categories" USING btree ("event_id",lower("name")) WHERE "budget_categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "expenses_event_category_idx" ON "expenses" USING btree ("event_id","category_id") WHERE "expenses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "expenses_event_status_due_idx" ON "expenses" USING btree ("event_id","payment_status","due_on") WHERE "expenses"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_event_transaction_ref_unique" ON "expenses" USING btree ("event_id","transaction_ref") WHERE "expenses"."transaction_ref" is not null and "expenses"."deleted_at" is null;