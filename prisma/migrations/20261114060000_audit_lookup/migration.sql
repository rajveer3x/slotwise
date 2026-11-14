CREATE INDEX "AuditEvent_departmentId_createdAt_id_idx" ON "AuditEvent"("departmentId", "createdAt", "id");
CREATE INDEX "AuditEvent_departmentId_entityId_idx" ON "AuditEvent"("departmentId", "entityId");
