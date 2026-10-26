-- citext: case-insensitive email columns. pg_trgm: fuzzy name search (docs/DatabaseDesign.md).
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
