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

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list BOMs" });
  }
});

router.post("/bom", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [bom] = await db.insert(bomsTable).values({ name, description }).returning();
    res.status(201).json({
      id: bom.id,
      name: bom.name,
      description: bom.description,
      itemCount: 0,
      createdAt: bom.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create BOM" });
  }
});

router.get("/bom/:bomId", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, bomId));
    if (!bom) {
      res.status(404).json({ error: "BOM not found" });
      return;
    }
    const items = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, bomId));
    res.json({ ...bom, items });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get BOM" });
  }
});

router.delete("/bom/:bomId", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    await db.delete(bomsTable).where(eq(bomsTable.id, bomId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete BOM" });
  }
});

router.post("/bom/:bomId/items", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const { feederNumber, partNumber, description, location, quantity } = req.body;
    if (!feederNumber || !partNumber) {
      res.status(400).json({ error: "feederNumber and partNumber are required" });
      return;
    }
    const [item] = await db
      .insert(bomItemsTable)
      .values({ bomId, feederNumber, partNumber, description, location, quantity: quantity ?? 1 })
      .returning();
    res.status(201).json(item);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to add BOM item" });
  }
});

export default router;
