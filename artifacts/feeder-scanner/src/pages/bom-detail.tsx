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
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        for (const row of rows) {
          try {
            await addItem.mutateAsync({
              bomId,
              data: {
                feederNumber: row.feederNumber || row.Feeder || row.feeder || "",
                partNumber: row.partNumber || row.Part || row.part || "",
                description: row.description || row.Desc || "",
                location: row.location || row.Loc || "",
                quantity: Number(row.quantity || row.Qty || 1),
                mpn: row.mpn || row.MPN || "",
                manufacturer: row.manufacturer || row.Mfg || "",
                packageSize: row.packageSize || row.Package || "",
                leadTime: row.leadTime ? Number(row.leadTime) : undefined,
                cost: row.cost || row.Cost || "",
              }
            });
          } catch (err) {
            console.error("Failed to add row", row, err);
          }
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
        <div className="flex justify-between items-start max-w-full">
          <div className="flex-1">
            <h1 className="text-3xl font-mono font-bold text-foreground">{bom.name}</h1>
            {bom.description && (
              <p className="text-muted-foreground mt-2 font-mono">{bom.description}</p>
            )}
            <p className="text-sm text-muted-foreground mt-3 font-mono flex gap-6">
              <span>Total Items: <span className="font-bold text-foreground">{bom.items.length}</span></span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              variant="outline"
              className="rounded-sm font-mono"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? "UPLOADING..." : "IMPORT CSV"}
            </Button>
            <ItemFormModal
              bomId={bomId}
              onSubmit={handleAddItem}
              trigger={
                <Button className="rounded-sm font-mono">
                  + ADD ITEM
                </Button>
              }
            />
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
              <ItemFormModal
                bomId={bomId}
                onSubmit={handleAddItem}
                trigger={
                  <Button className="rounded-sm font-mono">
                    + ADD FIRST ITEM
                  </Button>
                }
              />
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
          bomId={bomId}
          item={editingItem}
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
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          trigger={<div />}
        />
      )}
    </div>
  );
}
