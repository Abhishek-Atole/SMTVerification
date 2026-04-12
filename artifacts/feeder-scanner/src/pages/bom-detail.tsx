import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { useGetBom, useAddBomItem, useDeleteBom, useDeleteBomItem, useUpdateBomItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBomQueryKey, getListBomsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        // We do sequential additions to avoid overloading the API if it's large, though parallel is faster
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
      },
      error: () => {
        setIsUploading(false);
      }
    });
  };

  const handleDeleteBom = () => {
    if (confirm("Are you sure you want to delete this BOM? This action cannot be undone.")) {
      deleteBom.mutate({ bomId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBomsQueryKey() });
          setLocation("/bom");
        }
      });
    }
  };

  const handleDeleteItem = (itemId: number) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteItem.mutate({ bomId, itemId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
        }
      });
    }
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setIsEditDialogOpen(true);
  };

  const handleEditItem = (data: ItemFormData) => {
    if (!editingItem) return;

    updateItem.mutate({
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
        parentItemId: data.parentItemId,
      }
    }, {
      onSuccess: () => {
        setIsEditDialogOpen(false);
        setEditingItem(null);
        queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
      }
    });
  };

  if (isLoading || !bom) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
      <div className="flex justify-between items-start border-b border-border pb-4">
        <div className="flex items-start gap-4">
          <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-16" />
          <div>
            <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground uppercase">{bom.name}</h1>
            <p className="text-muted-foreground mt-2 font-mono">{bom.description}</p>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={handleDeleteBom} className="rounded-sm font-mono" data-testid="btn-delete-bom">
          <Trash2 className="w-4 h-4 mr-2" />
          DELETE BOM
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card p-6 border border-border rounded-sm">
            <h2 className="font-mono font-bold mb-4 border-b border-border pb-2 text-lg">ADD ITEM MANUALLY</h2>
            <div className="space-y-4 font-mono text-sm">
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className="w-full rounded-sm font-bold"
                data-testid="btn-add-item"
              >
                + ADD COMPONENT
              </Button>
              <p className="text-xs text-muted-foreground">
                Click to add a new BOM component with complete manufacturer details
              </p>
            </div>
          </div>

          <div className="bg-card p-6 border border-border rounded-sm">
            <h2 className="font-mono font-bold mb-4 border-b border-border pb-2 text-lg">UPLOAD CSV</h2>
            <p className="text-xs text-muted-foreground mb-4 font-mono">
              Columns: feederNumber, partNumber, description, location, quantity, mpn, manufacturer, packageSize, leadTime, cost
            </p>
            <div className="flex items-center gap-4">
              <Input 
                type="file" 
                accept=".csv" 
                ref={fileInputRef} 
                onChange={handleFileUpload}
                disabled={isUploading}
                className="bg-background text-sm file:text-foreground file:bg-secondary file:border-0 file:rounded-sm file:px-2 file:py-1 rounded-sm cursor-pointer"
              />
              {isUploading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-sm overflow-hidden flex flex-col h-[600px]">
            <div className="bg-secondary/50 p-3 border-b border-border flex justify-between items-center font-mono">
              <span className="font-bold">BOM ITEMS</span>
              <span className="text-muted-foreground text-sm">TOTAL: {bom.items.length}</span>
            </div>
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card border-b border-border z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-mono w-8"></TableHead>
                    <TableHead className="font-mono">FEEDER#</TableHead>
                    <TableHead className="font-mono">PART#</TableHead>
                    <TableHead className="font-mono">MPN</TableHead>
                    <TableHead className="font-mono">MANUFACTURER</TableHead>
                    <TableHead className="font-mono text-right">QTY</TableHead>
                    <TableHead className="font-mono text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.items.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-mono">
                        No items added yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bom.items.map(item => {
                      const isAlternate = item.isAlternate;
                      const expanded = expandedItemId === item.id;
                      return (
                        <tbody key={`group-${item.id}`}>
                          <TableRow className={`border-border ${isAlternate ? 'bg-secondary/20 hover:bg-secondary/30' : 'hover:bg-secondary/30'}`}>
                            <TableCell className="text-center p-2">
                              {(item.mpn || item.manufacturer || item.cost) && (
                                <button
                                  onClick={() => setExpandedItemId(expanded ? null : item.id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ChevronDown 
                                    className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                  />
                                </button>
                              )}
                            </TableCell>
                            <TableCell className={`font-mono font-bold ${isAlternate ? 'text-orange-500' : 'text-primary'}`}>
                              {item.feederNumber}
                            </TableCell>
                            <TableCell className="font-mono">{item.partNumber}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">{item.mpn || '—'}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground max-w-[120px] truncate">{item.manufacturer || '—'}</TableCell>
                            <TableCell className="font-mono text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button 
                                  onClick={() => handleOpenEdit(item)}
                                  variant="outline" 
                                  size="sm" 
                                  className="rounded-sm text-secondary-foreground hover:bg-secondary/70"
                                  data-testid={`btn-edit-item-${item.id}`}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button 
                                  onClick={() => handleDeleteItem(item.id)}
                                  disabled={deleteItem.isPending}
                                  variant="ghost" 
                                  size="sm" 
                                  className="rounded-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                                  data-testid={`btn-delete-item-${item.id}`}
                                >
                                  {deleteItem.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expanded && (item.mpn || item.manufacturer || item.cost || item.leadTime) && (
                            <TableRow className={`border-border ${isAlternate ? 'bg-secondary/20' : 'bg-muted/30'}`}>
                              <TableCell colSpan={7} className="p-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                                  {item.mpn && (
                                    <div>
                                      <div className="text-muted-foreground">MPN</div>
                                      <div className="font-bold text-foreground">{item.mpn}</div>
                                    </div>
                                  )}
                                  {item.manufacturer && (
                                    <div>
                                      <div className="text-muted-foreground">MANUFACTURER</div>
                                      <div className="font-bold text-foreground">{item.manufacturer}</div>
                                    </div>
                                  )}
                                  {item.packageSize && (
                                    <div>
                                      <div className="text-muted-foreground">PACKAGE</div>
                                      <div className="font-bold text-foreground">{item.packageSize}</div>
                                    </div>
                                  )}
                                  {item.cost && (
                                    <div>
                                      <div className="text-muted-foreground">COST</div>
                                      <div className="font-bold text-foreground">${item.cost}</div>
                                    </div>
                                  )}
                                  {item.leadTime && (
                                    <div>
                                      <div className="text-muted-foreground">LEAD TIME</div>
                                      <div className="font-bold text-foreground">{item.leadTime}d</div>
                                    </div>
                                  )}
                                  {item.description && (
                                    <div className="md:col-span-2">
                                      <div className="text-muted-foreground">DESCRIPTION</div>
                                      <div className="font-bold text-foreground">{item.description}</div>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </tbody>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

      <ItemFormModal
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddItem}
        isLoading={addItem.isPending}
        isEditing={false}
        bomItems={bom.items.filter(item => !item.isAlternate)}
      />

      <ItemFormModal
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSubmit={handleEditItem}
        initialData={editingItem ? {
          feederNumber: editingItem.feederNumber,
          partNumber: editingItem.partNumber,
          description: editingItem.description,
          location: editingItem.location,
          quantity: editingItem.quantity,
          mpn: editingItem.mpn,
          manufacturer: editingItem.manufacturer,
          packageSize: editingItem.packageSize,
          leadTime: editingItem.leadTime,
          cost: editingItem.cost,
          isAlternate: editingItem.isAlternate,
          parentItemId: editingItem.parentItemId,
          id: editingItem.id,
        } : undefined}
        isLoading={updateItem.isPending}
        isEditing={true}
        bomItems={bom.items.filter(item => !item.isAlternate)}
      />
      </div>
    </div>
  );
}
