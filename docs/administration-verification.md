# System administration implementation and verification

## Existing functionality retained

Accounts, Argon2 password hashing, setup-only Master creation, Staff/Cashier roles,
AccessControl grants, main-process session state, Electron IPC, Kysely/SQLite and
User Management remain the source of truth. Role assignment manages permissions;
there is no new per-user permission system. Master accounts cannot be demoted,
blocked, deleted or created outside first-launch setup.

Before this change, account creation/role assignment/login/logout already existed.
Self-service profile editing, persistent activity logs and local restore were
missing. Login throttling was memory-only; protected handlers could use a stale
session role/status. The existing cloud backup utility streamed the active database.

## Focused changes

- Every protected IPC handler refreshes the account from SQLite before its existing
  AccessControl check. Blocked, unverified, locked and deleted accounts lose access.
  Calls are serialized so restore/backup cannot race another IPC mutation.
- My profile accepts only name, username, current password and optional new password.
  It checks the current password and signs out after saving. Security fields are not
  accepted. Administrative role/status operations retain their existing permissions.
- The original lockout rule is retained: five wrong passwords within a rolling
  five-minute inactivity window cause a one-minute temporary lock. Actual account
  counters and timestamps now persist across restarts. Successful login resets them;
  an administrator password reset also clears them. Blocking is independent.
  Nonempty short incorrect passwords also count, without lowering account-creation
  password requirements. Unknown usernames receive the same invalid-credential error.
- One audit table records security/account events and important IPC business mutations.
  It stores actor snapshots, action, resource, target ID, result and UTC time, not
  passwords or raw payloads. Deleted accounts do not cascade into audit history.
  A started entry can survive interrupted operations; this is not a business ledger
  or tamper-proof log against somebody with filesystem/database access.
- User Management includes lock status, role grants, searchable/paginated logs,
  manual backup and confirmed restore. My profile uses the existing dashboard shell.

## Backup format and recovery

Keep the entire `pddms-backup-*` directory: `manifest.json`, `database.sqlite` and
`invoices/`. SQLite's backup API creates a consistent database snapshot. All referenced
supplier invoices are copied with SHA-256 checksums. Other module data resides in SQLite.
Backups contain sensitive application data and are **not encrypted**; store them securely.

Restore validates checksums, exact current schema, integrity, foreign keys, active
Master account and invoice references before modifying live data. It stages the selected
backup, makes a full safety backup, replaces records transactionally using the existing
database connection, swaps invoice directories and preserves existing audit history.
Failures roll back; success clears the session and the UI reloads. Sign in with the
credentials from the restored backup. Safety backups are in the application backup folder.

Pre-change/raw database backups are not accepted by this full-backup restore flow.
External backups are selectable; the list enumerates the default folder and the current
session's newly created backups. Restore staging and pre-restore invoice directories are
retained for recovery. There is no automated retention policy. Filesystem directory swaps
and SQLite commits cannot form a single crash-atomic transaction; abrupt power loss during
that narrow boundary may require the safety backup/manual recovery. Normal thrown-error
rollback is tested. The existing optional Google Drive helper now uploads a SQLite
snapshot, but its remote object is still database-only; cloud configuration/scheduling
and remote recovery are not verified or enabled by this feature.

## Executable verification

`npm run test:administration` uses fresh disposable SQLite files, real migrations,
repositories, Argon2 and IPC handlers. Electron dialogs/file opening are mocked.

It covers first-launch setup; duplicate/invalid accounts; role changes; profile security;
admin/Staff backend restrictions; forged cached roles; blocked/unverified accounts;
invalid username/password; lockout/expiry; logout; audit privacy/history; database and
invoice backup; corrupt backup rejection; cancel; injected restore-write failure rollback;
safety backup contents; restored records/invoice retrieval; signed-out restore state;
post-restore operations; second-process persistence; foreign keys and integrity checks.

Other regression harnesses cover inventory/procurement, sales, wholesale and reporting.
The inventory authorization fixtures now use persisted Staff/Cashier accounts rather
than spoofing the cached role. No test restores or deletes real application data.

Native desktop dialogs, manual browser navigation, visual layout and a full Electron
close/relaunch are not exercised by these harnesses. Route guards and renderer integration
are inspected/type-checked; persistence is verified by closing and reopening separate
Node processes against the same disposable database.
