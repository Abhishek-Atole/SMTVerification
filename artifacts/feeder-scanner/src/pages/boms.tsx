import { useState } from "react";
import { useListBoms, useCreateBom, useUpdateBom } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2, Plus, Edit2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBomsQueryKey } from "@workspace/api-client-react";

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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Defensive check: ensure boms is an array
  const bomsArray = Array.isArray(boms) ? boms : [];

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex justify-between items-end border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-4">
          <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-14" />
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

      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-mono">NAME</TableHead>
              <TableHead className="font-mono">DESCRIPTION</TableHead>
              <TableHead className="font-mono text-right">ITEMS</TableHead>
              <TableHead className="font-mono text-right">CREATED</TableHead>
              <TableHead className="font-mono text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bomsArray.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono">
                  No BOMs configured.
                </TableCell>
              </TableRow>
            ) : (
              bomsArray.map(bom => (
                <TableRow key={bom.id} className="border-border hover:bg-secondary/50">
                  <TableCell className="font-mono font-medium">{bom.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{bom.description}</TableCell>
                  <TableCell className="font-mono text-right">{bom.itemCount}</TableCell>
                  <TableCell className="font-mono text-right text-sm text-muted-foreground">
                    {format(new Date(bom.createdAt), "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
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
                        <Link href={`/bom/${bom.id}`}>VIEW ITEMS</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
