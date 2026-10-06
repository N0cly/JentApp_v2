CREATE TABLE "releases" (
	"version" text PRIMARY KEY NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL
);
