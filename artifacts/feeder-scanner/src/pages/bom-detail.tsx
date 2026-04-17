// @ts-nocheck
import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { useGetBom, useAddBomItem, useDeleteBom, useDeleteBomItem, useUpdateBomItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBomQueryKey, getListBomsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Upload, Edit2, ChevronDown } from "lucide-react";
import Papa from "papaparse";
import { useLocation } from "wouter";
import { ItemFormModal, ItemFormData } from "@/components/item-form-modal";

export default function BomDetail() {
  const [, params] = useRoute("/bom/:id");
  const bomId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: bom, isLoading } = useGetBom(bomId, { query: { enabled: !!bomId, queryKey: getGetBomQueryKey(bomId) } });
  const addItem = useAddBomItem();
  const deleteItem = useDeleteBomItem();
  const updateItem = useUpdateBomItem();
  const deleteBom = useDeleteBom();

  const [feederNumber, setFeederNumber] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [locationField, setLocationField] = useState("");
  const [quantity, setQuantity] = useState("1");

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleAddItem = (data: ItemFormData) => {
    addItem.mutate({ 
      bomId, 
      data: {
        feederNumber: data.feederNumber,
        partNumber: data.partNumber, 
        description: data.description,
        location: data.location,
        quantity: data.quantity,
        mpn: data.mpn,
        manufacturer: data.manufacturer,
        packageSize: data.packageSize,
        leadTime: data.leadTime,
        cost: data.cost,
        isAlternate: data.isAlternate,
        parentItemId: data.parentItemId,
      }
    }, {
      onSuccess: () => {
        setIsAddDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
      }
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    Papa.parse(file, {
      header: false,
      skipEmptyLines: false,
      complete: async (results) => {
        const allRows = results.data as any[];
        let headerRowIndex = -1;
        let headerMap: { [key: string]: number } = {};
        
        // Step 1: Find the header row by looking for key column names
        for (let i = 0; i < allRows.length; i++) {
          const row = allRows[i];
          if (!Array.isArray(row) || row.length === 0) continue;
          
          const rowStr = row.map(cell => String(cell || '').toLowerCase()).join('|');
          
          // Check for header row indicators - look for multiple known headers
          const hasFeeder = rowStr.includes('feeder');
          const hasItem = rowStr.includes('item');
          const hasSr = rowStr.includes('sr');
          const hasQty = rowStr.includes('qty') || rowStr.includes('required');
          const hasRef = rowStr.includes('reference') || rowStr.includes('designator');
          
          if ((hasFeeder && hasItem && hasSr) || (hasFeeder && hasItem && hasQty)) {
            headerRowIndex = i;
            
            // Map all 16 CSV fields
            row.forEach((cell: any, idx: number) => {
              const cellLower = String(cell || '').toLowerCase().trim();
              
              // SR NO
              if (cellLower.includes('sr') && cellLower.includes('no')) {
                headerMap['srNo'] = idx;
              }
              // Feeder Number
              else if (cellLower.includes('feeder')) {
                headerMap['feederNumber'] = idx;
              }
              // Item Name
              else if (cellLower.includes('item') && cellLower.includes('name')) {
                headerMap['itemName'] = idx;
              }
              // RDEPL Part No 
              else if (cellLower.includes('rdepl')) {
                headerMap['rdeplyPartNo'] = idx;
              }
              // Required Qty
              else if ((cellLower.includes('qty') || cellLower.includes('quantity') || cellLower.includes('required')) && cellLower.includes('qty') || cellLower.includes('quantity')) {
                if (!headerMap['quantity']) headerMap['quantity'] = idx;
              }
              // Reference Designator
              else if (cellLower.includes('reference') && (cellLower.includes('designator') || cellLower.includes('ref'))) {
                headerMap['referenceDesignator'] = idx;
              }
              // Values
              else if (cellLower.includes('value') && !cellLower.includes('require')) {
                headerMap['values'] = idx;
              }
              // Package/Description
              else if (cellLower.includes('package') && cellLower.includes('description')) {
                headerMap['packageDescription'] = idx;
              }
              // DNP Parts
              else if (cellLower.includes('dnp')) {
                headerMap['dnpParts'] = idx;
              }
              // Suppliers and Part Numbers
              else if (cellLower.includes('make') || cellLower.includes('supplier')) {
                if (!headerMap['supplier1'] && (cellLower.includes('1') || !cellLower.includes('2') && !cellLower.includes('3'))) {
                  headerMap['supplier1'] = idx;
                } else if (!headerMap['supplier2'] && cellLower.includes('2')) {
                  headerMap['supplier2'] = idx;
                } else if (!headerMap['supplier3']) {
                  headerMap['supplier3'] = idx;
                }
              }
              else if (cellLower.includes('part') && cellLower.includes('no')) {
                if (!headerMap['partNo1'] && (cellLower.includes('1') || !cellLower.includes('2') && !cellLower.includes('3'))) {
                  headerMap['partNo1'] = idx;
                  headerMap['partNumber'] = idx; // Also set partNumber for backward compat
                } else if (!headerMap['partNo2']) {
                  headerMap['partNo2'] = idx;
                } else if (!headerMap['partNo3']) {
                  headerMap['partNo3'] = idx;
                }
              }
              // Remarks
              else if (cellLower.includes('remark') || cellLower.includes('note')) {
                headerMap['remarks'] = idx;
              }
            });
            break;
          }
        }
        
        // Step 2: Process data rows
        if (headerRowIndex >= 0) {
          const dataStartIndex = headerRowIndex + 1;
          const dataRows = allRows.slice(dataStartIndex);
          
          let successCount = 0;
          let errorCount = 0;
          
          // Collect all items first
          const itemsToAdd: any[] = [];
          
          for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
            const row = dataRows[rowIdx];
            
            // Skip empty rows or non-array rows
            if (!Array.isArray(row) || row.length === 0) continue;
            if (row.every(cell => !cell || String(cell).trim().length === 0)) continue;
            
            try {
              // Extract all 16 CSV fields
              const srNo = String(row[headerMap['srNo'] ?? -1] || '').trim();
              const feederNumber = String(row[headerMap['feederNumber'] ?? 0] || '').trim();
              const itemName = String(row[headerMap['itemName'] ?? 2] || '').trim();
              const rdeplyPartNo = String(row[headerMap['rdeplyPartNo'] ?? 3] || '').trim();
              const quantity = parseInt(String(row[headerMap['quantity'] ?? 4] || '1')) || 1;
              const referenceDesignator = String(row[headerMap['referenceDesignator'] ?? 5] || '').trim();
              const values = String(row[headerMap['values'] ?? 6] || '').trim();
              const packageDescription = String(row[headerMap['packageDescription'] ?? 7] || '').trim();
              const dnpParts = String(row[headerMap['dnpParts'] ?? 8] || '').toLowerCase().includes('yes') || 
                               String(row[headerMap['dnpParts'] ?? 8] || '').toLowerCase() === 'x';
              const supplier1 = String(row[headerMap['supplier1'] ?? 9] || '').trim();
              const partNo1 = String(row[headerMap['partNo1'] ?? 10] || '').trim();
              const supplier2 = String(row[headerMap['supplier2'] ?? 11] || '').trim();
              const partNo2 = String(row[headerMap['partNo2'] ?? 12] || '').trim();
              const supplier3 = String(row[headerMap['supplier3'] ?? 13] || '').trim();
              const partNo3 = String(row[headerMap['partNo3'] ?? 14] || '').trim();
              const remarks = String(row[headerMap['remarks'] ?? 15] || '').trim();
              
              // Legacy/fallback fields
              const partNumber = partNo1 || itemName || '';
              
              // Validation: require feederNumber
              if (!feederNumber) {
                continue;
              }
              
              // Skip metadata/footer rows
              if (feederNumber.toLowerCase().includes('revision') || 
                  feederNumber.toLowerCase().includes('sr.no') ||
                  feederNumber.toLowerCase().includes('prepared')) {
                continue;
              }
              
              // Collect item for batch processing instead of await
              itemsToAdd.push({
                bomId,
                data: {
                  // 16-field CSV data
                  srNo: srNo || undefined,
                  feederNumber,
                  itemName: itemName || undefined,
                  rdeplyPartNo: rdeplyPartNo || undefined,
                  referenceDesignator: referenceDesignator || undefined,
                  values: values || undefined,
                  packageDescription: packageDescription || undefined,
                  dnpParts: dnpParts,
                  supplier1: supplier1 || undefined,
                  partNo1: partNo1 || undefined,
                  supplier2: supplier2 || undefined,
                  partNo2: partNo2 || undefined,
                  supplier3: supplier3 || undefined,
                  partNo3: partNo3 || undefined,
                  remarks: remarks || undefined,
                  
                  // Legacy fields for backward compatibility
                  partNumber: partNumber,
                  description: itemName || values,
                  location: referenceDesignator,
                  quantity: Math.max(1, quantity),
                  mpn: partNo1 || rdeplyPartNo,
                  manufacturer: supplier1,
                  packageSize: packageDescription,
                }
              });
            } catch (err) {
              errorCount++;
            }
          }
          
          // Process items in parallel batches for better performance
          const BATCH_SIZE = 5;
          for (let i = 0; i < itemsToAdd.length; i += BATCH_SIZE) {
            const batch = itemsToAdd.slice(i, i + BATCH_SIZE);
            try {
              await Promise.all(batch.map(item => addItem.mutateAsync(item)));
              successCount += batch.length;
            } catch (err) {
              errorCount += batch.length;
            }
          }
          
          alert(`Import complete!\n✓ ${successCount} items added\n✗ ${errorCount} items failed`);
        } else {
          alert("❌ Could not find header row. Make sure the CSV has standard BOM column headers.");
        }
        
        queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (id: number) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteItem.mutate({ bomId, itemId: id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
        }
      });
    }
  };

  const handleDeleteBom = () => {
    if (confirm("Delete this BOM and ALL its items? This cannot be undone.")) {
      deleteBom.mutate({ bomId }, {
        onSuccess: () => setLocation("/boms")
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bom) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground font-mono">BOM not found</p>
        <Button onClick={() => setLocation("/boms")} className="mt-4 rounded-sm font-mono">Back to BOMs</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-8 pb-4 border-b border-border bg-card/50">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h1 className="text-3xl font-mono font-bold text-foreground">{bom.name}</h1>
            {bom.description && (
              <p className="text-muted-foreground mt-2 font-mono">{bom.description}</p>
            )}
            <p className="text-sm text-muted-foreground mt-3 font-mono">
              Total Items: <span className="font-bold text-foreground">{bom.items.length}</span>
            </p>
          </div>
          <Button 
            onClick={() => setIsAddDialogOpen(true)}
            size="lg" 
            className="rounded-sm font-mono font-bold text-base bg-green-600 hover:bg-green-700 text-white"
          >
            ➕ ADD ITEM
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            variant="outline"
            className="rounded-sm font-mono"
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? "UPLOADING..." : "IMPORT CSV"}
          </Button>
          <Button 
            onClick={handleDeleteBom}
            disabled={deleteBom.isPending}
            variant="destructive"
            size="sm"
            className="rounded-sm font-mono"
          >
            DELETE BOM
          </Button>
        </div>
        <input 
          type="file" 
          accept=".csv" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          style={{ display: 'none' }}
        />
      </div>

      <div className="flex-1 overflow-auto p-8">
        {bom.items.length === 0 ? (
          <div className="flex items-center justify-center h-96 border-2 border-dashed border-border rounded-lg">
            <div className="text-center">
              <p className="text-muted-foreground font-mono mb-4">No items added yet</p>
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className="rounded-sm font-mono"
              >
                + ADD FIRST ITEM
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-max">
            {bom.items.map((item) => (
              <div
                key={item.id}
                className={`p-5 rounded-lg border-2 transition-all hover:shadow-md ${
                  item.isAlternate
                    ? "bg-orange-50/50 dark:bg-orange-950/20 border-orange-300/50 dark:border-orange-700/50"
                    : "bg-card border-border hover:border-primary/50"
                }`}
              >
                {/* Header with Feeder and Part */}
                <div className="mb-4 pb-4 border-b border-border/50">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground font-mono">FEEDER #</p>
                      <p className={`text-lg font-bold font-mono ${item.isAlternate ? "text-orange-600 dark:text-orange-400" : "text-primary"}`}>
                        {item.feederNumber}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        onClick={() => handleOpenEdit(item)}
                        size="sm"
                        variant="outline"
                        className="rounded-sm h-8 w-8 p-0"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteItem(item.id)}
                        size="sm"
                        variant="ghost"
                        className="rounded-sm h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      >
                        {deleteItem.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-mono">PART #</p>
                    <p className="font-bold font-mono text-foreground truncate">{item.partNumber}</p>
                  </div>
                </div>

                {/* Main Details */}
                <div className="space-y-3 mb-4">
                  {item.description && (
                    <div>
                      <p className="text-xs text-muted-foreground font-mono mb-1">DESCRIPTION</p>
                      <p className="text-sm font-mono text-foreground line-clamp-2">{item.description}</p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground font-mono mb-1">QUANTITY</p>
                      <p className="font-bold font-mono text-lg text-primary">{item.quantity}</p>
                    </div>
                    {item.location && (
                      <div>
                        <p className="text-xs text-muted-foreground font-mono mb-1">LOCATION</p>
                        <p className="font-mono text-sm text-foreground">{item.location}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Details Grid - Only show if data exists */}
                {(item.mpn || item.manufacturer || item.packageSize || item.cost || item.leadTime) && (
                  <div className="border-t border-border/50 pt-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {item.mpn && (
                        <div className="bg-secondary/30 rounded p-2">
                          <p className="text-muted-foreground font-mono mb-1">MPN</p>
                          <p className="font-bold font-mono text-foreground truncate">{item.mpn}</p>
                        </div>
                      )}
                      {item.manufacturer && (
                        <div className="bg-secondary/30 rounded p-2">
                          <p className="text-muted-foreground font-mono mb-1">MFG</p>
                          <p className="font-bold font-mono text-foreground truncate">{item.manufacturer}</p>
                        </div>
                      )}
                      {item.packageSize && (
                        <div className="bg-secondary/30 rounded p-2">
                          <p className="text-muted-foreground font-mono mb-1">PACKAGE</p>
                          <p className="font-bold font-mono text-foreground">{item.packageSize}</p>
                        </div>
                      )}
                      {item.cost && (
                        <div className="bg-secondary/30 rounded p-2">
                          <p className="text-muted-foreground font-mono mb-1">COST</p>
                          <p className="font-bold font-mono text-primary">${item.cost}</p>
                        </div>
                      )}
                      {item.leadTime && (
                        <div className="bg-secondary/30 rounded p-2">
                          <p className="text-muted-foreground font-mono mb-1">LEAD TIME</p>
                          <p className="font-bold font-mono">{item.leadTime}d</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Alternate Badge */}
                {item.isAlternate && (
                  <div className="mt-3 text-xs font-bold text-orange-600 dark:text-orange-400 font-mono bg-orange-100/30 dark:bg-orange-900/30 rounded px-2 py-1 text-center">
                    ALTERNATE PART
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isEditDialogOpen && editingItem && (
        <ItemFormModal
          open={isEditDialogOpen}
          onOpenChange={handleCloseEditDialog}
          onSubmit={(data) => {
            updateItem.mutate(
              {
                bomId,
                itemId: editingItem.id,
                data: {
                  feederNumber: data.feederNumber,
                  partNumber: data.partNumber,
                  description: data.description,
                  location: data.location,
                  quantity: data.quantity,
                  mpn: data.mpn,
                  manufacturer: data.manufacturer,
                  packageSize: data.packageSize,
                  leadTime: data.leadTime,
                  cost: data.cost,
                  isAlternate: data.isAlternate,
                }
              },
              {
                onSuccess: () => {
                  setIsEditDialogOpen(false);
                  setEditingItem(null);
                  queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
                }
              }
            );
          }}
          isEditing={true}
          initialData={editingItem}
          bomItems={bom.items}
          isLoading={updateItem.isPending}
        />
      )}

      <ItemFormModal
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={(data) => {
          addItem.mutate({ 
            bomId, 
            data: {
              feederNumber: data.feederNumber,
              partNumber: data.partNumber,
              description: data.description,
              location: data.location,
              quantity: data.quantity,
              mpn: data.mpn,
              manufacturer: data.manufacturer,
              packageSize: data.packageSize,
              leadTime: data.leadTime,
              cost: data.cost,
              isAlternate: data.isAlternate,
              parentItemId: data.parentItemId,
            }
          }, {
            onSuccess: () => {
              setIsAddDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
            }
          });
        }}
        bomItems={bom.items}
        isLoading={addItem.isPending}
      />
    </div>
  );
}
