import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bomsTable, bomItemsTable } from "@workspace/db/schema";
import { eq, sql, isNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/bom", async (req, res) => {
  try {
    const boms = await db
      .select()
      .from(bomsTable)
      .where(isNull(bomsTable.deletedAt))
      .orderBy(bomsTable.createdAt);
    const counts = await db
      .select({ bomId: bomItemsTable.bomId, count: sql<number>`count(*)::int` })
      .from(bomItemsTable)
      .where(isNull(bomItemsTable.deletedAt))
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
    const boms = await db
      .select()
      .from(bomsTable)
      .where(eq(bomsTable.id, bomId));
    
    const bom = boms.find((b: any) => !b.deletedAt);
    
    if (!bom) {
      return res.status(404).json({ error: "BOM not found" });
    }
    
    const items = await db
      .select()
      .from(bomItemsTable)
      .where(eq(bomItemsTable.bomId, bomId));
    
    const filteredItems = items.filter((i: any) => !i.deletedAt);
    
    // Manually serialize to avoid issues with Decimal types
    const serializedItems = filteredItems.map((item: any) => ({
      id: item.id,
      bomId: item.bomId,
      srNo: item.srNo,
      feederNumber: item.feederNumber,
      itemName: item.itemName,
      rdeplyPartNo: item.rdeplyPartNo,
      referenceDesignator: item.referenceDesignator,
      values: item.values,
      packageDescription: item.packageDescription,
      dnpParts: item.dnpParts,
      supplier1: item.supplier1,
      partNo1: item.partNo1,
      supplier2: item.supplier2,
      partNo2: item.partNo2,
      supplier3: item.supplier3,
      partNo3: item.partNo3,
      remarks: item.remarks,
      partNumber: item.partNumber,
      feederId: item.feederId,
      componentId: item.componentId,
      mpn: item.mpn,
      manufacturer: item.manufacturer,
      packageSize: item.packageSize,
      expectedMpn: item.expectedMpn,
      description: item.description,
      location: item.location,
      quantity: item.quantity,
      leadTime: item.leadTime,
      cost: item.cost ? String(item.cost) : null,
      isAlternate: item.isAlternate,
      parentItemId: item.parentItemId,
    }));
    
    return res.json({
      id: bom.id,
      name: bom.name,
      description: bom.description,
      createdAt: bom.createdAt,
      items: serializedItems,
    });
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

router.delete("/bom/:bomId", async (req: any, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const userId = req.user?.username || "unknown";
    
    // Soft delete: set deletedAt and deletedBy instead of actually deleting
    const [deletedBom] = await db
      .update(bomsTable)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(eq(bomsTable.id, bomId))
      .returning();

    if (!deletedBom) {
      return res.status(404).json({ error: "BOM not found" });
    }

    return res.json({ success: true, message: "BOM moved to trash" });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to delete BOM" });
  }
});

router.post("/bom/:bomId/items", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const {
      // CSV Fields
      srNo,
      feederNumber,
      itemName,
      rdeplyPartNo,
      referenceDesignator,
      values,
      packageDescription,
      dnpParts,
      supplier1,
      partNo1,
      supplier2,
      partNo2,
      supplier3,
      partNo3,
      remarks,
      
      // Legacy Fields
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
      expectedMpn,
      internalId,
    } = req.body;

    // Require at least feederNumber and either itemName or partNumber
    if (!feederNumber || (!itemName && !partNumber)) {
      return res.status(400).json({ error: "feederNumber and (itemName or partNumber) are required" });
    }

    // Validate if this is an alternate, parentItemId must exist
    if (isAlternate && parentItemId) {
      const parents = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, parentItemId));
      const parent = parents[0];
      if (!parent || parent.bomId !== bomId) {
        return res.status(400).json({ error: "Parent item not found in this BOM" });
      }
    }

    const itemsResult = await db
      .insert(bomItemsTable)
      .values({
        bomId,
        // CSV Fields
        srNo: srNo || null,
        feederNumber,
        itemName: itemName || null,
        rdeplyPartNo: rdeplyPartNo || null,
        referenceDesignator: referenceDesignator || null,
        values: values || null,
        packageDescription: packageDescription || null,
        dnpParts: dnpParts ?? false,
        supplier1: supplier1 || null,
        partNo1: partNo1 || null,
        supplier2: supplier2 || null,
        partNo2: partNo2 || null,
        supplier3: supplier3 || null,
        partNo3: partNo3 || null,
        remarks: remarks || null,
        
        // Legacy Fields
        partNumber: partNumber || itemName || "",
        mpn: mpn || null,
        manufacturer: manufacturer || supplier1 || null,
        packageSize: packageSize || packageDescription || null,
        description: description || itemName || null,
        location,
        quantity: quantity ?? 1,
        leadTime: leadTime || null,
        cost: cost ? String(cost) : null,
        isAlternate: isAlternate ?? false,
        parentItemId: parentItemId || null,
        expectedMpn: expectedMpn || null,
        internalId: internalId || null,
      })
      .returning() as any[];
    
    const item = itemsResult[0];

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
      // CSV Fields
      srNo,
      feederNumber,
      itemName,
      rdeplyPartNo,
      referenceDesignator,
      values,
      packageDescription,
      dnpParts,
      supplier1,
      partNo1,
      supplier2,
      partNo2,
      supplier3,
      partNo3,
      remarks,
      
      // Legacy Fields
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
      expectedMpn,
      internalId,
    } = req.body;

    const existingItems = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, itemId));
    const existingItem = existingItems[0];
    if (!existingItem || existingItem.bomId !== bomId) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Validate if this is an alternate, parentItemId must exist
    if (isAlternate !== undefined && isAlternate && parentItemId) {
      const parents = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, parentItemId));
      const parent = parents[0];
      if (!parent || parent.bomId !== bomId) {
        return res.status(400).json({ error: "Parent item not found in this BOM" });
      }
    }

    const updateData: Record<string, unknown> = {};
    
    // CSV Fields
    if (srNo !== undefined) updateData.srNo = srNo;
    if (feederNumber !== undefined) updateData.feederNumber = feederNumber;
    if (itemName !== undefined) updateData.itemName = itemName;
    if (rdeplyPartNo !== undefined) updateData.rdeplyPartNo = rdeplyPartNo;
    if (referenceDesignator !== undefined) updateData.referenceDesignator = referenceDesignator;
    if (values !== undefined) updateData.values = values;
    if (packageDescription !== undefined) updateData.packageDescription = packageDescription;
    if (dnpParts !== undefined) updateData.dnpParts = dnpParts;
    if (supplier1 !== undefined) updateData.supplier1 = supplier1;
    if (partNo1 !== undefined) updateData.partNo1 = partNo1;
    if (supplier2 !== undefined) updateData.supplier2 = supplier2;
    if (partNo2 !== undefined) updateData.partNo2 = partNo2;
    if (supplier3 !== undefined) updateData.supplier3 = supplier3;
    if (partNo3 !== undefined) updateData.partNo3 = partNo3;
    if (remarks !== undefined) updateData.remarks = remarks;
    
    // Legacy Fields
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
    if (expectedMpn !== undefined) updateData.expectedMpn = expectedMpn;
    if (internalId !== undefined) updateData.internalId = internalId;

    const updatedItemsResult = await db
      .update(bomItemsTable)
      .set(updateData)
      .where(eq(bomItemsTable.id, itemId))
      .returning() as any[];
    
    const updatedItem = updatedItemsResult[0];

    return res.json(updatedItem);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update BOM item" });
  }
});

router.delete("/bom/:bomId/items/:itemId", async (req: any, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const bomId = Number(req.params.bomId);
    const userId = req.user?.username || "unknown";
    
    const [item] = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, itemId));
    if (!item || item.bomId !== bomId) {
      return res.status(404).json({ error: "Item not found" });
      return;
    }
    
    // Soft delete: set deletedAt and deletedBy instead of hard deleting
    await db
      .update(bomItemsTable)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(eq(bomItemsTable.id, itemId));
    
    return res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to delete BOM item" });
  }
});

// BOM Report Generation Endpoint
router.get("/bom/:bomId/report", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    
    // Get BOM details
    const boms = await db
      .select()
      .from(bomsTable)
      .where(eq(bomsTable.id, bomId));
    
    const bom = boms.find((b: any) => !b.deletedAt);
    if (!bom) {
      return res.status(404).json({ error: "BOM not found" });
    }
    
    // Get BOM items
    const items = await db
      .select()
      .from(bomItemsTable)
      .where(eq(bomItemsTable.bomId, bomId));
    
    const validItems = items.filter((i: any) => !i.deletedAt);
    
    // Generate report
    const reportData = {
      id: bom.id,
      name: bom.name,
      description: bom.description,
      createdAt: bom.createdAt,
      generatedAt: new Date(),
      totalItems: validItems.length,
      reportPeriod: {
        startDate: bom.createdAt,
        endDate: new Date(),
      },
      summary: {
        totalComponents: validItems.length,
        uniqueManufacturers: new Set(validItems.map((i: any) => i.manufacturer).filter(Boolean)).size,
        uniqueSuppliers: new Set(validItems.map((i: any) => i.supplier1).filter(Boolean)).size,
        totalQuantity: validItems.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0),
      },
      items: validItems.map((item: any) => ({
        id: item.id,
        srNo: item.srNo,
        feederNumber: item.feederNumber,
        itemName: item.itemName,
        partNumber: item.partNumber,
        mpn: item.mpn,
        manufacturer: item.manufacturer,
        packageSize: item.packageSize,
        quantity: item.quantity || 1,
        supplier1: item.supplier1,
        partNo1: item.partNo1,
        supplier2: item.supplier2,
        partNo2: item.partNo2,
        supplier3: item.supplier3,
        partNo3: item.partNo3,
        remarks: item.remarks,
        description: item.description,
        location: item.location,
      })),
    };
    
    return res.json(reportData);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to generate BOM report" });
  }
});

export default router;
