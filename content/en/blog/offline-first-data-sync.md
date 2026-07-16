---
title: "Building an offline-first data sync engine"
date: 2026-07-15T10:00:00+06:00
description: "How to sync local changes with a server without losing data — idempotent batches, monotonic cursors, and last-write-wins conflict resolution."
tags: ["go", "offline-first", "sync", "database", "apicorex"]
---

When your app goes offline, the user keeps working — local changes pile up in SQLite. When the network comes back, you send them to the server. Sounds simple. But what if:

- A batch fails halfway through — which changes made it up?
- The user made the same edit twice, offline — did you send it twice?
- User A changed row X offline. User B changed it online. Who wins?
- A sync completes, but a crash wipes the local device before it tells the server "I got it"?

These are the problems an **offline-first sync engine** has to solve. I built one for ApiCoreX — here's how.

## The Contract: Change Batches

Instead of syncing individual changes, the client collects changes into **batches** and sends them as one atomic unit. The server must guarantee: either the whole batch succeeds and I get back a cursor, or it fails and nothing changed.

```go
type ChangeBatch struct {
  ClientID    string    // which device sent this
  Cursor      string    // position in local history
  Changes     []Change  // INSERT, UPDATE, DELETE
  Timestamp   time.Time // when the batch was created
}

type Change struct {
  Table     string      // which table
  PK        interface{} // primary key
  Op        string      // "INSERT", "UPDATE", "DELETE"
  Data      map[string]interface{} // new values
}
```

On the server, a batch handler is **idempotent**: if the same batch arrives twice (network hiccup, retry), the second one is a no-op. How? A unique key: `(ClientID, Cursor)` must be unique in the batches table.

```sql
CREATE TABLE sync_batches (
  id SERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  applied_at TIMESTAMP,
  UNIQUE(client_id, cursor)
);
```

The first batch from client X with cursor "5" inserts a row. The second one hits the unique constraint, and we skip it.

## Monotonic Server Cursors

After processing the batch, the server sends back a **new cursor** — a position the client can use in the next sync:

```json
{
  "success": true,
  "cursor": "server:1714567890:abc123",
  "timestamp": 1714567890000
}
```

The client **must** save this cursor before discarding the local batch. If it crashes after the server accepted the batch but before the cursor is saved locally, the next sync starts from the old cursor — and might resend already-applied changes. That's OK, because the batch is idempotent.

The server cursor format is: `server:{unix_ms}:{hash}`. It monotonically increases — later syncs always have later cursors. The server uses this to avoid replaying history: *"I've already applied all changes up to cursor X for this client, so skip them."*

## Conflict Resolution: Last-Write-Wins

Two users edit the same row offline. Their changes collide on the server.

- User A (offline 10 mins) syncs at 11:00 AM, changes row X to value "hello"
- User B (offline 5 mins) syncs at 11:01 AM, changes row X to value "world"

Last-write-wins: User B's edit wins because 11:01 > 11:00.

Each change carries a `timestamp` from the client. The server keeps a `last_modified_by` and `last_modified_at` field on each row. If an incoming change's timestamp is newer, apply it. Otherwise, skip.

```sql
UPDATE user_data
SET value = $1, last_modified_at = $2, last_modified_by = $3
WHERE table_name = $4 AND pk = $5
  AND $2 > last_modified_at;  -- only if incoming timestamp is newer
```

This is simple and works for most cases. If you need **selective merge** (e.g., merge specific fields, not the whole row), store a JSON structure and merge fields individually.

## Soft Deletes & Tombstones

The user deletes row X on their offline phone. They sync. The server gets a DELETE command. But User B still has row X on their device — it syncs later, and re-inserts it. Oops.

Solution: **soft deletes**. Don't actually delete the row. Mark it as deleted and let it sit:

```sql
UPDATE user_data
SET deleted_at = NOW(), last_modified_at = NOW()
WHERE table_name = 'users' AND pk = 123;
```

When User B's device syncs, they get back the full row list **excluding deleted rows**. Their local delete picks up the `deleted_at` marker, and they remove it locally.

Periodically, run **garbage collection**: Hard-delete rows that are soft-deleted older than N days, once you're confident all clients have synced.

```sql
DELETE FROM user_data
WHERE deleted_at < NOW() - INTERVAL '7 days';
```

## The Full Sync Loop

1. **Client** collects offline changes into a batch
2. **Client** sends batch + current cursor to server
3. **Server** validates the batch (all PKs exist, no constraint violations)
4. **Server** applies changes atomically (all or nothing)
5. **Server** records the batch as processed + returns new cursor
6. **Client** receives cursor, saves it locally, clears the batch
7. **Client** fetches full state (or delta) for display

If the client crashes after step 2 but before step 6, the next sync retries from the old cursor — the server sees the same batch key, recognizes it as already-processed, and just returns the cursor again.

## Why This Works

- **Idempotent**: Retries don't cause duplicates
- **Monotonic**: Cursors prevent re-applying old changes
- **Conflict-free**: Last-write-wins is deterministic
- **Offline-safe**: No network means local changes pile up; sync when ready
- **Crash-safe**: Crashes mid-sync don't corrupt state — retry from last known cursor

This is what ApiCoreX Sync implements. It's not perfect for every use case (selective merges need more logic), but for most offline apps, it's a solid foundation.
