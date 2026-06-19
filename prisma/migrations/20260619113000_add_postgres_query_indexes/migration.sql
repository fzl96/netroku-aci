CREATE INDEX "endpoint_host_last_seen_idx" ON "endpoint" ("apicHostId", "lastSeenAt");
CREATE INDEX "endpoint_host_active_idx" ON "endpoint" ("apicHostId", "isActive");
CREATE INDEX "endpoint_host_vlan_idx" ON "endpoint" ("apicHostId", "vlan");
CREATE INDEX "endpoint_host_node_idx" ON "endpoint" ("apicHostId", "node");
CREATE INDEX "endpoint_host_interface_idx" ON "endpoint" ("apicHostId", "interface");

CREATE INDEX "interface_snapshot_host_node_if_idx" ON "interface_snapshot" ("apicHostId", "node", "ifName");

CREATE INDEX "fault_snapshot_host_lifecycle_severity_idx" ON "fault_snapshot" ("apicHostId", "lifecycle", "severity");
CREATE INDEX "fault_snapshot_host_lifecycle_node_idx" ON "fault_snapshot" ("apicHostId", "lifecycle", "node");

CREATE INDEX "health_score_snapshot_host_present_scope_score_idx" ON "health_score_snapshot" ("apicHostId", "present", "scope", "score");

CREATE INDEX "node_snapshot_host_present_role_idx" ON "node_snapshot" ("apicHostId", "present", "role");
CREATE INDEX "node_snapshot_host_present_fabric_idx" ON "node_snapshot" ("apicHostId", "present", "fabricSt");

CREATE INDEX "hardware_component_host_present_type_idx" ON "hardware_component" ("apicHostId", "present", "type");
CREATE INDEX "hardware_component_host_present_healthy_idx" ON "hardware_component" ("apicHostId", "present", "healthy");
CREATE INDEX "hardware_component_host_present_node_type_healthy_idx" ON "hardware_component" ("apicHostId", "present", "nodeId", "type", "healthy");
