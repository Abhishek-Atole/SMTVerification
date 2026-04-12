import { db } from "../src/index";
import {
  feedersTable,
  componentsTable,
  componentAlternatesTable,
  bomsTable,
  bomItemsTable,
} from "../src/schema";

async function seed() {
  console.log("🌱 Starting database seed...\n");

  try {
    // 1. Create Sample Feeders
    console.log("📦 Creating sample feeders...");
    const feeders = await db
      .insert(feedersTable)
      .values([
        {
          feederId: "FDR_001",
          feederType: "SMT",
          size: "8mm",
          make: "Yamaha",
          description: "Yamaha 8mm feeder - Slot 01",
        },
        {
          feederId: "FDR_002",
          feederType: "SMT",
          size: "12mm",
          make: "Yamaha",
          description: "Yamaha 12mm feeder - Slot 02",
        },
        {
          feederId: "FDR_003",
          feederType: "SMT",
          size: "16mm",
          make: "Fuji",
          description: "Fuji 16mm feeder - Slot 03",
        },
        {
          feederId: "FDR_004",
          feederType: "SMT",
          size: "8mm",
          make: "Fuji",
          description: "Fuji 8mm feeder - Slot 04",
        },
        {
          feederId: "FDR_005",
          feederType: "SMT",
          size: "12mm",
          make: "Yamaha",
          description: "Yamaha 12mm feeder - Slot 05",
        },
      ])
      .returning({ id: feedersTable.id, feederId: feedersTable.feederId });

    console.log(`✓ Created ${feeders.length} feeders\n`);

    // 2. Create Sample Components
    console.log("🔌 Creating sample components...");
    const components = await db
      .insert(componentsTable)
      .values([
        {
          partId: "DIO_5V1_001",
          mpn: "MM1Z5V1",
          description: "Zener Diode 5.1V",
          manufacturer: "Fairchild",
          category: "Diode",
        },
        {
          partId: "RES_1K_001",
          mpn: "RC1206FK1001",
          description: "Resistor 1K 1206",
          manufacturer: "Yageo",
          category: "Resistor",
        },
        {
          partId: "CAP_100N_001",
          mpn: "CC1206KRX5R7BB104",
          description: "Capacitor 100nF 1206",
          manufacturer: "Yageo",
          category: "Capacitor",
        },
        {
          partId: "DIO_5V1_ALT1",
          mpn: "BZT52C5V1",
          description: "Zener Diode 5.1V Alternate 1",
          manufacturer: "ON Semi",
          category: "Diode",
        },
        {
          partId: "DIO_5V1_ALT2",
          mpn: "MMSZ5231B",
          description: "Zener Diode 5.1V Alternate 2",
          manufacturer: "Infineon",
          category: "Diode",
        },
      ])
      .returning({ id: componentsTable.id, mpn: componentsTable.mpn });

    console.log(`✓ Created ${components.length} components\n`);

    // 3. Create Alternate Component Mappings
    console.log("🔀 Creating approved alternate mappings...");
    const primaryDiode = components.find((c) => c.mpn === "MM1Z5V1");
    const altDiode1 = components.find((c) => c.mpn === "BZT52C5V1");
    const altDiode2 = components.find((c) => c.mpn === "MMSZ5231B");

    if (primaryDiode && altDiode1 && altDiode2) {
      await db.insert(componentAlternatesTable).values([
        {
          primaryComponentId: primaryDiode.id,
          alternateComponentId: altDiode1.id,
          approvalStatus: "approved",
          approvedBy: "Engineer_Lead",
          approvalDate: new Date(),
          notes: "Approved as drop-in replacement",
        },
        {
          primaryComponentId: primaryDiode.id,
          alternateComponentId: altDiode2.id,
          approvalStatus: "approved",
          approvedBy: "Engineer_Lead",
          approvalDate: new Date(),
          notes: "Approved as drop-in replacement",
        },
      ]);
      console.log(`✓ Created 2 approved alternate mappings\n`);
    }

    // 4. Create Sample BOM
    console.log("📋 Creating sample BOM...");
    const bom = await db
      .insert(bomsTable)
      .values({
        name: "SMT_TEST_BOM_001",
        description: "Test BOM for feeder verification",
      })
      .returning({ id: bomsTable.id });

    const bomId = bom[0].id;

    // 5. Add BOM Items with Component/Feeder Mappings
    console.log("📍 Adding BOM items...");
    const dioComponent = components.find((c) => c.mpn === "MM1Z5V1");
    const resistorComponent = components.find((c) => c.mpn === "RC1206FK1001");
    const capacitorComponent = components.find((c) => c.mpn === "CC1206KRX5R7BB104");

    if (dioComponent && resistorComponent && capacitorComponent) {
      await db.insert(bomItemsTable).values([
        {
          bomId,
          feederNumber: "T1",
          feederId: feeders[0].id, // FDR_001
          partNumber: "DIO_5V1_001",
          componentId: dioComponent.id,
          expectedMpn: "MM1Z5V1",
          description: "Zener Diode 5.1V",
          quantity: 100,
        },
        {
          bomId,
          feederNumber: "T2",
          feederId: feeders[1].id, // FDR_002
          partNumber: "RES_1K_001",
          componentId: resistorComponent.id,
          expectedMpn: "RC1206FK1001",
          description: "Resistor 1K 1206",
          quantity: 200,
        },
        {
          bomId,
          feederNumber: "T3",
          feederId: feeders[2].id, // FDR_003
          partNumber: "CAP_100N_001",
          componentId: capacitorComponent.id,
          expectedMpn: "CC1206KRX5R7BB104",
          description: "Capacitor 100nF 1206",
          quantity: 300,
        },
      ]);
      console.log(`✓ Created 3 BOM items\n`);
    }

    console.log("✅ Seed completed successfully!\n");
    console.log("Sample Data Created:");
    console.log(`  • Feeders: ${feeders.length} (FDR_001 to FDR_005)`);
    console.log(`  • Components: ${components.length} (Diode, Resistor, Capacitor)`);
    console.log(`  • Alternate Mappings: 2 (MM1Z5V1 → BZT52C5V1, MMSZ5231B)`);
    console.log(`  • BOM: 1 (SMT_TEST_BOM_001)`);
    console.log(`  • BOM Items: 3 (T1, T2, T3)`);
    console.log("\nTest Cases:");
    console.log("  1. Scan FDR_001 + MM1Z5V1 → PASS (exact match)");
    console.log("  2. Scan FDR_001 + BZT52C5V1 → PASS (approved alternate)");
    console.log("  3. Scan FDR_001 + UNKNOWN_MPN → FAIL (not in master)");
    console.log("\nTry visiting /api/feeders to see the new feeder data!");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed().then(() => process.exit(0));
