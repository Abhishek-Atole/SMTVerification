# BOM JSON Usage Guide

## File Location

`bom-intbuz-r1.1.json` - Located in SMTVerification root directory

## Quick Reference

### Access BOM Data in JavaScript/Node.js

```javascript
// Load the BOM
const fs = require('fs');
const bom = JSON.parse(fs.readFileSync('bom-intbuz-r1.1.json', 'utf8'));

// Get metadata
console.log(`Project: ${bom.metadata.part_name}`);
console.log(`BOM Number: ${bom.metadata.bom_number}`);
console.log(`Total Items: ${bom.summary.total_items}`);

// Access individual components
bom.bom_items.forEach(item => {
  console.log(`${item.feeder_number}: ${item.item_name} - Qty: ${item.required_qty}`);
});

// Filter by type
const capacitors = bom.bom_items.filter(item => item.item_name === 'CAPACITOR');
const resistors = bom.bom_items.filter(item => item.item_name === 'RESISTOR');
const ics = bom.bom_items.filter(item => item.item_name.includes('IC'));
const pcbs = bom.bom_items.filter(item => item.item_name === 'PCB');
```

### Get Feeder Information

```javascript
// List all feeders
console.log(bom.summary.feeders);
// Output: ['YSM-001', 'YSM-002', 'YSM-003', 'YSM-004', 'YSM-005', 'YSM-006', 'YSM-007', 'YSM-008']

// Get component for specific feeder
const feederMap = {};
bom.bom_items.forEach(item => {
  feederMap[item.feeder_number] = item;
});

const ysm001 = feederMap['YSM-001'];
console.log(ysm001);
```

### Get Supplier Information

```javascript
// Find all available suppliers
const suppliers = new Set();
bom.bom_items.forEach(item => {
  if (item.supplier_1) suppliers.add(item.supplier_1);
  if (item.supplier_2) suppliers.add(item.supplier_2);
  if (item.supplier_3) suppliers.add(item.supplier_3);
});
console.log(Array.from(suppliers));

// Get part numbers from specific supplier
const yageoItems = bom.bom_items.filter(item => 
  item.supplier_2 === 'YAGEO'
).map(item => ({
  reference: item.reference,
  part_no: item.part_no_2,
  component: `${item.values} (${item.package})`
}));
```

### Generate Part Lists

```javascript
// Generate procurement list
console.log('=== PROCUREMENT LIST ===');
bom.bom_items.forEach(item => {
  console.log(`\n${item.item_name} - ${item.reference}`);
  console.log(`  RDEPL: ${item.rdepl_part_no}`);
  console.log(`  Value: ${item.values}`);
  console.log(`  Package: ${item.package}`);
  if (item.supplier_1 && item.part_no_1) {
    console.log(`  ${item.supplier_1}: ${item.part_no_1}`);
  }
  if (item.supplier_2 && item.part_no_2) {
    console.log(`  ${item.supplier_2}: ${item.part_no_2}`);
  }
});
```

### Access Component Specifications

```javascript
// Get all references for assembly
const references = bom.bom_items
  .filter(item => item.reference)
  .map(item => ({
    reference: item.reference,
    value: item.values,
    package: item.package,
    feeder: item.feeder_number
  }));

console.table(references);
```

## Data Fields Reference

Each BOM item contains:

| Field | Description |
|-------|-------------|
| sr_no | Sequential number from BOM |
| feeder_number | SMT feeder designation (YSM-###) |
| item_name | Component type (CAPACITOR, RESISTOR, etc.) |
| rdepl_part_no | Internal deployment part number |
| required_qty | Quantity needed |
| reference | PCB reference designator (C#, R#, U#) |
| values | Component specification/value |
| package | Component package type (0603, 0805, SO-8, etc.) |
| dnp_parts | Do Not Populate indicator |
| supplier_1/2/3 | Preferred supplier names |
| part_no_1/2/3 | Supplier part numbers |
| remarks | Additional notes |

## Summary Information

The `summary` object contains:

- `total_items`: 9 components
- `components`: Breakdown by type (capacitors, resistors, ICs, PCB)
- `feeders`: List of all SMT feeder positions
- `total_references`: Total unique PCB references

## Metadata Information

The `metadata` object contains:

- BOM title, number, part name
- Revision date
- Customer information
- Project details

## Integration Examples

### Database Insert

```javascript
// Import into database
bom.bom_items.forEach(async (item) => {
  await db.bom_components.create({
    bom_id: bom.metadata.bom_number,
    feeder_number: item.feeder_number,
    component_type: item.item_name,
    reference: item.reference,
    quantity: item.required_qty,
    value: item.values,
    package: item.package,
    suppliers: [item.supplier_1, item.supplier_2, item.supplier_3].filter(Boolean),
    part_numbers: [item.part_no_1, item.part_no_2, item.part_no_3].filter(Boolean)
  });
});
```

### API Endpoint

```javascript
app.get('/api/bom/intbuz', (req, res) => {
  res.json(bom);
});

app.get('/api/bom/intbuz/feeders', (req, res) => {
  res.json(bom.summary.feeders);
});

app.get('/api/bom/intbuz/component/:feeder', (req, res) => {
  const item = bom.bom_items.find(i => i.feeder_number === req.params.feeder);
  res.json(item || { error: 'Not found' });
});
```
