---
title: "Offline-first data sync engine banano"
date: 2026-07-15T10:00:00+06:00
description: "Local change gulake server er sathe sync kora — idempotent batch, monotonic cursor, last-write-wins conflict resolution."
tags: ["go", "offline-first", "sync", "database", "apicorex"]
---

Jkhon app offline hoy, user still kaje lage — SQLite te local change pile up hoy. Network ashe gele, server-e push koro. Sound e simple. Kintu kya hobe:

- Ekta batch fail hoyle middle-e — kotai change up gese?
- User ekoi edit dui bar korse offline — two bar push korle?
- User A row X edit korlo offline. User B korlo online. Ki win hobe?
- Sync complete hoyle, crash hoy device-e — server ko janbe?

Etai **offline-first sync engine** er problem. ApiCoreX-er jonno ekta build korsi — ekhane how.

## Contract: Change Batch

Individual change sync kore na. Instead, client change gulake **batch**-e collect kore, ekta atomic unit hisabe send kore. Server guarantee dey: whole batch either succeed hobe, cursor pabe, nay fail hobe, kichui change na.

```go
type ChangeBatch struct {
  ClientID    string    // je device theke aslo
  Cursor      string    // local history position
  Changes     []Change  // INSERT, UPDATE, DELETE
  Timestamp   time.Time // batch banano kobe
}

type Change struct {
  Table     string      // kon table
  PK        interface{} // primary key
  Op        string      // "INSERT", "UPDATE", "DELETE"
  Data      map[string]interface{} // new values
}
```

Server-e, batch handler **idempotent**: same batch dui bar ashe (network issue), second-ta no-op. How? Unique key: `(ClientID, Cursor)` unique hote hobe.

```sql
CREATE TABLE sync_batches (
  id SERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  applied_at TIMESTAMP,
  UNIQUE(client_id, cursor)
);
```

First batch from client X, cursor "5" — row insert hoy. Dusro bar unique constraint, skip.

## Monotonic Server Cursor

Batch process hoyle, server niye **new cursor** bheje dey:

```json
{
  "success": true,
  "cursor": "server:1714567890:abc123",
  "timestamp": 1714567890000
}
```

Client **must** cursor save kore, batch discard kore. Crash hoy server-e accept hoyle but cursor save na hoyle — next sync purano cursor theke start kore, already-applied change re-send kore. Thik ache, batch idempotent thakle.

Server cursor: `server:{unix_ms}:{hash}`. Monotonically increase kore — later sync er later cursor. Server use kore avoid replay: *"Ami already apply korsi up to cursor X etai client-e, skip koro."*

## Conflict Resolution: Last-Write-Wins

Duj user ekoi row edit kore offline. Server-e collide.

- User A (offline 10 min) sync kore 11:00 AM, row X = "hello"
- User B (offline 5 min) sync kore 11:01 AM, row X = "world"

Last-write-wins: User B win, 11:01 > 11:00.

Protita change carry kore `timestamp` client-theke. Server rakhe `last_modified_by` ar `last_modified_at`. Incoming change timestamp newer hole apply koro. Nay, skip.

```sql
UPDATE user_data
SET value = $1, last_modified_at = $2, last_modified_by = $3
WHERE table_name = $4 AND pk = $5
  AND $2 > last_modified_at;  -- new timestamp holle
```

Simple ar works most case. **Selective merge** laglo (field-by-field), JSON rakho merge koro.

## Soft Delete & Tombstone

User delete kore row X offline-e. Sync kore. Server pe DELETE command. Kintu User B er device-e row X thake — later sync, re-insert. Oops.

Solution: **soft delete**. Actually delete na. Mark as deleted, sit koriye rakho:

```sql
UPDATE user_data
SET deleted_at = NOW(), last_modified_at = NOW()
WHERE table_name = 'users' AND pk = 123;
```

User B-er device sync korle, full row list back pay **minus deleted row**. Local delete pick up kore `deleted_at` marker, remove kore.

Periodic **garbage collection**: Hard-delete soft-delete rows (N days er purano), sure thakle sab client sync korlo.

```sql
DELETE FROM user_data
WHERE deleted_at < NOW() - INTERVAL '7 days';
```

## Full Sync Loop

1. **Client** collect kore offline change, batch-e
2. **Client** bheje batch + current cursor server-e
3. **Server** validate kore batch (PK exist, no constraint error)
4. **Server** apply kore atomic (all or nothing)
5. **Server** record kore batch as processed, return cursor
6. **Client** receive cursor, save locally, clear batch
7. **Client** fetch kore full state (ya delta) display-er jonno

Client crash hoy step 2-r por but step 6-er age, next sync retry kore purano cursor-theke — server same batch key dekhe, already-processed recognize kore, cursor return kore bas.

## Why Etai Kaje Lage

- **Idempotent**: Retry na dile duplicate
- **Monotonic**: Cursor prevent kore re-apply
- **Conflict-free**: Last-write-wins deterministic
- **Offline-safe**: No network means local change; sync ready-te
- **Crash-safe**: Mid-sync crash-e state corrupt na — retry

Etai ApiCoreX Sync implement kore. Perfect na sab case-e (selective merge zaata logic), kintu most offline app-er jonno solid base.
