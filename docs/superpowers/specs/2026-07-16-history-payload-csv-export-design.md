# History Payload CSV Export

## Goal

Allow users to download the submitted CSV rows stored in Deploy and Rollback history entries. The downloaded file must recreate the originating workflow's upload format rather than expose internal parsed-row fields.

## User Experience

- When a supported Deploy or Rollback payload is expanded in History, show an **Export CSV** button above the JSON payload.
- Clicking the button immediately downloads the complete stored row array for that history entry.
- Use a descriptive filename containing the workflow, action, and audit date, for example `static-ports-deploy-2026-07-15.csv`.
- Keep the existing JSON payload visible and unchanged.
- Do not show the export button for non-array payloads, empty arrays, non-Deploy/Rollback actions, or payloads whose workflow cannot be identified.

## Architecture

Implement a pure client-side export module next to the History UI. It accepts an audit entry's action, target, payload, and timestamp, identifies the workflow from the audit target prefix, reconstructs canonical CSV rows, and returns the CSV text and filename.

`HistoryClient` remains responsible only for rendering and triggering the browser download. It will use a Blob, object URL, and temporary anchor, then revoke the object URL.

No API route or database change is required because the complete audited payload is already authorized and loaded by the History page.

## Workflow Mappings

The exporter will use explicit column mappings instead of JSON object key order.

- Static Ports: `tenant,ap,epg,vlan,node1,node2,port_type,interface_or_ipg,mode,immediacy`
- Interface Selectors: `interface_profile,selector_name,port,ipg_name,ipg_type,description`
- Bridge Domains L2: `tenant,bd,vrf,bd_desc`
- Bridge Domains L3: `tenant,bd,vrf,subnet,l3out,bd_desc`
- EPG: `tenant,anp,epg,bd,bd_tenant,contract_tenant,phys_domain,cons_contract,prov_contract,epg_desc`
- EPG consumer/provider contract workflows: `tenant,anp,epg,bd,bd_tenant,contract_tenant,phys_domain,contract,epg_desc`

Internal fields such as `rowIndex`, `card`, and `port_num` are never exported. Missing optional values and `null` values become empty cells. EPG `consContracts` and `provContracts` arrays become comma-separated `cons_contract` and `prov_contract` cell values. Papa Parse performs CSV escaping and serialization.

## Error Handling

The pure exporter returns no export for unsupported or malformed payloads, so the UI does not render an unusable button. The download action is synchronous and uses only data already present in the page.

## Testing

Add focused unit tests before implementation that verify:

- Static Port headers are canonical and internal fields are excluded.
- Interface Selector parser-only fields are excluded and optional descriptions are preserved.
- EPG contract arrays are converted back into upload-format cells.
- L2, L3, and contract workflow targets select their correct mappings.
- Deploy and Rollback filenames include the workflow, action, and date.
- Unsupported actions, targets, and malformed payloads produce no export.

After implementation, run the focused tests, the full test suite, lint, and production build. Verify the History interaction in the in-app browser when a runnable local environment and representative audit data are available.
