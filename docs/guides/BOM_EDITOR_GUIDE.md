# BOM Editor - User Guide

## Overview

A visual web-based BOM editor that allows you to easily view, edit, add, and delete components from the INTBUZ BOM without needing direct file access.

## How to Use

### 1. **Open the Editor**

- Open `bom-editor.html` in any web browser
- Simply double-click it or right-click → Open with Browser

### 2. **Viewing Components**

- The BOM loads automatically when the page opens
- Shows all 9 components in an organized table
- Statistics displayed at the top (total items, capacitors, resistors, ICs, feeders)

### 3. **Searching Components**

- Use the search box to filter components
- Search works across: Feeder Number, Item Name, Reference, and Value
- Example: Search "YSM-001" or "CAPACITOR" or "C1"

### 4. **Editing Existing Components**

#### Quick Edit (Direct in Table)

- Click directly in any cell to edit
- Changes are made instantly in memory
- Works for: Feeder, Item Name, Reference, Value, Package, Qty, Supplier 1, Part No 1, Supplier 2

#### Full Edit (Modal Dialog)

- Click the "Edit" button in the Actions column
- Opens a dialog with all 13 fields
- Allows editing of all component data including remarks
- Click "Save Component" to apply changes

### 5. **Adding New Components**

   1. Click **"+ Add Component"** button
   2. Fill in the required fields:
      - **SR Number** (auto-populated, can be changed)
      - Item Name (e.g., "CAPACITOR", "RESISTOR", "IC")
      - Reference (e.g., "C1", "R3", "U1")
      - Feeder Number (e.g., "YSM-001")
   3. Fill in optional fields:
      - Value (e.g., "4.7nF/50V")
      - Package (e.g., "0603")
      - Quantity
      - Supplier details and part numbers
      - Remarks
   4. Click "Save Component"
   5. New component appears in the table

### 6. **Deleting Components**

   1. Click the "Delete" button (red) in the Actions column
   2. Confirm the deletion
   3. Component is removed from BOM

### 7. **Saving Changes**

   ⚠️ **IMPORTANT**: Changes are stored in memory until you save!

   **Option A: Export and Replace**

   1. Click **"💾 Save Changes"** button
   2. A JSON file (`bom-intbuz-r1.1.json`) downloads automatically
   3. Replace the original file in your workspace with this downloaded file:
      - Original location: `bom-intbuz-r1.1.json`
      - Move downloaded file to this location

   **Option B: Copy-Paste JSON**

   1. Right-click the table area
   2. Select "Inspect" or "Developer Tools"
   3. In the console, run: `JSON.stringify(bomData, null, 2)`
   4. Copy the output
   5. Paste into your `bom-intbuz-r1.1.json` file

### 8. **Reloading Data**

- Click **"Reload"** to discard in-memory changes and reload from file
- Useful if you need to start over or made a mistake

### 9. **Exporting Data**

- Click **"📥 Export JSON"** to download the current BOM as JSON
- Same as "Save Changes" - exports the modified BOM

## Field Reference

| Field | Description | Example |
|-------|---|---|
| SR Number | Sequential ID | 1, 2, 13... |
| Feeder Number | SMT feeder position | YSM-001 |
| Item Name | Component type | CAPACITOR, RESISTOR, 555 IC, PCB |
| Reference | PCB designator | C1, C2, R3, U1 |
| Value | Component specification | 4.7nF/50V, 10K 1% |
| Package | Component package | 0603, 0805, SO-8 |
| Quantity | Qty needed | 1, 2, 4... |
| RDEPL Part No | Internal part code | RDSCAP0353 |
| Supplier 1 | Primary supplier | KEMET, Royal Ohm |
| Part No 1 | Supplier's part number | C0603C472K5RACAUTO |
| Supplier 2 | Secondary supplier | YAGEO |
| Part No 2 | Secondary supplier's part number | CC0603KRX7R9BB472 |
| Remarks | Additional notes | Any text field |

## Common Tasks

### Task 1: Update a Component's Supplier

1. Click the component's "Edit" button
2. Update "Supplier 1" and "Part No 1" fields
3. Click "Save Component"
4. Save the BOM (click "Save Changes")

### Task 2: Add Missing Component

1. Click "+ Add Component"
2. Fill in all details
3. Click "Save Component"
4. Save the BOM

### Task 3: Correct a Part Number

1. Find the component in the table (use search if needed)
2. Click in the "Part No 1" or "Part No 2" cell
3. Type the correct part number
4. Save the BOM

### Task 4: Backup Before Changes

1. Click "Export JSON" before making changes
2. Keep the downloaded backup file
3. If you make a mistake, you can reload this backup

## Statistics Panel

Shows real-time counts of:

- **Total Items**: All BOM lines
- **Capacitors**: Items with type "CAPACITOR"
- **Resistors**: Items with type "RESISTOR"
- **ICs**: Items containing "IC" in name
- **Feeders**: Unique feeder numbers

Updates automatically after any changes.

## Browser Compatibility

Works in:

- Chrome/Chromium ✓
- Firefox ✓
- Safari ✓
- Edge ✓
- Any modern browser with JavaScript enabled

## Tips & Tricks

1. **Keyboard Shortcuts**
   - Tab: Move to next field
   - Enter: Save in quick-edit mode
   - Esc: Close modal

2. **Quick Duplication**
   - Edit a similar component
   - Don't click "Save" - note the SR number
   - Click "+ Add Component"
   - Manually increment SR number
   - Paste similar data and modify

3. **Bulk Updates**
   - Open Developer Tools (F12)
   - Run JavaScript to batch edit:

   ```javascript
   bomData.bom_items.forEach(item => {
       if (item.supplier_2 === 'YAGEO') {
           item.supplier_2 = 'NEW_SUPPLIER';
       }
   });
   renderTable();
   ```

4. **Data Validation**
   - SR Number must be unique for best results
   - Item Name should be descriptive
   - Feeder Number format: YSM-###

## Troubleshooting

### Issue: Changes not saving to file

**Solution:** You must click "Save Changes" to download the JSON. Then manually replace the original file or copy-paste the content.

### Issue: File not loading

**Solution:** Ensure `bom-intbuz-r1.1.json` is in the same directory as `bom-editor.html`

### Issue: Can't find a component

**Solution:** Use the search box - search for any field value (feeder, reference, value, etc.)

### Issue: Accidentally deleted a component

**Solution:** Click "Reload" to reload the last saved version, OR have a backup from "Export JSON"

## Advanced: Working with the JSON

If you prefer command-line or text editing:

```bash
# View the BOM
cat bom-intbuz-r1.1.json | jq '.bom_items'

# Add a new component via jq
# (requires jq to be installed)
jq '.bom_items += [{sr_no:20, feeder_number:"YSM-009", ...}]' bom-intbuz-r1.1.json
```

## Support

For issues or feature requests, refer to the main README files:

- BOM_EXTRACTION_COMPLETE.md
- BOM_USAGE_GUIDE.md
- BOM_JSON_PREVIEW.md
