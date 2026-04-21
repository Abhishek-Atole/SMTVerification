# BOM Editor - Import Guide

## Overview

The BOM editor now supports importing BOM data from multiple file formats:

- ✅ **CSV** (.csv)
- ✅ **Excel** (.xlsx)
- ✅ **Excel 97-2003** (.xls)

## Supported File Formats

### CSV Format

Plain text file with comma-separated values. Can be created with:

- Excel (Save As → CSV UTF-8)
- Google Sheets (Download → CSV)
- Any text editor

### XLSX Format

Modern Excel format (.xlsx). Supported:

- Excel 2007 and later
- LibreOffice Calc
- Google Sheets

### XLS Format

Legacy Excel format (.xls). Supported:

- Excel 97-2003
- Older versions of Excel

## Column Requirements

### Required Columns (At least one must be present)

- **Item Name** / Item Type / Component Name / Type
- **Reference** / Designator / PCB Reference

### Highly Recommended Columns

- **SR NO** / Serial Number / Item Number
- **Feeder Number** / Feeder / Position
- **Value** / Values / Component Value / Spec
- **Package** / Package Type
- **Quantity** / Qty / Required Quantity

### Supplier Columns (Optional but useful)

- **Supplier 1** / Make/Supplier 1
- **Part No 1** / Part Number 1
- **Supplier 2** / Make/Supplier 2
- **Part No 2** / Part Number 2
- **Supplier 3** / Supplier 3
- **Part No 3** / Part Number 3

### Other Columns (Optional)

- **RDEPL Part No** / Internal Part / Part Number (Internal)
- **DNP** / Do Not Populate
- **Remarks** / Notes / Comments

## Column Name Variations

The import function recognizes common naming variations:

### Item Name

- `Item Name` → item_name
- `Item Type` → item_name
- `Component Name` → item_name
- `Type` → item_name
- `Component Type` → item_name

### Reference

- `Reference` → reference
- `Ref` → reference
- `Designator` → reference
- `PCB Reference` → reference

### Feeder

- `Feeder Number` → feeder_number
- `Feeder No` → feeder_number
- `Feeder` → feeder_number
- `Position` → feeder_number

### Quantity

- `Qty` → required_qty
- `Quantity` → required_qty
- `Required Qty` → required_qty
- `Required Quantity` → required_qty

### Supplier

- `Supplier 1` → supplier_1
- `Make/Supplier 1` → supplier_1
- `Make` → supplier_1
- `Supplier` → supplier_1

### Value/Specification

- `Value` → values
- `Values` → values
- `Component Value` → values
- `Spec` → values

## How to Import

### Step 1: Prepare Your File

1. Organize your BOM data in Excel or CSV
2. Ensure column headers are in the first row
3. Data should start from row 2

### Step 2: Upload File

1. Click **"📤 Import CSV/Excel"** button
2. Select your file (.csv, .xlsx, or .xls)
3. Click "Open"

### Step 3: Confirm Import

1. Review the preview showing detected columns
2. Check marks (✓) indicate recognized data:
   - ✓ SR Numbers detected
   - ✓ Item Names detected
   - ✓ Feeders detected
   - ✓ References detected
   - ✓ Values detected
   - ✓ Packages detected
   - ✓ Quantities detected
   - ✓ Suppliers detected
3. Click "OK" to import
4. Click "Cancel" to abort

### Step 4: Review Imported Data

1. All your components appear in the table
2. Use search to verify data
3. Edit any fields if needed
4. Click "💾 Save Changes" to save

## Example CSV Format

```csv
SR NO,Feeder Number,Item Name,Reference,Value,Package,Qty,Supplier 1,Part No 1,Supplier 2,Part No 2,Remarks
1,YSM-001,CAPACITOR,C1 C2,4.7nF/50V,0603,2,KEMET,C0603C472K5RACAUTO,YAGEO,CC0603KRX7R9BB472,
2,YSM-002,CAPACITOR,C3 C4,0.1µF/50V,0603,2,KEMET,C0603C104K5RACAUTO,YAGEO,CC0603KRX7R9BB104,
13,YSM-003,RESISTOR,R3,4.7K 1%,0603,1,Royal Ohm,CQ03WAF4701T5E,YAGEO,RC0603FR-074K7L,
```

## Example Excel/XLSX Format

| SR NO | Feeder Number | Item Name | Reference | Value | Package | Qty | Supplier 1 | Part No 1 | Supplier 2 | Part No 2 |
|-------|---|---|---|---|---|---|---|---|---|---|
| 1 | YSM-001 | CAPACITOR | C1 C2 | 4.7nF/50V | 0603 | 2 | KEMET | C0603C472K5RACAUTO | YAGEO | CC0603KRX7R9BB472 |
| 2 | YSM-002 | CAPACITOR | C3 C4 | 0.1µF/50V | 0603 | 2 | KEMET | C0603C104K5RACAUTO | YAGEO | CC0603KRX7R9BB104 |
| 13 | YSM-003 | RESISTOR | R3 | 4.7K 1% | 0603 | 1 | Royal Ohm | CQ03WAF4701T5E | YAGEO | RC0603FR-074K7L |

## Data Validation

### What Gets Imported

✅ All 15 BOM fields:

- SR Number (auto-assigned if blank)
- Feeder Number
- Item Name **(required)**
- reference **(required)**
- Value (with units preserved)
- Package
- Quantity (as integer)
- RDEPL Part Number
- DNP flag
- Supplier 1-3 names
- Part Numbers 1-3
- Remarks

### What Gets Ignored

❌ Empty rows
❌ Rows without Item Name AND Reference
❌ Non-numeric SR Numbers and Quantities (converted to 0)
❌ Columns with unrecognized headers

### Data Type Conversions

- **SR NO / Qty**: Converted to integers
- **Spaces/Newlines**: Preserved in all text fields
- **Numbers as text**: Handled correctly
- **Empty cells**: Treated as empty strings

## Troubleshooting

### Issue: "No recognizable columns found"

**Solution:**

1. Check your column headers
2. Use standard headers from the examples above
3. Avoid special characters in headers
4. Headers should be in row 1

### Issue: "No valid data rows found"

**Solution:**

1. Ensure at least one row has "Item Name" AND "Reference"
2. Item Name column must not be empty for data rows
3. Check for extra blank rows at the end

### Issue: Some columns not detected

**Solution:**

1. Use standard header names (examples in table above)
2. Exact matches work best
3. Minor variations are auto-detected
4. If still not detected, manually edit in the editor

### Issue: Numbers becoming 0

**Solution:**

1. Check if SR NO and Qty are numeric
2. Non-numeric values convert to 0
3. For example: "SR-1" converts to 0 (should be just "1")

### Issue: File won't upload

**Solution:**

1. Only .csv, .xlsx, .xls files supported
2. Check file extension (case-insensitive)
3. File size should be < 100MB
4. No corrupt Excel files

### Issue: Special characters look wrong

**Solution:**

1. Ensure CSV is UTF-8 encoded
2. Excel files should be standard format
3. Copy from "Export JSON" to get correct encoding

## Import Workflow

### Complete Import Example

**Before:**

- Old BOM with 5 components
- Needs updating with 15 new components

**Steps:**

1. Open `bom-editor.html`
2. Click "📤 Import CSV/Excel"
3. Select file with 15 components (XLSX)
4. Review column detection
5. Click "OK" to import
6. New BOM shows 15 components
7. Click "💾 Save Changes"
8. Download updated JSON
9. Replace original file
10. Done! ✅

## Integration with Export

### Export → Modify → Import Cycle

1. **Export**: Click "Export JSON" → Download
2. **Convert**: Open in Excel, add/edit rows
3. **Save**: Save as XLSX or CSV
4. **Import**: Click "📤 Import" → Select file
5. **Verify**: Check changes
6. **Save**: Click "Save Changes"

## Advanced Usage

### Bulk Import from Multiple Files

1. Prepare separate files for different suppliers
2. Import first file
3. Click "📤 Import" again
4. Select second file
5. ⚠️ **Note**: This replaces entire BOM (not append)
6. To append: Export current → Combine in Excel → Re-import

### Format Conversion

- **From XLS**: Open in Excel → Save As XLSX
- **From Google Sheets**: Download as CSV
- **From LibreOffice**: Export as XLSX or CSV
- **From JSON**: Export to Excel → modify → reimport

### Validation Checklist Before Import

- [ ] Column headers in row 1
- [ ] Data starts in row 2
- [ ] Item Name column not empty (per row)
- [ ] Reference column not empty (per row)
- [ ] SR Numbers are numeric (if present)
- [ ] Quantities are numeric
- [ ] No hidden rows/columns
- [ ] No merged cells
- [ ] File is UTF-8 encoded (CSV)
- [ ] File is standard Excel format (.xlsx preferred)

## Tips & Best Practices

### Tip 1: Standard Column Names

Use exact names from the guide for reliable detection:

- ✅ `SR NO` or `SR Number`
- ✅ `Item Name` or `Item Type`
- ✅ `Reference` or `Ref`
- ❌ Avoid: `SR#`, `Item`, `Ref.` (may not detect)

### Tip 2: Preserve Order

Import maintains original row order if SR NO is populated.
If SR NO is blank, auto-assigns sequential numbers.

### Tip 3: Backup First

Before importing a large file:

1. Click "Export JSON" to backup current BOM
2. Keep the downloaded file
3. Then proceed with import

### Tip 4: Verify Headers

Before importing:

1. Open file in editor/Excel
2. Check row 1 has headers
3. Verify column names make sense
4. Look for typos or variations

### Tip 5: Test Small Imports

1. Test with 2-3 components first
2. Verify data imports correctly
3. Then do full import

## Supported File Properties

### CSV Properties

- **Encoding**: UTF-8 (recommended), UTF-16, ASCII
- **Delimiter**: Comma
- **Quote character**: Double quotes (")
- **Max size**: 100 MB
- **Max rows**: 1,000,000+

### XLSX Properties

- **Version**: Any modern Excel
- **Max size**: 100 MB
- **Max rows**: 1,000,000
- **Multiple sheets**: Imports first sheet only

### XLS Properties

- **Version**: Excel 97-2003
- **Max size**: 100 MB
- **Max rows**: 1,000,000
- **Multiple sheets**: Imports first sheet only

## Troubleshooting Checklist

| Issue | Check | Fix |
|-------|-------|-----|
| Columns not detected | Header names | Use standard names from guide |
| No data imported | Row 2 onwards | Ensure data starts row 2 |
| Item Name missing | Column exists | Add Item Name column |
| Quantities wrong | Data type | Ensure numeric values |
| File won't upload | Extension | Must be .csv, .xlsx, or .xls |
| Characters corrupted | Encoding | Save CSV as UTF-8 |
| Formula errors | Cell format | Save formulas as values |
| Blank rows | Data integrity | Remove empty rows |

## Next Steps

1. **Prepare File**: Use CSV or XLSX format
2. **Check Headers**: Use standard column names
3. **Validate Data**: Ensure Item Name and Reference present
4. **Test Import**: Start with small file
5. **Review**: Check imported data in editor
6. **Save Changes**: Click "💾 Save Changes"
7. **Verify**: Download and check JSON

---

**Import is now enabled! Ready to bulk upload your BOMs! 🚀**
