# D1 migration operations

SharvaOS Pulse request handlers must never create or alter database schema. Schema changes are an explicit deployment operation.

## Current migration

`drizzle/0000_spooky_pet_avengers.sql`

## Local application

```bash
export SHARVAOS_D1_DATABASE="<local database name or id>"
npm run db:migrate:local
```

## Remote application

```bash
export SHARVAOS_D1_DATABASE="<production database name or id>"
npm run db:migrate:remote
```

Apply the migration before deploying code that reads or writes D1. Do not run the remote command from an unreviewed branch. Record the database target, operator, timestamp, migration SHA-256, and command result in the release evidence.

The current migration creates tables and indexes and is intended for a fresh database. Future schema changes must use a new numbered migration rather than editing an already-applied migration.
