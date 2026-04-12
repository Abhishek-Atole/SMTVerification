import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bomsTable, bomItemsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/bom", async (req, res) => {
  try {
    const boms = await db.select().from(bomsTable).orderBy(bomsTable.createdAt);
    const counts = await db
      .select({ bomId: bomItemsTable.bomId, count: sql<number>`count(*)::int` })
      .from(bomItemsTable)
      .groupBy(bomItemsTable.bomId);

    const countMap = new Map(counts.map((c) => [c.bomId, c.count]));

    const result = boms.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      itemCount: countMap.get(b.id) ?? 0,
      createdAt: b.createdAt,
    }));

    return res.json(result);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list BOMs" });
  }
});

router.post("/bom", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
      return;
    }
    const [bom] = await db.insert(bomsTable).values({ name, description }).returning();
    return res.status(201).json({
      id: bom.id,
      name: bom.name,
      description: bom.description,
      itemCount: 0,
      createdAt: bom.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to create BOM" });
  }
});

router.get("/bom/:bomId", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, bomId));
    if (!bom) {
      return res.status(404).json({ error: "BOM not found" });
      return;
    }
    const items = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, bomId));
    return res.json({ ...bom, items });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get BOM" });
  }
});

router.patch("/bom/:bomId", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const { name, description } = req.body;
    
    const updateData: { name?: string; description?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    
    const [updatedBom] = await db
      .update(bomsTable)
      .set(updateData)
      .where(eq(bomsTable.id, bomId))
      .returning();
    
    if (!updatedBom) {
      return res.status(404).json({ error: "BOM not found" });
      return;
    }
    
    const items = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, bomId));
    const itemCount = items.length;
    
    return res.json({
      id: updatedBom.id,
      name: updatedBom.name,
      description: updatedBom.description,
      itemCount,
      createdAt: updatedBom.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update BOM" });
  }
});

router.delete("/bom/:bomId", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    await db.delete(bomsTable).where(eq(bomsTable.id, bomId));
    return res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to delete BOM" });
  }
});

router.post("/bom/:bomId/items", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const {
      feederNumber,
      partNumber,
      mpn,
      manufacturer,
      packageSize,
      description,
      location,
      quantity,
      leadTime,
      cost,
      isAlternate,
      parentItemId,
    } = req.body;

    if (!feederNumber || !partNumber) {
      return res.status(400).json({ error: "feederNumber and partNumber are required" });
    }

    // Validate if this is an alternate, parentItemId must exist
    if (isAlternate && parentItemId) {
      const [parent] = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, parentItemId));
      if (!parent || parent.bomId !== bomId) {
        return res.status(400).json({ error: "Parent item not found in this BOM" });
      }
    }

    const [item] = await db
      .insert(bomItemsTable)
      .values({
        bomId,
        feederNumber,
        partNumber,
        mpn: mpn || null,
        manufacturer: manufacturer || null,
        packageSize: packageSize || null,
        description,
        location,
        quantity: quantity ?? 1,
        leadTime: leadTime || null,
        cost: cost ? String(cost) : null,
        isAlternate: isAlternate ?? false,
        parentItemId: parentItemId || null,
      })
      .returning();

    return res.status(201).json(item);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to add BOM item" });
  }
});

router.patch("/bom/:bomId/items/:itemId", async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const bomId = Number(req.params.bomId);
    const {
      feederNumber,
      partNumber,
      mpn,
      manufacturer,
      packageSize,
      description,
      location,
      quantity,
      leadTime,
      cost,
      isAlternate,
      parentItemId,
    } = req.body;

    const [existingItem] = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, itemId));
    if (!existingItem || existingItem.bomId !== bomId) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Validate if this is an alternate, parentItemId must exist
    if (isAlternate !== undefined && isAlternate && parentItemId) {
      const [parent] = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, parentItemId));
      if (!parent || parent.bomId !== bomId) {
        return res.status(400).json({ error: "Parent item not found in this BOM" });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (feederNumber !== undefined) updateData.feederNumber = feederNumber;
    if (partNumber !== undefined) updateData.partNumber = partNumber;
    if (mpn !== undefined) updateData.mpn = mpn;
    if (manufacturer !== undefined) updateData.manufacturer = manufacturer;
    if (packageSize !== undefined) updateData.packageSize = packageSize;
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (leadTime !== undefined) updateData.leadTime = leadTime;
    if (cost !== undefined) updateData.cost = cost ? String(cost) : null;
    if (isAlternate !== undefined) updateData.isAlternate = isAlternate;
    if (parentItemId !== undefined) updateData.parentItemId = parentItemId;

    const [updatedItem] = await db
      .update(bomItemsTable)
      .set(updateData)
      .where(eq(bomItemsTable.id, itemId))
      .returning();

    return res.json(updatedItem);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update BOM item" });
  }
});

router.delete("/bom/:bomId/items/:itemId", async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const bomId = Number(req.params.bomId);
    
    const [item] = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, itemId));
    if (!item || item.bomId !== bomId) {
      return res.status(404).json({ error: "Item not found" });
      return;
    }
    
    await db.delete(bomItemsTable).where(eq(bomItemsTable.id, itemId));
    return res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to delete BOM item" });
  }
});

export default router;
