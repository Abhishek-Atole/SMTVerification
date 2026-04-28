// @ts-nocheck
import { Fragment, useState } from "react";
import { useListBoms, useCreateBom, useUpdateBom } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2, Plus, Edit2, Search, Download, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBomsQueryKey } from "@workspace/api-client-react";
import { AppLogo } from "@/components/AppLogo";

export default function Boms() {
  const { data: boms, isLoading } = useListBoms();
  const createBom = useCreateBom();
  const updateBom = useUpdateBom();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [exportingBomId, setExportingBomId] = useState<number | null>(null);
  const [duplicatingBomId, setDuplicatingBomId] = useState<number | null>(null);
  const [expandedBomId, setExpandedBomId] = useState<number | null>(null);
  const [loadingItemsBomId, setLoadingItemsBomId] = useState<number | null>(null);
  const [bomItemsById, setBomItemsById] = useState<Record<number, any[]>>({});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    createBom.mutate({ data: { name, description } }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setName("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: getListBomsQueryKey() });
      }
    });
  };

  const handleOpenEdit = (bom: any) => {
    setEditingId(bom.id);
    setEditName(bom.name);
    setEditDescription(bom.description || "");
    setIsEditDialogOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId === null) return;
    
    updateBom.mutate({ bomId: editingId, data: { name: editName, description: editDescription } }, {
      onSuccess: () => {
        setIsEditDialogOpen(false);
        setEditingId(null);
        setEditName("");
        setEditDescription("");
        queryClient.invalidateQueries({ queryKey: getListBomsQueryKey() });
      }
    });
  };

  const handleExportBom = async (bom: any) => {
    try {
      setExportingBomId(bom.id);
      const response = await fetch(`/api/reports/export/bom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "xlsx",
          bomId: bom.id,
          title: bom.name,
        }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bom.name || `BOM-${bom.id}`}-Report.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("BOM export error:", error);
      alert("Failed to export BOM");
    } finally {
      setExportingBomId(null);
    }
  };

  const handleDuplicateBom = async (bom: any) => {
    try {
      setDuplicatingBomId(bom.id);

      const sourceResp = await fetch(`/api/bom/${bom.id}`);
      if (!sourceResp.ok) throw new Error("Failed to load source BOM");
      const sourceBom = await sourceResp.json();

      const createResp = await fetch(`/api/bom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${sourceBom.name} (Copy)`,
          description: sourceBom.description || "",
        }),
      });
      if (!createResp.ok) throw new Error("Failed to create duplicate BOM");
      const newBom = await createResp.json();

      for (const item of sourceBom.items || []) {
        const clonePayload = {
          srNo: item.srNo,
          feederNumber: item.feederNumber,
          partNumber: item.partNumber,
          itemName: item.itemName,
          rdeplyPartNo: item.rdeplyPartNo,
          referenceDesignator: item.referenceDesignator,
          description: item.description,
          location: item.location,
          values: item.values,
          packageDescription: item.packageDescription,
          dnpParts: item.dnpParts,
          supplier1: item.supplier1,
          partNo1: item.partNo1,
          supplier2: item.supplier2,
          partNo2: item.partNo2,
          supplier3: item.supplier3,
          partNo3: item.partNo3,
          remarks: item.remarks,
          quantity: item.quantity ?? 1,
        };

        const addResp = await fetch(`/api/bom/${newBom.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clonePayload),
        });
        if (!addResp.ok) {
          const message = await addResp.text();
          throw new Error(`Failed to copy item ${item.id}: ${message}`);
        }
      }

      queryClient.invalidateQueries({ queryKey: getListBomsQueryKey() });
    } catch (error) {
      console.error("BOM duplicate error:", error);
      alert("Failed to duplicate BOM");
    } finally {
      setDuplicatingBomId(null);
    }
  };

  const handleToggleInlineItems = async (bomId: number) => {
    if (expandedBomId === bomId) {
      setExpandedBomId(null);
      return;
    }

    setExpandedBomId(bomId);
    if (bomItemsById[bomId]) return;

    try {
      setLoadingItemsBomId(bomId);
      const resp = await fetch(`/api/bom/${bomId}`);
      if (!resp.ok) throw new Error("Failed to fetch BOM items");
      const detail = await resp.json();
      setBomItemsById((prev) => ({ ...prev, [bomId]: detail.items || [] }));
    } catch (error) {
      console.error("Inline BOM item load error:", error);
      alert("Failed to load BOM items");
    } finally {
      setLoadingItemsBomId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Defensive check: ensure boms is an array
  const bomsArray = Array.isArray(boms) ? boms : [];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredBoms = bomsArray
    .filter((bom) => {
      if (!normalizedSearch) return true;
      const name = (bom.name || "").toLowerCase();
      const desc = (bom.description || "").toLowerCase();
      return name.includes(normalizedSearch) || desc.includes(normalizedSearch);
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const totalItems = bomsArray.reduce((sum, bom) => sum + (bom.itemCount || 0), 0);

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex justify-between items-end border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-4">
          <AppLogo className="h-14" />
          <div>
            <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">BOM MANAGER</h1>
            <p className="text-muted-foreground mt-2">Manage Bill of Materials for verification</p>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono rounded-sm" data-testid="btn-new-bom">
              <Plus className="w-4 h-4 mr-2" />
              NEW BOM
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground font-mono">
            <DialogHeader>
              <DialogTitle>CREATE NEW BOM</DialogTitle>
              <DialogDescription>
                Create a new Bill of Materials for your verification system
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">BOM Name</Label>
                <Input 
                  id="name" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  required 
                  className="bg-background border-border rounded-sm"
                  data-testid="input-bom-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea 
                  id="desc" 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  className="bg-background border-border rounded-sm"
                  data-testid="input-bom-desc"
                />
              </div>
              <Button type="submit" disabled={createBom.isPending} className="w-full rounded-sm font-bold" data-testid="btn-submit-bom">
                {createBom.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "CREATE"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-card border-border text-foreground font-mono">
            <DialogHeader>
              <DialogTitle>EDIT BOM</DialogTitle>
              <DialogDescription>
                Update the Bill of Materials details
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">BOM Name</Label>
                <Input 
                  id="edit-name" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)} 
                  required 
                  className="bg-background border-border rounded-sm"
                  data-testid="input-edit-bom-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea 
                  id="edit-desc" 
                  value={editDescription} 
                  onChange={(e) => setEditDescription(e.target.value)} 
                  className="bg-background border-border rounded-sm"
                  data-testid="input-edit-bom-desc"
                />
              </div>
              <Button type="submit" disabled={updateBom.isPending} className="w-full rounded-sm font-bold" data-testid="btn-submit-edit-bom">
                {updateBom.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "UPDATE"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-sm p-4">
          <p className="text-xs font-mono text-muted-foreground">TOTAL BOMS</p>
          <p className="text-2xl font-mono font-bold mt-1">{bomsArray.length}</p>
        </div>
        <div className="bg-card border border-border rounded-sm p-4">
          <p className="text-xs font-mono text-muted-foreground">TOTAL BOM ITEMS</p>
          <p className="text-2xl font-mono font-bold mt-1">{totalItems}</p>
        </div>
        <div className="bg-card border border-border rounded-sm p-4">
          <p className="text-xs font-mono text-muted-foreground">VISIBLE AFTER FILTER</p>
          <p className="text-2xl font-mono font-bold mt-1">{filteredBoms.length}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-sm p-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search BOM by name or description..."
            className="bg-background border-border rounded-sm font-mono"
            data-testid="input-search-bom"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-mono">NAME</TableHead>
              <TableHead className="font-mono">REV TAG</TableHead>
              <TableHead className="font-mono">DESCRIPTION</TableHead>
              <TableHead className="font-mono text-right">ITEMS</TableHead>
              <TableHead className="font-mono text-right">CREATED</TableHead>
              <TableHead className="font-mono text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBoms.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                  {bomsArray.length === 0 ? "No BOMs configured." : "No BOMs match your search."}
                </TableCell>
              </TableRow>
            ) : (
              filteredBoms.map(bom => (
                <Fragment key={bom.id}>
                  <TableRow className="border-border hover:bg-orange-50/70 transition-colors">
                    <TableCell className="font-mono font-semibold text-navy">
                      <div className="flex flex-col gap-1">
                        <span className="truncate">{bom.name}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">BOM Card</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700 border border-orange-200">
                          {bom.revisionLabel || "Original"}
                        </span>
                        {bom.isLatest && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-green-700 border border-green-200">
                            Latest
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{bom.description}</TableCell>
                    <TableCell className="font-mono text-right">{bom.itemCount}</TableCell>
                    <TableCell className="font-mono text-right text-sm text-muted-foreground">
                      {format(new Date(bom.createdAt), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end flex-wrap">
                        <Button
                          onClick={() => handleToggleInlineItems(bom.id)}
                          variant="outline"
                          size="sm"
                          className="rounded-sm font-mono"
                          data-testid={`btn-inline-items-${bom.id}`}
                        >
                          {expandedBomId === bom.id ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                          ITEMS
                        </Button>
                        <Button
                          onClick={() => handleExportBom(bom)}
                          variant="outline"
                          size="sm"
                          className="rounded-sm font-mono"
                          disabled={exportingBomId === bom.id}
                          data-testid={`btn-export-bom-${bom.id}`}
                        >
                          {exportingBomId === bom.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                          EXPORT
                        </Button>
                        <Button
                          onClick={() => handleDuplicateBom(bom)}
                          variant="outline"
                          size="sm"
                          className="rounded-sm font-mono"
                          disabled={duplicatingBomId === bom.id}
                          data-testid={`btn-duplicate-bom-${bom.id}`}
                        >
                          {duplicatingBomId === bom.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Copy className="w-4 h-4 mr-1" />}
                          DUPLICATE
                        </Button>
                        <Button
                          onClick={() => handleOpenEdit(bom)}
                          variant="outline"
                          size="sm"
                          className="rounded-sm font-mono"
                          data-testid={`btn-edit-bom-${bom.id}`}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          EDIT
                        </Button>
                        <Button asChild variant="secondary" size="sm" className="rounded-sm font-mono" data-testid={`btn-view-bom-${bom.id}`}>
                          <Link href={`/bom/${bom.id}`}>VIEW</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {expandedBomId === bom.id && (
                    <TableRow className="border-border bg-orange-50/40 hover:bg-orange-50/40">
                      <TableCell colSpan={6} className="py-3">
                        {loadingItemsBomId === bom.id ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading BOM items...
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-xs font-mono text-muted-foreground">INLINE BOM ITEMS ({(bomItemsById[bom.id] || []).length})</div>
                            <div className="overflow-x-auto border border-border rounded-sm">
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-border hover:bg-transparent">
                                    <TableHead className="font-mono text-xs">FEEDER#</TableHead>
                                    <TableHead className="font-mono text-xs">PART#</TableHead>
                                    <TableHead className="font-mono text-xs">DESC</TableHead>
                                    <TableHead className="font-mono text-xs">QTY</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(bomItemsById[bom.id] || []).slice(0, 8).map((item) => (
                                    <TableRow key={item.id} className="border-border hover:bg-transparent">
                                      <TableCell className="font-mono text-xs">{item.feederNumber}</TableCell>
                                      <TableCell className="font-mono text-xs max-w-[260px] truncate" title={item.partNumber}>{item.partNumber}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={item.description}>{item.description || "-"}</TableCell>
                                      <TableCell className="font-mono text-xs">{item.quantity}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            {(bomItemsById[bom.id] || []).length > 8 && (
                              <div className="text-xs text-muted-foreground font-mono">
                                Showing first 8 items. Use VIEW for full list.
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
