import { Router, type IRouter } from "express";
import { AuditService } from "../services/audit-service";

const router: IRouter = Router();

/**
 * POST /api/audit/log - Record an audit log entry
 */
router.post("/audit/log", async (req, res) => {
  try {
    const { entityType, entityId, action, oldValue, newValue, changedBy, description } = req.body;

    if (!entityType || !entityId || !action || !changedBy) {
      return res.status(400).json({
        error: "Missing required fields: entityType, entityId, action, changedBy",
      });
    }

    const log = await AuditService.recordAuditLog({
      entityType,
      entityId,
      action,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      changedBy,
      description,
    });

    return res.json({ success: true, log });
  } catch (error) {
    return res.status(500).json({ error: `Failed to record audit log: ${error}` });
  }
});

/**
 * GET /api/audit/logs/:entityType/:entityId - Get audit logs for an entity
 */
router.get("/audit/logs/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const logs = await AuditService.getAuditLogsForEntity(entityType, entityId);

    return res.json({
      entityType,
      entityId,
      count: logs.length,
      logs,
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to get audit logs: ${error}` });
  }
});

/**
 * GET /api/audit/changes/:entityType/:entityId - Get change history with before/after
 */
router.get("/audit/changes/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const history = await AuditService.getChangeHistory(entityType, entityId);

    return res.json({
      entityType,
      entityId,
      changes: history,
      totalChanges: history.length,
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to get change history: ${error}` });
  }
});

/**
 * GET /api/audit/diff/:entityType/:entityId - Get entity diff (before/after comparison)
 */
router.get("/audit/diff/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const diff = await AuditService.getEntityDiff(entityType, entityId);

    return res.json({
      entityType,
      entityId,
      diffs: diff,
      totalChanges: diff.length,
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to get entity diff: ${error}` });
  }
});

/**
 * GET /api/audit/user/:userId - Get all audit logs for a user
 */
router.get("/audit/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 100;

    const logs = await AuditService.getAuditLogsByUser(userId, limit);

    return res.json({
      userId,
      count: logs.length,
      limit,
      logs,
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to get user audit logs: ${error}` });
  }
});

/**
 * GET /api/audit/action/:action - Get audit logs by action
 */
router.get("/audit/action/:action", async (req, res) => {
  try {
    const { action } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 100;

    const logs = await AuditService.getAuditLogsByAction(action, limit);

    return res.json({
      action,
      count: logs.length,
      limit,
      logs,
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to get audit logs by action: ${error}` });
  }
});

/**
 * GET /api/audit/range - Get audit logs within a date range
 * Query params: startDate, endDate (ISO format), limit
 */
router.get("/audit/range", async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "Missing required query parameters: startDate, endDate (ISO format)",
      });
    }

    const start = new Date(String(startDate));
    const end = new Date(String(endDate));
    const count = limit ? Number(limit) : 1000;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: "Invalid date format. Use ISO format (e.g., 2026-04-09T00:00:00Z)",
      });
    }

    const logs = await AuditService.getAuditLogsByDateRange(start, end, count);

    return res.json({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      count: logs.length,
      logs,
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to get audit logs by date range: ${error}` });
  }
});

export default router;
