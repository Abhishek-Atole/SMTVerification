// artifacts/api-server/src/routes/bom-comprehensive.ts
// Comprehensive BOM management endpoints with revisions, trash, and full 12-field support

import express, { Router } from "express";
import { db } from "@workspace/db";
import { bomsTable, bomItemsTable } from "@workspace/db/schema";
import { eq, and, not, isNull, count, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

// ============================================================================
// 1. BOM ENDPOINTS
// ============================================================================

// GET /api/boms/:id - Fetch BOM with revision info
router.get("/boms/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const bomId = Number(id);

    // Fetch BOM with all fields including revision tracking
    const bom = await db
      .select()
      .from(bomsTable)
      .where(eq(bomsTable.id, bomId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!bom) {
      return res.status(404).json({ error: "BOM not found" });
    }

    // Get item count
    const itemCountResult = await db
      .select({ count: count() })
      .from(bomItemsTable)
      .where(and(eq(bomItemsTable.bomId, bomId), not(eq(bomItemsTable.isDeleted, true))))
      .then((rows) => rows[0]?.count || 0);

    // Get makes count
    const makesResult = await db
      .select({
        makes: sql<string>`COUNT(DISTINCT make_1) FILTER (WHERE make_1 IS NOT NULL)
                           + COUNT(DISTINCT make_2) FILTER (WHERE make_2 IS NOT NULL)
                           + COUNT(DISTINCT make_3) FILTER (WHERE make_3 IS NOT NULL)`,
      })
      .from(bomItemsTable)
      .where(and(eq(bomItemsTable.bomId, bomId), not(eq(bomItemsTable.isDeleted, true))))
      .then((rows) => Number(rows[0]?.makes || 0));

    res.json({
      ...bom,
      itemCount: itemCountResult,
      makesCount: makesResult,
    });
  } catch (error) {
    console.error("Error fetching BOM:", error);
    res.status(500).json({ error: "Failed to fetch BOM" });
  }
});

// GET /api/boms/:id/revisions - List all revisions in lineage
router.get("/boms/:id/revisions", async (req, res) => {
  try {
    const { id } = req.params;
    const bomId = Number(id);

    // Get the current BOM first
    const currentBom = await db
      .select()
      .from(bomsTable)
      .where(eq(bomsTable.id, bomId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!currentBom) {
      return res.status(404).json({ error: "BOM not found" });
    }

    // Build the chain of revisions (parents and children)
    const chain: any[] = [];
    let current = currentBom;

    // Go up to find root
    while (current.parentBomId) {
      const parent = await db
        .select()
        .from(bomsTable)
        .where(eq(bomsTable.id, current.parentBomId))
        .limit(1)
        .then((rows) => rows[0]);
      if (!parent) break;
      current = parent;
    }

    // Now traverse down collecting all revisions
    const collectRevisions = async (bom: any) => {
      chain.push(bom);
      const children = await db
        .select()
        .from(bomsTable)
        .where(eq(bomsTable.parentBomId, bom.id));
      for (const child of children) {
        await collectRevisions(child);
      }
    };

    await collectRevisions(current);

    res.json(chain);
  } catch (error) {
    console.error("Error fetching revisions:", error);
    res.status(500).json({ error: "Failed to fetch revisions" });
  }
});

// POST /api/boms/:id/revisions - Create new revision
router.post("/boms/:id/revisions", async (req, res) => {
  try {
    const { id } = req.params;
    const bomId = Number(id);
    const { revisionLabel, revisionNotes } = req.body;

    if (!revisionLabel) {
      return res.status(400).json({ error: "Revision label is required" });
    }

    // Validate label uniqueness within lineage
    const currentBom = await db
      .select()
      .from(bomsTable)
      .where(eq(bomsTable.id, bomId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!currentBom) {
      return res.status(404).json({ error: "BOM not found" });
    }

    // Check for duplicate label in full lineage (root + all descendants)
    let root = currentBom;
    while (root.parentBomId) {
      const parent = await db
        .select()
        .from(bomsTable)
        .where(eq(bomsTable.id, root.parentBomId))
        .limit(1)
        .then((rows) => rows[0]);
      if (!parent) break;
      root = parent;
    }

    const lineage: typeof currentBom[] = [];
    const collectLineage = async (bom: typeof currentBom) => {
      lineage.push(bom);
      const children = await db
        .select()
        .from(bomsTable)
        .where(eq(bomsTable.parentBomId, bom.id));

      for (const child of children) {
        await collectLineage(child as typeof currentBom);
      }
    };

    await collectLineage(root);

    const normalizedLabel = String(revisionLabel).trim().toLowerCase();
    const hasDuplicate = lineage.some(
      (bom) => String(bom.revisionLabel ?? "").trim().toLowerCase() === normalizedLabel,
    );

    if (hasDuplicate) {
      return res.status(400).json({ error: "Revision label already exists in this BOM's lineage" });
    }

    // Create new BOM as child revision
    const newBom = await db
      .insert(bomsTable)
      .values({
        name: currentBom.name,
        description: currentBom.description,
        revisionLabel,
        revisionNotes,
        parentBomId: bomId,
        isLatest: true,
        createdBy: req.user?.id || "system",
      })
      .returning();

    // Mark current BOM as not latest
    await db
      .update(bomsTable)
      .set({ isLatest: false })
      .where(eq(bomsTable.id, bomId));

    // Copy all active items to new BOM
    const items = await db
      .select()
      .from(bomItemsTable)
      .where(and(eq(bomItemsTable.bomId, bomId), not(eq(bomItemsTable.isDeleted, true))));

    if (items.length > 0) {
      const itemsToInsert = items.map((item) => {
        const { id: _oldId, ...rest } = item;
        return {
        ...rest,
        bomId: newBom[0].id,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        };
      });
      await db.insert(bomItemsTable).values(itemsToInsert as any);
    }

    res.json(newBom[0]);
  } catch (error) {
    console.error("Error creating revision:", error);
    res.status(500).json({ error: "Failed to create revision" });
  }
});

// ============================================================================
// 2. BOM ITEMS ENDPOINTS (12-field support)
// ============================================================================

// GET /api/bom-items?bom_id=:id - Fetch active items
router.get("/bom-items", async (req, res) => {
  try {
    const bomId = Number(req.query.bom_id);
    if (!bomId) {
      return res.status(400).json({ error: "bom_id query parameter required" });
    }

    const items = await db
      .select()
      .from(bomItemsTable)
      .where(and(eq(bomItemsTable.bomId, bomId), not(eq(bomItemsTable.isDeleted, true))))
      .orderBy(bomItemsTable.srNo);

    res.json(items);
  } catch (error) {
    console.error("Error fetching items:", error);
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

// GET /api/bom-items/trash?bom_id=:id - Fetch deleted items
router.get("/bom-items/trash", async (req, res) => {
  try {
    const bomId = Number(req.query.bom_id);
    if (!bomId) {
      return res.status(400).json({ error: "bom_id query parameter required" });
    }

    const items = await db
      .select()
      .from(bomItemsTable)
      .where(and(eq(bomItemsTable.bomId, bomId), eq(bomItemsTable.isDeleted, true)))
      .orderBy(bomItemsTable.deletedAt);

    res.json(items);
  } catch (error) {
    console.error("Error fetching trash:", error);
    res.status(500).json({ error: "Failed to fetch trash" });
  }
});

// POST /api/bom-items - Create new item (all 12 fields)
router.post("/bom-items", async (req, res) => {
  try {
    const {
      bomId,
      srNo,
      feederNumber,
      ucalIntPn,
      quantity,
      reference,
      description,
      package: pkg,
      make1, mpn1,
      make2, mpn2,
      make3, mpn3,
      remarks,
      action,
    } = req.body;

    if (!bomId || !feederNumber || !quantity) {
      return res.status(400).json({ error: "Missing required fields: bomId, feederNumber, quantity" });
    }

    // Auto-generate srNo if not provided
    let finalSrNo = srNo;
    if (!finalSrNo) {
      const lastItem = await db
        .select()
        .from(bomItemsTable)
        .where(eq(bomItemsTable.bomId, bomId))
        .orderBy(sql`CAST(${bomItemsTable.srNo} AS INTEGER) DESC`)
        .limit(1)
        .then((rows) => rows[0]);
      
      const lastNum = lastItem?.srNo ? parseInt(lastItem.srNo) : 0;
      finalSrNo = String(lastNum + 1);
    }

    const newItem = await db
      .insert(bomItemsTable)
      .values({
        bomId,
        srNo: finalSrNo,
        feederNumber,
        ucalIntPn,
        quantity,
        reference,
        description,
        package: pkg,
        make_1: make1,
        mpn_1: mpn1,
        make_2: make2,
        mpn_2: mpn2,
        make_3: make3,
        mpn_3: mpn3,
        remarks,
        action,
        // Defaults
        partNumber: feederNumber, // Legacy field
      })
      .returning();

    res.status(201).json(newItem[0]);
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({ error: "Failed to create item" });
  }
});

// PATCH /api/bom-items/:id - Update existing item (inline edit)
router.patch("/bom-items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const itemId = Number(id);

    const {
      srNo,
      feederNumber,
      ucalIntPn,
      quantity,
      reference,
      description,
      package: pkg,
      make1, mpn1,
      make2, mpn2,
      make3, mpn3,
      remarks,
      action,
    } = req.body;

    const updateData: any = {};
    if (srNo !== undefined) updateData.srNo = srNo;
    if (feederNumber !== undefined) updateData.feederNumber = feederNumber;
    if (ucalIntPn !== undefined) updateData.ucalIntPn = ucalIntPn;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (reference !== undefined) updateData.reference = reference;
    if (description !== undefined) updateData.description = description;
    if (pkg !== undefined) updateData.package = pkg;
    if (make1 !== undefined) updateData.make_1 = make1;
    if (mpn1 !== undefined) updateData.mpn_1 = mpn1;
    if (make2 !== undefined) updateData.make_2 = make2;
    if (mpn2 !== undefined) updateData.mpn_2 = mpn2;
    if (make3 !== undefined) updateData.make_3 = make3;
    if (mpn3 !== undefined) updateData.mpn_3 = mpn3;
    if (remarks !== undefined) updateData.remarks = remarks;
    if (action !== undefined) updateData.action = action;

    const updated = await db
      .update(bomItemsTable)
      .set(updateData)
      .where(eq(bomItemsTable.id, itemId))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(updated[0]);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// DELETE /api/bom-items/:id - Soft delete (move to trash)
router.delete("/bom-items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const itemId = Number(id);

    const updated = await db
      .update(bomItemsTable)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user?.id || "system",
      })
      .where(eq(bomItemsTable.id, itemId))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ success: true, deleted: updated[0] });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

// PATCH /api/bom-items/:id/restore - Restore from trash
router.patch("/bom-items/:id/restore", async (req, res) => {
  try {
    const { id } = req.params;
    const itemId = Number(id);

    const updated = await db
      .update(bomItemsTable)
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      })
      .where(eq(bomItemsTable.id, itemId))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(updated[0]);
  } catch (error) {
    console.error("Error restoring item:", error);
    res.status(500).json({ error: "Failed to restore item" });
  }
});

// DELETE /api/bom-items/:id/permanent - Hard delete (irreversible)
router.delete("/bom-items/:id/permanent", async (req, res) => {
  try {
    const { id } = req.params;
    const itemId = Number(id);

    const deleted = await db
      .delete(bomItemsTable)
      .where(eq(bomItemsTable.id, itemId))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ success: true, message: "Item permanently deleted" });
  } catch (error) {
    console.error("Error permanently deleting item:", error);
    res.status(500).json({ error: "Failed to permanently delete item" });
  }
});

export default router;
