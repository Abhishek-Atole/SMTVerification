# BOM Extraction Complete - INTBUZ R1.1

## Summary
Successfully extracted Bill of Material from `INTBUZ_BOM.xlsx` to structured JSON format.

### Metadata
- **Project**: INTBUZ (Internal Buzzer)
- **BOM Number**: RD/BOM/INTBUZ/R1.1
- **Revision**: R00/ 06-01-2026
- **Customer**: Mahindra Last Mile Mobility Limited

### Components Breakdown
| Type | Count |
|------|-------|
| Capacitors | 2 |
| Resistors | 5 |
| ICs (555) | 1 |
| PCB | 1 |
| **Total Items** | **9** |

### Component Details

#### Capacitors
1. **YSM-001**: RDSCAP0353 / RDSCAP0312 YAGEO
   - Part: 4.7nF/50V 10%
   - Qty: 2 (C1, C2)
   - Package: 0603
   - KEMET: C0603C472K5RACAUTO / YAGEO: CC0603KRX7R9BB472

2. **YSM-002**: RDSCAP0037
   - Part: 0.1uF/50V/10%
   - Qty: 2 (C3, C4)
   - Package: 0603
   - KEMET: C0603C104K5RACAUTO / YAGEO: CC0603KRX7R9BB104

#### Resistors
3. **YSM-003**: RDSRES0987
   - Part: 4.7K, ±1%
   - Qty: 1 (R3)
   - Package: 0603
   - Royal Ohm: CQ03WAF4701T5E / YAGEO: RC0603FR-074K7L

4. **YSM-004**: RDSRES0502 YAGEO
   - Part: 270K 1%
   - Qty: 1 (R4)
   - Package: 0805
   - Royal Ohm: CQ05S8F2703T5E / YAGEO: RC0805FR-07270KL

5. **YSM-005**: RDSRES0235 YAGEO
   - Part: 10K 5%
   - Qty: 1 (R5)
   - Package: 0805
   - Royal Ohm: CQ0558J0103T5E / YAGEO: RC0805JR-0710KL

6. **YSM-006**: RDSRES1109 ROYAL OHM
   - Part: 2.7K 1%
   - Qty: 1 (R6)
   - Package: 0603
   - Royal Ohm: CQ03SAF2701T5E / YAGEO: RC0603FR-072K7L

7. **YSM-007**: RDSRES0985
   - Part: 10K 1%
   - Qty: 1 (R7)
   - Package: 0603
   - Royal Ohm: CQ03WAF1002T5E / YAGEO: RC0603FR-0710KL

#### IC
8. **YSM-008**: RDSDIOD0266 Diodes
   - Part: SE555QS-13 (555 Timer IC)
   - Qty: 1 (U1)
   - Package: SO-8
   - Diodes Inc: SE555QS-13

#### PCB
9. **Bare PCB**: INTBUZ/R&D/R1.1
   - BOM Reference: BARE PCB INTBUZ/R&D/R1.1
   - Qty: 1

### Feeder Configuration
- Total Feeders: 8 (YSM-001 through YSM-008)
- Total Component References: 11 (C1-C4, R3-R7, U1)

### Output Files
- **JSON File**: `bom-intbuz-r1.1.json` - Full structured data
- **Format**: Complete BOM with metadata, component summary, and detailed item specifications

### Data Structure
The JSON file contains:
```
{
  "metadata": { bom_title, bom_number, part_name, bom_rev_date, customer },
  "summary": { total_items, components breakdown, feeders list, total_references },
  "bom_items": [ array of 9 component objects with all specifications ]
}
```

Each component object includes:
- SR Number (sequential reference)
- Feeder Number (YSM-###)
- Item Name and Type
- RDEPL Part Number (internal designation)
- Required Quantity
- Reference Designator (C#, R#, U#)
- Component Value/Specification
- Package Type
- Supplier Information (up to 3 suppliers per component)
- Part Numbers from each supplier
- Remarks

### Data Integrity
✓ All 9 BOM items successfully extracted
✓ Multi-line fields preserved (RDEPL_PART_NO with newlines)
✓ Supplier alternatives captured
✓ Component references validated
✓ Feeder configuration complete

