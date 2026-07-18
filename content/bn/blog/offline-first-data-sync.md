---
title: "Offline-first data sync engine তৈরি"
date: 2026-07-15T10:00:00+06:00
description: "Local change server-এর সাথে sync করা — idempotent batch, monotonic cursor, last-write-wins conflict resolution।"
tags: ["go", "offline-first", "sync", "database", "apicorex"]
---

App অফলাইন হয়ে গেলেও ব্যবহারকারী কাজ থামান না — SQLite-এ local change জমতে থাকে চুপচাপ। Network ফিরলে সেগুলো server-এ push করতে হয়। শুনতে সহজ। আসল ঝামেলা শুরু হয় এখান থেকে:

- একটা batch মাঝপথে fail করলে কতটুকু change আটকে গেল, বোঝার উপায় কী?
- একই edit অফলাইনে দুইবার হয়ে গেছে — দুইবারই push হলে কী ঘটবে?
- User A row X এডিট করলেন অফলাইনে থেকে। User B করলেন অনলাইনে। শেষমেশ কোনটা টিকবে?
- Sync শেষ হওয়ার ঠিক পরে device crash করলে, server আদৌ টের পাবে কি?

এটাই আসলে **offline-first sync engine**-এর আসল মাথাব্যথা। ApiCoreX-এর জন্য এরকম একটা engine বানানো হয়েছে, নিচে দেখাচ্ছি কীভাবে।

## Contract: Change Batch

প্রতিটা change আলাদা করে sync হয় না এখানে। বরং client সব change জমা করে একটা **batch**-এ, তারপর সেটা পাঠায় একটা atomic unit হিসেবে। Server-এর guarantee পরিষ্কার — পুরো batch succeed করবে আর cursor দেবে, নাহলে পুরোটাই fail, মাঝামাঝি কোনো অবস্থা নেই।

```go
type ChangeBatch struct {
  ClientID    string    // কোন device থেকে এসেছে
  Cursor      string    // local history position
  Changes     []Change  // INSERT, UPDATE, DELETE
  Timestamp   time.Time // batch তৈরির সময়
}

type Change struct {
  Table     string      // কোন table
  PK        interface{} // primary key
  Op        string      // "INSERT", "UPDATE", "DELETE"
  Data      map[string]interface{} // new values
}
```

Server-এর batch handler **idempotent** — একই batch দুইবার এসে গেলে (network সমস্যায় এমন হয়ই), দ্বিতীয়বার সেটা no-op হয়ে যায়। কীভাবে? সহজ — `(ClientID, Cursor)` জোড়াটাকে unique রাখা হয়েছে।

```sql
CREATE TABLE sync_batches (
  id SERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  applied_at TIMESTAMP,
  UNIQUE(client_id, cursor)
);
```

Client X-এর প্রথম batch, cursor "5" — row insert হয়ে যায় ঠিকঠাক। দ্বিতীয়বার একই জিনিস পাঠালে unique constraint-এ আটকে যায়, skip।

## Monotonic Server Cursor

Batch process হয়ে গেলে server একটা **নতুন cursor** ফেরত পাঠায়:

```json
{
  "success": true,
  "cursor": "server:1714567890:abc123",
  "timestamp": 1714567890000
}
```

Client-কে এই cursor save করতে হবে, তারপর batch discard। Server accept করে ফেলার পর কিন্তু cursor save হওয়ার আগেই crash হলে কী হবে? পরের sync পুরোনো cursor থেকেই শুরু হবে, already-applied change আবার পাঠাবে বটে — কিন্তু সমস্যা নেই, batch তো idempotent, তাই দ্বিতীয়বার কিছুই বদলায় না।

Server cursor-এর ফরম্যাট: `server:{unix_ms}:{hash}`। এটা monotonically বাড়তেই থাকে — মানে পরের sync-এর cursor সবসময় আগেরটার চেয়ে বড়। Server এই জিনিসটা দিয়েই replay আটকায়: *cursor X পর্যন্ত এই client-এর জন্য already apply হয়ে গেছে, বাকিটা skip*।

## Conflict Resolution: Last-Write-Wins

দুইজন ব্যবহারকারী একই row অফলাইনে এডিট করলেন। Server-এ গিয়ে দুটো collide করবে, স্বাভাবিক।

- User A (১০ মিনিট অফলাইন) sync করলেন সকাল ১১:০০টায়, row X = "hello"
- User B (৫ মিনিট অফলাইন) sync করলেন সকাল ১১:০১টায়, row X = "world"

Last-write-wins নিয়মে User B জিতবেন — কারণ ১১:০১ > ১১:০০, এটুকুই যুক্তি।

প্রতিটা change client থেকেই একটা `timestamp` বয়ে আনে। Server-এর দিকে থাকে `last_modified_by` আর `last_modified_at`। আসা change-এর timestamp যদি নতুন হয় তাহলে apply, নাহলে চুপচাপ skip।

```sql
UPDATE user_data
SET value = $1, last_modified_at = $2, last_modified_by = $3
WHERE table_name = $4 AND pk = $5
  AND $2 > last_modified_at;  -- নতুন timestamp হলে
```

বেশিরভাগ ক্ষেত্রে এটুকুই যথেষ্ট, simple আর কাজও করে। **Selective merge** লাগলে (field-by-field), JSON রেখে merge করার পথও খোলা আছে।

## Soft Delete ও Tombstone

কোনো ব্যবহারকারী অফলাইনে row X delete করলেন। Sync হলো। Server DELETE command পেল। কিন্তু আরেকজন ব্যবহারকারীর device-এ তখনও row X রয়ে গেছে — পরের sync-এ সেটা আবার insert হয়ে যাবে। Oops।

সমাধান হলো **soft delete**। Row সত্যিকারের delete না করে, শুধু deleted হিসেবে mark করে রাখা:

```sql
UPDATE user_data
SET deleted_at = NOW(), last_modified_at = NOW()
WHERE table_name = 'users' AND pk = 123;
```

অন্য device sync করলে পুরো row list ফেরত পায় **deleted row বাদ দিয়ে**। Local দিকে delete-এর কাজটা `deleted_at` marker দেখেই হয়ে যায়, remove।

Periodic **garbage collection** — সব client sync সম্পন্ন হয়েছে নিশ্চিত হলে N দিনের পুরোনো soft-delete row একেবারে hard-delete করে দেওয়া যায়। এভাবেই টেবিল আর ফুলতে থাকে না।

```sql
DELETE FROM user_data
WHERE deleted_at < NOW() - INTERVAL '7 days';
```

## পুরো Sync Loop

1. **Client** অফলাইন change collect করে batch-এ রাখে
2. **Client** batch আর current cursor পাঠায় server-এ
3. **Server** batch validate করে — PK আছে কিনা, constraint error আছে কিনা
4. **Server** পুরো batch atomic ভাবে apply করে, all or nothing
5. **Server** batch processed হিসেবে record করে, cursor ফেরত দেয়
6. **Client** cursor receive করে locally save করে, batch clear
7. **Client** display-এর জন্য full state (বা delta) fetch করে নেয়

Step 2-এর পর কিন্তু step 6-এর আগে client crash করলে পরের sync পুরোনো cursor থেকেই আবার চেষ্টা করবে। সমস্যা নেই — server একই batch key দেখেই বুঝে যাবে এটা already-processed, শুধু cursor ফেরত দেবে।

## কেন এই পদ্ধতি কাজ করে

- **Idempotent** — retry করলেও duplicate হয় না
- **Monotonic** — cursor দিয়ে re-apply আটকানো যায়
- **Conflict-free** — last-write-wins deterministic, তর্কের সুযোগ নেই
- **Offline-safe** — network না থাকলেও local change জমা থাকে, sync-এর জন্য তৈরি হয়েই থাকে
- **Crash-safe** — mid-sync crash-এ state নষ্ট হয় না, retry করলেই চলে

ApiCoreX Sync ঠিক এভাবেই implement করা। সব জায়গায় perfect বলবো না — selective merge-এর জটিল লজিকটা এখনো বাকি — তবে বেশিরভাগ offline app-এর জন্য এটা একটা ভালো, ভরসাযোগ্য base।
