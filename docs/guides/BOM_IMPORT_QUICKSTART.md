# 📥 Quick Import Guide - 2 Minutes

## What's New?
The BOM editor now supports **bulk import** from:
- ✅ CSV files (.csv)
- ✅ Excel files (.xlsx)
- ✅ Legacy Excel (.xls)

## Quick Start - 4 Steps

### Step 1: Prepare Your File
Create a file (CSV or Excel) with columns:
- `Item Name` - REQUIRED (e.g., "CAPACITOR", "RESISTOR")
- `Reference` - REQUIRED (e.g., "C1", "R3", "U1")
- `Feeder Number` (e.g., "YSM-001")
- `Value` (e.g., "4.7nF", "10K")
- `Package` (e.g., "0603", "0805")
- `Qty` (e.g., 1, 2)
- `Supplier 1` (e.g., "KEMET")
- `Part No 1` (part number)
- Plus optional: Supplier 2, Part No 2, Supplier 3, Part No 3, Remarks

### Step 2: Click Import Button
```
Open bom-editor.html → Click "📤 Import CSV/Excel"
```

### Step 3: Select File
```
Choose your .csv, .xlsx, or .xls file → Click Open
```

### Step 4: Confirm & Done
```
Review detected columns → Click OK → Data imports!
```

---

## File Format - CSV Example

```csv
SR NO,Feeder Number,Item Name,Reference,Value,Package,Qty,Supplier 1,Part No 1
1,YSM-001,CAPACITOR,C1,4.7nF,0603,1,KEMET,C0603C472K5RACAUTO
2,YSM-002,CAPACITOR,C2,0.1uF,0603,2,KEMET,C0603C104K5RACAUTO
3,YSM-003,RESISTOR,R1,10K,0603,1,Royal Ohm,CQ03WAF1002T5E
```

---

## File Format - Excel Example

| Item Name | Reference | Feeder Number | Value | Package | Qty | Supplier 1 | Part No 1 |
|---|---|---|---|---|---|---|---|
| CAPACITOR | C1 | YSM-001 | 4.7nF | 0603 | 1 | KEMET | C0603C472K5RACAUTO |
| RESISTOR | R1 | YSM-003 | 10K | 0603 | 1 | Royal Ohm | CQ03WAF1002T5E |

---

## Column Names (Auto-Detected)

The system recognizes these variations automatically:

### Item Name
`Item Name` | `Type` | `Component Name` | `Item Type`

### Reference  
`Reference` | `Ref` | `Designator` | `PCB Reference`

### Feeder Number
`Feeder Number` | `Feeder` | `Position` | `Feeder No`

### Quantity
`Qty` | `Quantity` | `Required Qty` | `Required Quantity`

### Supplier
`Supplier 1` | `Make/Supplier 1` | `Supplier` | `Make`

### Part Number
`Part No 1` | `Part Number 1` | `Part No` | `Manufacturer Part`

### Value
`Value` | `Values` | `Component Value` | `Spec`

### Package
`Package` | `Package Type` | `Pkg` | `Component Package`

---

## What Gets Imported

✅ **All 15 BOM Fields:**
1. SR Number
2. Feeder Number
3. Item Name
4. Reference
5. Value
6. Package
7. Quantity
8. RDEPL Part No
9. DNP Parts
10. Supplier 1
11. Part No 1
12. Supplier 2
13. Part No 2
14. Supplier 3
15. Part No 3

Plus: Remarks/Notes

---

## Important Rules

### REQUIRED Columns
✅ **Item Name** - Must not be empty
✅ **Reference** - Must not be empty

### AUTO-GENERATED
- SR Number: Auto-assigned if blank
- Empty cells: Treated as blank

### AUTO-CONVERTED
- Quantities: Converted to numbers
- SR Numbers: Converted to numbers
- Only numeric values kept (text → 0)

---

## Example Workflow

### Scenario: Update BOM from Excel

1. **Open Excel file** with 50 components
2. **Click** "📤 Import CSV/Excel"
3. **Select** the Excel file
4. **See** confirmation showing:
   ```
   Found 50 components to import
   ✓ Item Names detected
   ✓ References detected
   ✓ Feeders detected
   ✓ Suppliers detected
   ```
5. **Click OK** → 50 components loaded!
6. **Review** in the editor table
7. **Click "Save Changes"** → Download updated JSON
8. **Replace** original file with downloaded one

**Done! Updated BOM in 2 minutes! 🚀**

---

## Troubleshooting - Quick Fixes

| Problem | Fix |
|---------|-----|
| "No recognizable columns found" | Use standard column names from the guide |
| "No valid data rows found" | Make sure Item Name + Reference isn't empty |
| File won't load | Check file format (.csv, .xlsx, or .xls only) |
| Data looks wrong | Check CSV encoding (should be UTF-8) |
| Numbers showing as 0 | Ensure Qty/SR NO columns have numbers, not text |
| Can't find file | Check file saved in correct location |

---

## Try It Now!

### Use the Example File
1. **Open**: `BOM_IMPORT_EXAMPLE.csv` (in same folder)
2. **Edit** in Excel or any spreadsheet app
3. **Save** as CSV or XLSX
4. **Import** into editor
5. **See** your data load instantly!

---

## File Types Explained

### CSV (.csv)
- **Best for**: Simple data, easy to share
- **How to create**: 
  - Excel: File → Save As → CSV UTF-8
  - Google Sheets: Download → CSV
  - Any text editor

### XLSX (.xlsx)
- **Best for**: Complex data, multiple sheets
- **How to create**:
  - Excel: File → Save As → Excel Workbook
  - LibreOffice: Save As → ODF or XLSX
  - Online: Most spreadsheet apps support XLSX

### XLS (.xls)
- **Best for**: Legacy Excel compatibility
- **How to create**:
  - Old Excel versions
  - Conversion from XLSX

---

## Next Steps

1. ✅ **Prepare your BOM file** (CSV or Excel)
2. ✅ **Use correct column names** (from guide above)
3. ✅ **Click "📤 Import CSV/Excel"** in editor
4. ✅ **Select file** → Review → Click OK
5. ✅ **Save Changes** → Download → Replace file

---

## See Also
- **Full Guide**: `BOM_IMPORT_GUIDE.md` (detailed info)
- **Example File**: `BOM_IMPORT_EXAMPLE.csv` (ready to use)
- **Main Editor**: `bom-editor.html` (open to import)

---

**Import feature is live! 🎉**

**Any questions? Check the full guide for advanced options.**
