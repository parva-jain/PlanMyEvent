CREATE TABLE "member_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"email" "citext",
	"grants" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_invites_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "member_invites_max_uses_check" CHECK ("member_invites"."max_uses" > 0),
	CONSTRAINT "member_invites_used_count_check" CHECK ("member_invites"."used_count" <= "member_invites"."max_uses")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"phone" text,
	"invited_by_user_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_event_user_unique" UNIQUE("event_id","user_id"),
	CONSTRAINT "members_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "members_status_check" CHECK ("members"."status" in ('active', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "role_assignment_scopes" (
	"role_assignment_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"sub_event_id" uuid NOT NULL,
	CONSTRAINT "role_assignment_scopes_role_assignment_id_sub_event_id_pk" PRIMARY KEY("role_assignment_id","sub_event_id")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_assignments_member_role_unique" UNIQUE("member_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_standard" boolean DEFAULT false NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_event_id_id_unique" UNIQUE("event_id","id")
);
--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment_scopes" ADD CONSTRAINT "role_assignment_scopes_role_assignment_id_role_assignments_id_fk" FOREIGN KEY ("role_assignment_id") REFERENCES "public"."role_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment_scopes" ADD CONSTRAINT "role_assignment_scopes_sub_event_fk" FOREIGN KEY ("event_id","sub_event_id") REFERENCES "public"."sub_events"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_member_fk" FOREIGN KEY ("event_id","member_id") REFERENCES "public"."members"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_fk" FOREIGN KEY ("event_id","role_id") REFERENCES "public"."roles"("event_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_invites_event_id_idx" ON "member_invites" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "members_user_id_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_assignment_scopes_sub_event_id_idx" ON "role_assignment_scopes" USING btree ("sub_event_id");--> statement-breakpoint
CREATE INDEX "role_assignments_event_member_idx" ON "role_assignments" USING btree ("event_id","member_id");--> statement-breakpoint
CREATE INDEX "role_assignments_role_id_idx" ON "role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_event_name_unique" ON "roles" USING btree ("event_id",lower("name")) WHERE "roles"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_event_owner_unique" ON "roles" USING btree ("event_id") WHERE "roles"."is_owner";--> statement-breakpoint
-- Backfill: events created before members existed get the standard roles (as of this
-- migration; later preset edits never touch existing events) and their owner as the first
-- member holding Owner. IDs are UUIDv7 like the app's (Postgres 17 has no uuidv7()).
CREATE FUNCTION pg_temp.uuidv7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid()) PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3) FROM 1 FOR 6), 52, 1), 53, 1), 'hex')::uuid
$$;
--> statement-breakpoint
INSERT INTO roles (id, event_id, name, is_standard, is_owner, permissions)
SELECT pg_temp.uuidv7(), e.id, preset.name, true, preset.is_owner, preset.permissions
FROM events e
CROSS JOIN (VALUES
  ('Owner', true, 0, ARRAY['event.view', 'event.settings', 'event.delete', 'members.view', 'members.manage', 'roles.manage', 'subevents.view', 'subevents.edit', 'tasks.view', 'tasks.edit', 'tasks.assign', 'tasks.update_own', 'budget.view', 'budget.edit', 'guests.view', 'guests.edit', 'guests.invite', 'registrations.view', 'registrations.manage', 'checkin.perform', 'website.edit', 'gallery.upload', 'gallery.manage', 'activity.view']::text[]),
  ('Admin', false, 1, ARRAY['event.view', 'event.settings', 'members.view', 'members.manage', 'roles.manage', 'subevents.view', 'subevents.edit', 'tasks.view', 'tasks.edit', 'tasks.assign', 'tasks.update_own', 'budget.view', 'budget.edit', 'guests.view', 'guests.edit', 'guests.invite', 'registrations.view', 'registrations.manage', 'checkin.perform', 'website.edit', 'gallery.upload', 'gallery.manage', 'activity.view']::text[]),
  ('Editor', false, 2, ARRAY['event.view', 'members.view', 'subevents.view', 'subevents.edit', 'tasks.view', 'tasks.edit', 'tasks.assign', 'budget.view', 'budget.edit', 'guests.view', 'guests.edit', 'guests.invite', 'registrations.view', 'registrations.manage', 'checkin.perform', 'gallery.upload', 'activity.view']::text[]),
  ('Helper', false, 3, ARRAY['event.view', 'members.view', 'subevents.view', 'tasks.view', 'tasks.update_own', 'checkin.perform', 'gallery.upload']::text[]),
  ('Viewer', false, 4, ARRAY['event.view', 'members.view', 'subevents.view', 'tasks.view', 'budget.view', 'guests.view', 'registrations.view', 'activity.view']::text[])
) AS preset(name, is_owner, position, permissions)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.event_id = e.id)
ORDER BY e.id, preset.position;
--> statement-breakpoint
INSERT INTO members (id, event_id, user_id, joined_at)
SELECT pg_temp.uuidv7(), e.id, e.owner_user_id, e.created_at
FROM events e
WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.event_id = e.id);
--> statement-breakpoint
INSERT INTO role_assignments (id, event_id, member_id, role_id, granted_by_user_id)
SELECT pg_temp.uuidv7(), m.event_id, m.id, r.id, m.user_id
FROM members m
JOIN events e ON e.id = m.event_id AND e.owner_user_id = m.user_id
JOIN roles r ON r.event_id = m.event_id AND r.is_owner
WHERE NOT EXISTS (SELECT 1 FROM role_assignments ra WHERE ra.member_id = m.id);
