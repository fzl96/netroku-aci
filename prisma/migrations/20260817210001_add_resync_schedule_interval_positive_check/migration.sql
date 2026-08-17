-- Defense-in-depth: computeNextRunAt() throws on a non-positive intervalMinutes, and it is
-- evaluated while building finalizeSchedule's update literal, so a bad intervalMinutes would
-- discard lastStatus/lastDetail and self-repeat the finalize failure every stale window (120m).
-- Zod already prevents this via the API; this closes the gap for a direct DB write.
ALTER TABLE "resync_schedule" ADD CONSTRAINT "resync_schedule_intervalMinutes_positive" CHECK ("intervalMinutes" > 0);
