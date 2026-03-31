import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { useGetBom, useAddBomItem, useDeleteBom } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBomQueryKey, getListBomsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trash2, Upload } from "lucide-react";
import Papa from "papaparse";
import { useLocation } from "wouter";

export default function BomDetail() {
  const [, params] = useRoute("/bom/:id");
  const bomId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: bom, isLoading } = useGetBom(bomId, { query: { enabled: !!bomId, queryKey: getGetBomQueryKey(bomId) } });
  const addItem = useAddBomItem();
  const deleteBom = useDeleteBom();

  const [feederNumber, setFeederNumber] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [locationField, setLocationField] = useState("");
  const [quantity, setQuantity] = useState("1");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    addItem.mutate({ 
      bomId, 
      data: { feederNumber, partNumber, description, location: locationField, quantity: Number(quantity) } 
    }, {
      onSuccess: () => {
        setFeederNumber("");
        setPartNumber("");
        setDescription("");
        setLocationField("");
        setQuantity("1");
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
                quantity: Number(row.quantity || row.Qty || 1)
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
        <div>
          <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground uppercase">{bom.name}</h1>
          <p className="text-muted-foreground mt-2 font-mono">{bom.description}</p>
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
            <form onSubmit={handleAddItem} className="space-y-4 font-mono text-sm">
              <div className="space-y-2">
                <Label>Feeder Number *</Label>
                <Input value={feederNumber} onChange={e => setFeederNumber(e.target.value)} required className="bg-background rounded-sm" />
              </div>
              <div className="space-y-2">
                <Label>Part Number *</Label>
                <Input value={partNumber} onChange={e => setPartNumber(e.target.value)} required className="bg-background rounded-sm" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} className="bg-background rounded-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={locationField} onChange={e => setLocationField(e.target.value)} className="bg-background rounded-sm" />
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required className="bg-background rounded-sm" />
                </div>
              </div>
              <Button type="submit" disabled={addItem.isPending} className="w-full rounded-sm font-bold mt-2">
                {addItem.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "ADD TO BOM"}
              </Button>
            </form>
          </div>

          <div className="bg-card p-6 border border-border rounded-sm">
            <h2 className="font-mono font-bold mb-4 border-b border-border pb-2 text-lg">UPLOAD CSV</h2>
            <p className="text-xs text-muted-foreground mb-4 font-mono">
              Columns: feederNumber, partNumber, description, location, quantity
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
                    <TableHead className="font-mono">FEEDER#</TableHead>
                    <TableHead className="font-mono">PART#</TableHead>
                    <TableHead className="font-mono">DESCRIPTION</TableHead>
                    <TableHead className="font-mono">LOC</TableHead>
                    <TableHead className="font-mono text-right">QTY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.items.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-mono">
                        No items added yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bom.items.map(item => (
                      <TableRow key={item.id} className="border-border hover:bg-secondary/30">
                        <TableCell className="font-mono font-bold text-primary">{item.feederNumber}</TableCell>
                        <TableCell className="font-mono">{item.partNumber}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{item.description}</TableCell>
                        <TableCell className="font-mono text-sm">{item.location}</TableCell>
                        <TableCell className="font-mono text-right">{item.quantity}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
