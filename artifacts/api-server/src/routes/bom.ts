import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bomsTable, bomItemsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

type CsvRow = string[];

function parseCsvLine(line: string): CsvRow {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result.map((cell) => cell.trim());
}

function parseCsvRows(csv: string): CsvRow[] {
  const normalized = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  return lines.map(parseCsvLine);
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeInternalPartNumber(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

const HEADER_ALIASES: Record<string, string[]> = {
  feederNumber: ["Feeder Number", "Feeder", "Feeder No", "Feeder No."],
  internalPartNumber: [
    "UCAL Internal Part Number",
    "Internal Part Number",
    "Part Number",
    "Part No",
  ],
  requiredQty: ["Required Qty", "Qty", "Quantity"],
  referenceLocation: ["Reference Location", "Location", "Reference Designator"],
  description: ["Description", "Desc"],
  packageDescription: ["Package/Description", "Package Description", "Package"],
  make1: ["Make 1", "Supplier 1", "Make/Supplier 1"],
  mpn1: ["MPN 1", "Spool Part No. / MPN 1", "Part No 1"],
  make2: ["Make 2", "Supplier 2", "Make/Supplier 2"],
  mpn2: ["MPN 2", "Spool Part No. / MPN 2", "Part No 2"],
  make3: ["Make 3", "Supplier 3", "Make/Supplier 3"],
  mpn3: ["MPN 3", "Spool Part No. / MPN 3", "Part No 3"],
  remarks: ["Remarks", "Remark", "Comments"],
};

function buildHeaderIndex(headerRow: CsvRow): Partial<Record<keyof typeof HEADER_ALIASES, number>> {
  const normalized = headerRow.map(normalizeHeader);
  const indexMap: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};

  for (const key of Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>) {
    const aliases = HEADER_ALIASES[key].map(normalizeHeader);
    const foundIndex = normalized.findIndex((header) => aliases.includes(header));
    if (foundIndex !== -1) {
      indexMap[key] = foundIndex;
    }
  }

  return indexMap;
}

function cell(row: CsvRow, index?: number): string {
  if (index === undefined || index < 0 || index >= row.length) return "";
  return (row[index] ?? "").trim();
}

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
      res.status(404).json({ error: "BOM not found" });
      return;
    }
    
    const items = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, bomId));
    const itemCount = items.length;
    
    res.json({
      id: updatedBom.id,
      name: updatedBom.name,
      description: updatedBom.description,
      itemCount,
      createdAt: updatedBom.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update BOM" });
  }
});

router.delete("/bom/:bomId", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const [bom] = await db.select({ id: bomsTable.id }).from(bomsTable).where(eq(bomsTable.id, bomId));
    if (!bom) {
      res.status(404).json({ error: "BOM not found" });
      return;
    }

    await db.delete(bomItemsTable).where(eq(bomItemsTable.bomId, bomId));
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
    const {
      feederNumber,
      partNumber,
      description,
      location,
      quantity,
      itemName,
      srNo,
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
    } = req.body;
    if (!feederNumber || !partNumber) {
      res.status(400).json({ error: "feederNumber and partNumber are required" });
      return;
    }
    const [bom] = await db.select({ id: bomsTable.id }).from(bomsTable).where(eq(bomsTable.id, bomId));
    if (!bom) {
      res.status(404).json({ error: "BOM not found" });
      return;
    }

    const parsedQuantity = Number(quantity);
    const parsedDnpParts =
      typeof dnpParts === "string"
        ? ["true", "1", "yes", "y", "x"].includes(dnpParts.trim().toLowerCase())
        : Boolean(dnpParts);

    const items = await db
      .insert(bomItemsTable)
      .values({ 
        bomId, 
        feederNumber, 
        partNumber, 
        itemName: itemName || partNumber,
        srNo,
        rdeplyPartNo,
        referenceDesignator,
        values,
        packageDescription,
        dnpParts: parsedDnpParts,
        supplier1,
        partNo1,
        supplier2,
        partNo2,
        supplier3,
        partNo3,
        remarks,
        description, 
        location, 
        quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
      })
      .returning();
    res.status(201).json(items[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to add BOM item" });
  }
});

router.post("/bom/:bomId/import", async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);
    const csv = typeof req.body?.csv === "string" ? req.body.csv : "";

    if (!csv.trim()) {
      res.status(400).json({ error: "csv is required", imported: 0, skipped: 0, errors: ["Missing csv payload"] });
      return;
    }

    const [bom] = await db.select({ id: bomsTable.id }).from(bomsTable).where(eq(bomsTable.id, bomId));
    if (!bom) {
      res.status(404).json({ error: "BOM not found", imported: 0, skipped: 0, errors: ["Invalid bomId"] });
      return;
    }

    const rows = parseCsvRows(csv);
    if (rows.length < 2) {
      res.status(400).json({ error: "CSV must contain at least two header rows", imported: 0, skipped: 0, errors: ["Insufficient rows"] });
      return;
    }

    // Per spec: row 1 is metadata/customer info, row 2 contains column headers.
    const headerRow = rows[1] ?? [];
    const headerIndex = buildHeaderIndex(headerRow);

    if (headerIndex.feederNumber === undefined) {
      res.status(400).json({ error: "Feeder Number column not found", imported: 0, skipped: 0, errors: ["Missing required column: Feeder Number"] });
      return;
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const isBlankRow = row.every((value) => !String(value ?? "").trim());
      if (isBlankRow) {
        skipped++;
        continue;
      }

      const feederNumber = cell(row, headerIndex.feederNumber);
      const internalPartNumber = normalizeInternalPartNumber(cell(row, headerIndex.internalPartNumber));
      const requiredQty = cell(row, headerIndex.requiredQty);
      const referenceLocation = cell(row, headerIndex.referenceLocation);
      const description = cell(row, headerIndex.description);
      const packageDescription = cell(row, headerIndex.packageDescription);
      const make1 = cell(row, headerIndex.make1);
      const mpn1 = cell(row, headerIndex.mpn1);
      const make2 = cell(row, headerIndex.make2);
      const mpn2 = cell(row, headerIndex.mpn2);
      const make3 = cell(row, headerIndex.make3);
      const mpn3 = cell(row, headerIndex.mpn3);
      const remarks = cell(row, headerIndex.remarks);

      if (!feederNumber) {
        skipped++;
        errors.push(`Row ${i + 1}: missing feeder number`);
        continue;
      }

      const fallbackPart = internalPartNumber || mpn1 || mpn2 || mpn3 || description || feederNumber;
      const parsedQuantity = Number(requiredQty);

      try {
        await db.insert(bomItemsTable).values({
          bomId,
          feederNumber,
          partNumber: fallbackPart,
          itemName: fallbackPart,
          internalPartNumber,
          requiredQty,
          referenceLocation,
          description,
          packageDescription,
          make1,
          mpn1,
          make2,
          mpn2,
          make3,
          mpn3,
          remarks,
          quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
          location: referenceLocation,
        });
        imported++;
      } catch (error) {
        skipped++;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Row ${i + 1}: ${message}`);
      }
    }

    res.json({ imported, skipped, errors });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to import BOM CSV", imported: 0, skipped: 0, errors: ["Internal server error"] });
  }
});

router.delete("/bom/:bomId/items/:itemId", async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const bomId = Number(req.params.bomId);
    
    const [item] = await db.select().from(bomItemsTable).where(eq(bomItemsTable.id, itemId));
    if (!item || item.bomId !== bomId) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    
    await db.delete(bomItemsTable).where(eq(bomItemsTable.id, itemId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete BOM item" });
  }
});

export default router;
