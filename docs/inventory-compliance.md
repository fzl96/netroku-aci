# Inventory configuration compliance

Open **Inventory → Devices → Check compliance status** to view the inventory-wide report at `/inventory/compliance`. Signed-in members and admins can read results. Admins can open **Edit parameters** (`/inventory/compliance/parameters`) to enable NTP and TACACS independently and define their required IPv4 sets. Both checks start disabled; an enabled check needs at least one address.

The backend compares sets exactly. Missing or unexpected IPs fail compliance; duplicates, ordering, VRFs, source interfaces, keys, and preference flags do not affect the comparison. TACACS includes every configured group and standalone server declaration. A readable config without servers fails an enabled check. Unsupported addresses (hostnames/IPv6), unresolved named TACACS servers, unsupported platforms, empty text, and recognizable collection errors produce Unknown with a reason. ACI-linked inventory shows Not evaluated in this initial release.

Each standalone device has one row; each nonempty stack has one shared row listing its physical members. Manually created assets are included. Expand NTP or TACACS to see expected, detected, missing, and unexpected IPs. Search includes stack member names. Results are paginated, and only the visible configs are fetched for parsing. Results use the current policies on each request and are not persisted or cached between checks. Config collection time is displayed in UTC; age does not invalidate a saved result.

## Saved configuration contract

Apply the migration before running the updated app:

```sh
bun run prisma:deploy
bun run prisma:generate
```

The Prisma model `InventoryConfig` maps to `inventory_config`:

| Field           | Contract                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| `id`            | Prisma-generated ID                                                            |
| `deviceId`      | Inventory `Device.id` for a standalone device; otherwise null                  |
| `deviceStackId` | Inventory `DeviceStack.id` for a shared stack config; otherwise null           |
| `rawConfig`     | Complete running-config output as text                                         |
| `platform`      | Explicit `iosxe` or `nxos`; do not infer from free-form discovery device types |
| `collectedAt`   | When the device's configuration was collected                                  |
| `updatedAt`     | Database write time, maintained by Prisma                                      |

The database enforces exactly one existing owner and at most one config per owner. A newer collection replaces the same row; a trigger rejects updates with an older `collectedAt`. Upsert by `deviceId` or `deviceStackId`, and handle delayed collections without retrying them indefinitely. Keep stack configs on the stack rather than copying onto members. Configuration writes are independent of discovery metadata reconciliation and do not require an `InventorySource` link. Deleting an inventory owner deletes its saved config; unlinking discovery leaves it intact.

Raw configs can contain secrets. The report returns addresses and metadata only; raw text is not sent to the browser, added to inventory list/detail payloads, or included in policy audits. Database access and backups must account for the full raw contents.

The companion `~/Code/netroku-cli/legacy_sync.py` now collects `show running-config` automatically during every `monitor` and `all` run and publishes it separately to `POST /api/ingest/legacy/config` using the existing ingestion token. `all` includes config collection for endpoint-only inventory entries; `endpoint` mode is unchanged. Configs have their own UTC collection timestamp and explicit platform. Collection/publish failures do not suppress other features. An upload UI is not included. Until a successful config push, enabled checks show **Unknown — No saved configuration**.

Before pushing a config, use **Inventory → Discovered devices** to link the legacy discovery to its inventory device or whole stack. Matching uses that explicit link, not a guessed hostname or management IP. Missing/conflicting links, physical-member links for stacked devices, mismatched known physical serials, and conflicting same-time snapshots return 409 with a safe, actionable reason. Unlinked pushes do not consume their receipt, so the same capture can be retried after linking. Unlinking leaves already saved configs intact.

The config endpoint uses the same strict version-1 envelope (`schema_version`, `run_id`, `collected_at`, `complete`, `device`) as the existing legacy endpoints, with `configuration: { platform: "iosxe" | "nxos", raw_config: "..." }`. Raw text is limited to 2,000,000 characters. Empty, unrecognizable, or visibly failed/paginated output is rejected before saving. New receipts return 201; identical replays return 200; reuse of a run/device/config key with changed content returns 409. Older collections return zero inserted/updated counts and keep the newer snapshot. Same-time matching snapshots are accepted without changing storage; differing text/platform at the same time returns 409. Only complete captures should be saved: the parser recognizes some capture errors, but cannot prove that otherwise valid-looking text is complete.

Policies are stored independently in `compliance_policy`, with `service` (`ntp`/`tacacs`), `enabled`, `expectedIps`, and `updatedAt`. Both services use the same expected list across IOS-XE and NX-OS. Admin edits are validated on the server, applied atomically, and recorded in audit history.

## Supported syntax

NTP supports IOS-XE `ntp server [vrf NAME] IP` and NX-OS `ntp server IP ... use-vrf NAME`. TACACS supports IOS-XE group `server-private IP`, NX-OS group `server IP`, global `tacacs-server host IP`, and IOS-XE named `tacacs server NAME` blocks with `address ipv4 IP` and group name references. RADIUS groups and unrelated address statements are excluded.

Syntax references: [Cisco IOS-XE TACACS configuration](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_usr_tacacs/configuration/xe-16-11/sec-usr-tacacs-xe-16-11-book/sec-cfg-tacacs.html), [Cisco NX-OS TACACS configuration](https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/106x/configuration/security/cisco-nexus-9000-series-nx-os-security-configuration-guide-release-106x/m-configuring-tacacs.pdf), and [Cisco NX-OS NTP configuration](https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/102x/configuration/system-management/cisco-nexus-9000-series-nx-os-system-management-configuration-guide-102x/m-configuring-ntp-10x.html).
