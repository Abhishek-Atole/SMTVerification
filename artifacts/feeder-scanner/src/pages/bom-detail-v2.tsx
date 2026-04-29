import { useState, useRef, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Trash2, Upload, ChevronLeft, Plus, FileText, Eye, Edit2, 
  RotateCcw, Check, X, AlertTriangle, Copy, History, BadgeCheck, GitBranch
} from "lucide-react";
import Papa from "papaparse";
import { appConfig } from "@/lib/appConfig";
import { format } from "date-fns";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface BomItemRow {
  id: number;
  bomId: number;
  srNo: string | null;
  feederNumber: string;
  ucalIntPn: string | null;
  quantity: string | number;
  reference: string | null;
  description: string | null;
  package: string | null;
  make1: string | null;
  mpn1: string | null;
  make2: string | null;
  mpn2: string | null;
  make3: string | null;
  mpn3: string | null;
  remarks: string | null;
  action: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
}

interface BomData {
  id: number;
  name: string;
  description: string | null;
  revisionLabel: string | null;
  parentBomId: number | null;
  revisionNotes: string | null;
  isLatest: boolean;
  itemCount: number;
  makesCount: number;
  createdAt: string;
  createdBy: string | null;
}

interface RevisionInfo {
  id: number;
  name: string;
  revisionLabel: string | null;
  isLatest: boolean;
  createdAt?: string;
  revisionNotes?: string | null;
  parentBomId?: number | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function BomDetailV2() {
  const [, params] = useRoute("/bom/:id");
  const bomId = Number(params?.id);
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ========== MODE MANAGEMENT ==========
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const isEditMode = mode === 'edit';
  const isViewMode = mode === 'view';

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    setMode(modeParam === 'edit' ? 'edit' : 'view');
    setCurrentPage(1); // Reset to first page when switching modes
  }, [location]);

  const switchToEditMode = () => {
    setMode('edit');
    setLocation(`/bom/${bomId}?mode=edit`);
  };

  const switchToViewMode = () => {
    setMode('view');
    setLocation(`/bom/${bomId}?mode=view`);
  };

  // ========== DATA FETCHING ==========
  const [bomData, setBomData] = useState<BomData | null>(null);
  const [items, setItems] = useState<BomItemRow[]>([]);
  const [trashItems, setTrashItems] = useState<BomItemRow[]>([]);
  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [items, currentPage, pageSize]);

  const totalPages = Math.ceil(items.length / pageSize);

  const latestRevision = useMemo(() => {
    return revisions.find((rev) => rev.isLatest) || null;
  }, [revisions]);

  useEffect(() => {
    if (!bomId) return;
    fetchBomData();
    setCurrentPage(1); // Reset to first page when data changes
  }, [bomId]);

  const fetchBomData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch BOM
      const bomRes = await fetch(`http://localhost:3000/api/boms/${bomId}`);
      if (!bomRes.ok) throw new Error("Failed to fetch BOM");
      const bom = await bomRes.json();
      setBomData(bom);

      // Fetch active items
      const itemsRes = await fetch(`http://localhost:3000/api/bom-items?bom_id=${bomId}`);
      if (!itemsRes.ok) throw new Error("Failed to fetch items");
      const itemsData = await itemsRes.json();
      setItems(itemsData || []);

      // Fetch trash items
      const trashRes = await fetch(`http://localhost:3000/api/bom-items/trash?bom_id=${bomId}`);
      if (!trashRes.ok) throw new Error("Failed to fetch trash");
      const trashData = await trashRes.json();
      setTrashItems(trashData || []);

      // Fetch revisions
      try {
        const revisionsRes = await fetch(`http://localhost:3000/api/boms/${bomId}/revisions`);
        if (revisionsRes.ok) {
          const revisionsData = await revisionsRes.json();
          setRevisions(revisionsData || []);
        }
      } catch (e) {
        console.warn("Failed to fetch revisions:", e);
      }
    } catch (error) {
      console.error("Error fetching BOM data:", error);
      toast({
        title: "Error",
        description: "Failed to load BOM data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ========== FORM STATE FOR NEW ITEM ==========
  const [newItem, setNewItem] = useState({
    srNo: "",
    feederNumber: "",
    ucalIntPn: "",
    quantity: "1",
    reference: "",
    description: "",
    package: "",
    make1: "", mpn1: "",
    make2: "", mpn2: "",
    make3: "", mpn3: "",
    remarks: "",
    action: "",
  });

  // ========== INLINE EDIT STATE ==========
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<BomItemRow> | null>(null);

  // ========== TRASH & MODALS ==========
  const [showTrash, setShowTrash] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState<number | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionForm, setRevisionForm] = useState({ label: "", notes: "" });
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);

  const normalizeHeader = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");

  const cleanCell = (value: string) => value.replace(/\s+/g, " ").trim();

  const findColumnIndex = (row: string[], aliases: string[]) => {
    const normalizedAliases = aliases.map((a) => normalizeHeader(a));
    return row.findIndex((cell) => {
      const normalizedCell = normalizeHeader(cell);
      return normalizedAliases.some(
        (alias) => normalizedCell === alias || normalizedCell.includes(alias),
      );
    });
  };

  // ========== BUTTON STYLE CLASSES ==========
  const btnPrimary = "bg-orange-500 hover:bg-orange-600 text-white border-0";
  const btnSecondary = "bg-orange-500 hover:bg-orange-600 text-white border-0";
  const btnDanger = "bg-orange-500 hover:bg-orange-600 text-white border-0";
  const btnRestore = "bg-orange-500 hover:bg-orange-600 text-white border-0";
  const btnIcon = "p-1 bg-orange-500 hover:bg-orange-600 text-white rounded-md border-0";

  // ========== FORM HANDLERS ==========

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      bomId,
      srNo: newItem.srNo || undefined,
      feederNumber: newItem.feederNumber,
      ucalIntPn: newItem.ucalIntPn || undefined,
      quantity: newItem.quantity,
      reference: newItem.reference || undefined,
      description: newItem.description || undefined,
      package: newItem.package || undefined,
      make1: newItem.make1 || undefined,
      mpn1: newItem.mpn1 || undefined,
      make2: newItem.make2 || undefined,
      mpn2: newItem.mpn2 || undefined,
      make3: newItem.make3 || undefined,
      mpn3: newItem.mpn3 || undefined,
      remarks: newItem.remarks || undefined,
      action: newItem.action || undefined,
    };

    try {
      const res = await fetch("http://localhost:3000/api/bom-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to add item");

      toast({ title: "Success", description: "Item added to BOM" });
      setNewItem({
        srNo: "", feederNumber: "", ucalIntPn: "", quantity: "1",
        reference: "", description: "", package: "",
        make1: "", mpn1: "", make2: "", mpn2: "", make3: "", mpn3: "",
        remarks: "", action: "",
      });
      fetchBomData();
    } catch (error) {
      console.error("Error adding item:", error);
      toast({ title: "Error", description: "Failed to add item", variant: "destructive" });
    }
  };

  const startEditItem = (item: BomItemRow) => {
    setEditingItemId(item.id);
    setEditingItem({ ...item });
  };

  const saveEditedItem = async () => {
    if (!editingItemId || !editingItem) return;

    try {
      const res = await fetch(`http://localhost:3000/api/bom-items/${editingItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingItem),
      });

      if (!res.ok) throw new Error("Failed to update item");

      toast({ title: "Success", description: "Item updated" });
      setEditingItemId(null);
      setEditingItem(null);
      fetchBomData();
    } catch (error) {
      console.error("Error updating item:", error);
      toast({ title: "Error", description: "Failed to update item", variant: "destructive" });
    }
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditingItem(null);
  };

  const deleteItem = async (itemId: number) => {
    try {
      const res = await fetch(`http://localhost:3000/api/bom-items/${itemId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error("Failed to delete item");

      toast({ title: "Success", description: "Item moved to trash" });
      setShowDeleteConfirm(null);
      fetchBomData();
    } catch (error) {
      console.error("Error deleting item:", error);
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    }
  };

  const restoreItem = async (itemId: number) => {
    try {
      const res = await fetch(`http://localhost:3000/api/bom-items/${itemId}/restore`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error("Failed to restore item");

      toast({ title: "Success", description: "Item restored" });
      fetchBomData();
    } catch (error) {
      console.error("Error restoring item:", error);
      toast({ title: "Error", description: "Failed to restore item", variant: "destructive" });
    }
  };

  const permanentlyDeleteItem = async (itemId: number) => {
    try {
      const res = await fetch(`http://localhost:3000/api/bom-items/${itemId}/permanent`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error("Failed to permanently delete");

      toast({ title: "Success", description: "Item permanently deleted" });
      setShowPermanentDeleteConfirm(null);
      fetchBomData();
    } catch (error) {
      console.error("Error permanently deleting:", error);
      toast({ title: "Error", description: "Failed to permanently delete", variant: "destructive" });
    }
  };

  const createRevision = async () => {
    if (!revisionForm.label) {
      toast({ title: "Error", description: "Revision label is required", variant: "destructive" });
      return;
    }

    setIsCreatingRevision(true);
    try {
      const res = await fetch(`http://localhost:3000/api/boms/${bomId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revisionLabel: revisionForm.label,
          revisionNotes: revisionForm.notes || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create revision");
      }

      const newBom = await res.json();
      toast({ title: "Success", description: "New revision created" });
      setShowRevisionModal(false);
      setRevisionForm({ label: "", notes: "" });
      setLocation(`/bom/${newBom.id}?mode=view`);
    } catch (error) {
      console.error("Error creating revision:", error);
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create revision", variant: "destructive" });
    } finally {
      setIsCreatingRevision(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    Papa.parse(file, {
      header: false,
      skipEmptyLines: false,
      complete: async (results) => {
        try {
          const rawRows = (results.data as string[][]).map((row) =>
            row.map((cell) => (cell ?? "").toString().trim()),
          );

          const feederAliases = [
            "feedernumber",
            "feeder",
            "feeder no",
            "feeder no.",
            "feeder number",
          ];
          const ucalIntPnAliases = [
            "ucalinternalpartnumber",
            "internalpartnumber",
            "internal no",
            "partnumber",
            "part number",
            "part no",
          ];
          const descriptionAliases = ["description", "desc", "componentvalues", "component value"];
          const packageAliases = ["packagedescription", "package description", "package"];
          const referenceAliases = ["reference", "ref", "referencelocation"];
          const quantityAliases = ["quantity", "qty", "requiredqty"];
          const make1Aliases = ["make1", "make/supplier1", "supplier1"];
          const mpn1Aliases = ["mpn1", "mpn"];
          const make2Aliases = ["make2", "make/supplier2", "supplier2"];
          const mpn2Aliases = ["mpn2"];
          const make3Aliases = ["make3", "make/supplier3", "supplier3"];
          const mpn3Aliases = ["mpn3"];
          const remarksAliases = ["remarks", "remark", "comments"];
          const actionAliases = ["action", "dnp"];

          let headerIndex = -1;
          let feederIndex = -1;
          let ucalIntPnIndex = -1;
          let descriptionIndex = -1;
          let packageIndex = -1;
          let referenceIndex = -1;
          let quantityIndex = -1;
          let make1Index = -1;
          let mpn1Index = -1;
          let make2Index = -1;
          let mpn2Index = -1;
          let make3Index = -1;
          let mpn3Index = -1;
          let remarksIndex = -1;
          let actionIndex = -1;

          // Find header row
          for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            const maybeFeederIndex = findColumnIndex(row, feederAliases);
            if (maybeFeederIndex !== -1) {
              headerIndex = i;
              feederIndex = maybeFeederIndex;
              ucalIntPnIndex = findColumnIndex(row, ucalIntPnAliases);
              descriptionIndex = findColumnIndex(row, descriptionAliases);
              packageIndex = findColumnIndex(row, packageAliases);
              referenceIndex = findColumnIndex(row, referenceAliases);
              quantityIndex = findColumnIndex(row, quantityAliases);
              make1Index = findColumnIndex(row, make1Aliases);
              mpn1Index = findColumnIndex(row, mpn1Aliases);
              make2Index = findColumnIndex(row, make2Aliases);
              mpn2Index = findColumnIndex(row, mpn2Aliases);
              make3Index = findColumnIndex(row, make3Aliases);
              mpn3Index = findColumnIndex(row, mpn3Aliases);
              remarksIndex = findColumnIndex(row, remarksAliases);
              actionIndex = findColumnIndex(row, actionAliases);
              break;
            }
          }

          if (headerIndex === -1) {
            toast({
              title: "Error",
              description: "Could not find header row with 'Feeder Number' column",
              variant: "destructive",
            });
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
          }

          let importedCount = 0;
          let skippedCount = 0;

          for (let i = headerIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            const feederNumber = cleanCell(row[feederIndex] ?? "");

            if (!feederNumber) {
              skippedCount++;
              continue;
            }

            const payload = {
              bomId,
              srNo: undefined as string | undefined,
              feederNumber,
              ucalIntPn: ucalIntPnIndex >= 0 ? cleanCell(row[ucalIntPnIndex] ?? "") || undefined : undefined,
              quantity: quantityIndex >= 0 && row[quantityIndex] ? Number(row[quantityIndex]) || 1 : 1,
              reference: referenceIndex >= 0 ? cleanCell(row[referenceIndex] ?? "") || undefined : undefined,
              description: descriptionIndex >= 0 ? cleanCell(row[descriptionIndex] ?? "") || undefined : undefined,
              package: packageIndex >= 0 ? cleanCell(row[packageIndex] ?? "") || undefined : undefined,
              make1: make1Index >= 0 ? cleanCell(row[make1Index] ?? "") || undefined : undefined,
              mpn1: mpn1Index >= 0 ? cleanCell(row[mpn1Index] ?? "") || undefined : undefined,
              make2: make2Index >= 0 ? cleanCell(row[make2Index] ?? "") || undefined : undefined,
              mpn2: mpn2Index >= 0 ? cleanCell(row[mpn2Index] ?? "") || undefined : undefined,
              make3: make3Index >= 0 ? cleanCell(row[make3Index] ?? "") || undefined : undefined,
              mpn3: mpn3Index >= 0 ? cleanCell(row[mpn3Index] ?? "") || undefined : undefined,
              remarks: remarksIndex >= 0 ? cleanCell(row[remarksIndex] ?? "") || undefined : undefined,
              action: actionIndex >= 0 ? cleanCell(row[actionIndex] ?? "") || undefined : undefined,
            };

            try {
              const res = await fetch("http://localhost:3000/api/bom-items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (!res.ok) throw new Error("Failed to add item");
              importedCount++;
            } catch (error) {
              console.error("Error adding item from CSV:", error);
              skippedCount++;
            }
          }

          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";

          if (importedCount > 0) {
            toast({
              title: "CSV Import Complete",
              description: `${importedCount} items added${skippedCount > 0 ? `, ${skippedCount} skipped` : ""}`,
            });
            fetchBomData();
          } else {
            toast({
              title: "Import Failed",
              description: `${skippedCount} rows skipped. Check CSV format and try again.`,
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Error processing CSV:", error);
          toast({ title: "Error", description: "Failed to import CSV", variant: "destructive" });
          setIsUploading(false);
        }
      },
    });
  };

  // ========== RENDER HELPERS ==========

  const renderBomHeader = () => (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Button
              onClick={() => setLocation("/bom")}
              className={`${btnSecondary} px-2.5 py-2`}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-3xl font-bold text-navy">{bomData?.name}</h1>
            {bomData?.revisionLabel && (
              <span className="bg-blue-100 text-navy px-3 py-1 rounded-full font-semibold text-sm">
                {bomData.revisionLabel}
              </span>
            )}
          </div>
          {bomData?.description && (
            <p className="text-gray-600 text-sm ml-11">{bomData.description}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-navy">{bomData?.itemCount || 0}</div>
          <div className="text-xs text-gray-500">Items</div>
        </div>
      </div>

      {/* Revision Breadcrumb */}
      {revisions.length > 0 && (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-orange-50 shadow-sm overflow-hidden">
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
                  <History className="h-4 w-4" />
                  Revision Trail
                </div>
                <h3 className="mt-2 text-lg font-bold text-navy">Latest revision card</h3>
                <p className="mt-1 text-sm text-gray-600">
                  The newest revision is highlighted here for quick access.
                </p>
              </div>
              {latestRevision && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm shadow-sm">
                  <div className="flex items-center gap-2 text-green-700 font-bold uppercase tracking-wide text-xs">
                    <BadgeCheck className="h-4 w-4" />
                    Latest Revision
                  </div>
                  <div className="mt-1 text-base font-bold text-green-900">
                    {latestRevision.revisionLabel || "Original"}
                  </div>
                  <div className="text-xs text-green-700">
                    BOM #{latestRevision.id}
                    {latestRevision.createdAt ? ` • ${format(new Date(latestRevision.createdAt), "dd-MMM-yyyy HH:mm")}` : ""}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              <GitBranch className="h-4 w-4" />
              All revisions
            </div>

            <div className="flex flex-wrap gap-3">
              {revisions.map((rev) => {
                const isLatestCard = latestRevision?.id === rev.id;
                return (
                  <button
                    key={rev.id}
                    onClick={() => setLocation(`/bom/${rev.id}?mode=view`)}
                    className={`group min-w-[140px] rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                      isLatestCard
                        ? "border-green-300 bg-green-50 shadow-sm ring-1 ring-green-200 hover:bg-green-100"
                        : "border-blue-200 bg-white hover:border-orange-300 hover:bg-orange-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-navy group-hover:text-orange-700">
                        {rev.revisionLabel || "Original"}
                      </span>
                      {isLatestCard ? (
                        <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Latest
                        </span>
                      ) : (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                          Revision
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      BOM #{rev.id}
                    </div>
                    {rev.createdAt && (
                      <div className="mt-1 text-xs text-gray-500">
                        {format(new Date(rev.createdAt), "dd-MMM-yyyy HH:mm")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mode Toggle & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            onClick={switchToViewMode}
            className={`${btnPrimary} px-4 py-2 rounded-lg`}
          >
            <Eye className="w-4 h-4 mr-2" />
            View Mode
          </Button>
          <Button
            onClick={switchToEditMode}
            className={`${btnPrimary} px-4 py-2 rounded-lg`}
          >
            <Edit2 className="w-4 h-4 mr-2" />
            Edit Mode
          </Button>
        </div>
        <div className="flex gap-2">
          {showTrash && (
            <Button className={`${btnSecondary} px-4 py-2 rounded-lg`} onClick={() => setShowTrash(false)}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Items
            </Button>
          )}
          {!showTrash && (
            <Button
              onClick={() => setShowTrash(true)}
              className={`${btnSecondary} px-4 py-2 rounded-lg`}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Trash ({trashItems.length})
            </Button>
          )}
          <Button
            onClick={() => setShowRevisionModal(true)}
            className={`${btnPrimary} px-4 py-2 rounded-lg`}
          >
            <Copy className="w-4 h-4 mr-2" />
            New Revision
          </Button>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-navy" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {renderBomHeader()}

      {/* Main Content - Tabs or View */}
      {!showTrash ? (
        // VIEW/EDIT ITEMS TABLE
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">SR No</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-12 bg-gray-50 z-10">Feeder #</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">UCAL Int PN</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">QTY</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">REF</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">DESC</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">PKG</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Make 1 / MPN</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Make 2 / MPN</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Make 3 / MPN</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Remarks</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Action</th>
                  {isEditMode && <th className="px-4 py-3 text-center font-semibold text-gray-700">Operations</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={isEditMode ? 13 : 12} className="px-4 py-8 text-center text-gray-500">
                      No items in this BOM
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-blue-50">
                      {editingItemId === item.id ? (
                        <>
                          <td className="px-4 py-3 font-mono text-gray-700 sticky left-0 bg-white">
                            <Input
                              className="w-full text-sm"
                              value={editingItem?.srNo ?? ""}
                              onChange={(e) => setEditingItem({ ...editingItem, srNo: e.target.value })}
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-700 sticky left-12 bg-white">
                            <Input
                              className="w-full text-sm"
                              value={editingItem?.feederNumber ?? ""}
                              onChange={(e) => setEditingItem({ ...editingItem, feederNumber: e.target.value })}
                              required
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input className="w-full text-sm" value={editingItem?.ucalIntPn ?? ""} onChange={(e) => setEditingItem({ ...editingItem, ucalIntPn: e.target.value })} />
                          </td>
                          <td className="px-4 py-3">
                            <Input className="w-full text-sm" value={editingItem?.quantity ?? ""} onChange={(e) => setEditingItem({ ...editingItem, quantity: e.target.value })} />
                          </td>
                          <td className="px-4 py-3">
                            <Input className="w-full text-sm" value={editingItem?.reference ?? ""} onChange={(e) => setEditingItem({ ...editingItem, reference: e.target.value })} />
                          </td>
                          <td className="px-4 py-3">
                            <Input className="w-full text-sm" value={editingItem?.description ?? ""} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} />
                          </td>
                          <td className="px-4 py-3">
                            <Input className="w-full text-sm" value={editingItem?.package ?? ""} onChange={(e) => setEditingItem({ ...editingItem, package: e.target.value })} />
                          </td>
                          <td className="px-4 py-3 space-y-1">
                            <div className="flex gap-1">
                              <Input className="w-1/2 text-sm" value={editingItem?.make1 ?? ""} onChange={(e) => setEditingItem({ ...editingItem, make1: e.target.value })} placeholder="Make 1" />
                              <Input className="w-1/2 text-sm" value={editingItem?.mpn1 ?? ""} onChange={(e) => setEditingItem({ ...editingItem, mpn1: e.target.value })} placeholder="MPN 1" />
                            </div>
                          </td>
                          <td className="px-4 py-3 space-y-1">
                            <div className="flex gap-1">
                              <Input className="w-1/2 text-sm" value={editingItem?.make2 ?? ""} onChange={(e) => setEditingItem({ ...editingItem, make2: e.target.value })} placeholder="Make 2" />
                              <Input className="w-1/2 text-sm" value={editingItem?.mpn2 ?? ""} onChange={(e) => setEditingItem({ ...editingItem, mpn2: e.target.value })} placeholder="MPN 2" />
                            </div>
                          </td>
                          <td className="px-4 py-3 space-y-1">
                            <div className="flex gap-1">
                              <Input className="w-1/2 text-sm" value={editingItem?.make3 ?? ""} onChange={(e) => setEditingItem({ ...editingItem, make3: e.target.value })} placeholder="Make 3" />
                              <Input className="w-1/2 text-sm" value={editingItem?.mpn3 ?? ""} onChange={(e) => setEditingItem({ ...editingItem, mpn3: e.target.value })} placeholder="MPN 3" />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Input className="w-full text-sm" value={editingItem?.remarks ?? ""} onChange={(e) => setEditingItem({ ...editingItem, remarks: e.target.value })} />
                          </td>
                          <td className="px-4 py-3">
                            <Input className="w-full text-sm" value={editingItem?.action ?? ""} onChange={(e) => setEditingItem({ ...editingItem, action: e.target.value })} />
                          </td>
                          <td className="px-4 py-3 text-center space-x-2">
                            <Button onClick={saveEditedItem} className={`${btnPrimary} px-2 py-1 rounded text-xs`} title="Save">
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button onClick={cancelEdit} className={`${btnSecondary} px-2 py-1 rounded text-xs`} title="Cancel">
                              <X className="w-3 h-3" />
                            </Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-mono text-gray-700 sticky left-0 bg-white group-hover:bg-blue-50">{item.srNo}</td>
                          <td className="px-4 py-3 font-mono text-gray-700 sticky left-12 bg-white group-hover:bg-blue-50">{item.feederNumber}</td>
                          <td className="px-4 py-3 text-gray-700">{item.ucalIntPn}</td>
                          <td className="px-4 py-3 text-gray-700">{item.quantity}</td>
                          <td className="px-4 py-3 text-gray-700">{item.reference}</td>
                          <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{item.description}</td>
                          <td className="px-4 py-3 text-gray-700">{item.package}</td>
                          <td className="px-4 py-3 text-gray-700">{item.make1} / {item.mpn1}</td>
                          <td className="px-4 py-3 text-gray-700">{item.make2} / {item.mpn2}</td>
                          <td className="px-4 py-3 text-gray-700">{item.make3} / {item.mpn3}</td>
                          <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{item.remarks}</td>
                          <td className="px-4 py-3">
                            {item.action ? <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-semibold">{item.action}</span> : "-"}
                          </td>
                          {isEditMode && (
                            <td className="px-4 py-3 text-center space-x-2">
                              <Button onClick={() => startEditItem(item)} className={`${btnIcon}`} title="Edit">
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button onClick={() => setShowDeleteConfirm(item.id)} className={`${btnIcon}`} title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {items.length > pageSize && (
            <div className="flex items-center justify-between mt-4 px-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Rows per page:</Label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className={`${btnSecondary} px-3 py-1 text-sm`}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages} ({items.length} total items)
                </span>
                <Button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className={`${btnSecondary} px-3 py-1 text-sm`}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        // TRASH VIEW
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-navy mb-4">Trash Bin ({trashItems.length})</h2>
          {trashItems.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Trash is empty</p>
          ) : (
            <div className="space-y-2">
              {trashItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-700">{item.feederNumber} - {item.ucalIntPn || item.description}</p>
                    <p className="text-xs text-gray-500">Deleted: {item.deletedAt}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => restoreItem(item.id)}
                      className={`${btnRestore} px-3 py-2 rounded-lg`}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Restore
                    </Button>
                    <Button
                      onClick={() => setShowPermanentDeleteConfirm(item.id)}
                      className={`${btnDanger} px-3 py-2 rounded-lg`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EDIT MODE: ADD NEW ITEM FORM */}
      {isEditMode && !showTrash && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mt-6">
          <h2 className="text-xl font-bold text-navy mb-4">Add New Item</h2>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* 12 Fields - Grouped in rows */}
              <div>
                <Label>SR No</Label>
                <Input value={newItem.srNo} onChange={(e) => setNewItem({ ...newItem, srNo: e.target.value })} placeholder="Auto" />
              </div>
              <div>
                <Label>Feeder # *</Label>
                <Input value={newItem.feederNumber} onChange={(e) => setNewItem({ ...newItem, feederNumber: e.target.value })} required />
              </div>
              <div>
                <Label>UCAL Int PN</Label>
                <Input value={newItem.ucalIntPn} onChange={(e) => setNewItem({ ...newItem, ucalIntPn: e.target.value })} />
              </div>
              <div>
                <Label>QTY *</Label>
                <Input type="number" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} required />
              </div>
              <div>
                <Label>REF</Label>
                <Input value={newItem.reference} onChange={(e) => setNewItem({ ...newItem, reference: e.target.value })} />
              </div>
              <div>
                <Label>DESC</Label>
                <Input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
              </div>
              <div>
                <Label>PKG</Label>
                <Input value={newItem.package} onChange={(e) => setNewItem({ ...newItem, package: e.target.value })} />
              </div>
              {/* Manufacturers */}
              <div>
                <Label>Make 1</Label>
                <Input value={newItem.make1} onChange={(e) => setNewItem({ ...newItem, make1: e.target.value })} />
              </div>
              <div>
                <Label>MPN 1</Label>
                <Input value={newItem.mpn1} onChange={(e) => setNewItem({ ...newItem, mpn1: e.target.value })} />
              </div>
              <div>
                <Label>Make 2</Label>
                <Input value={newItem.make2} onChange={(e) => setNewItem({ ...newItem, make2: e.target.value })} />
              </div>
              <div>
                <Label>MPN 2</Label>
                <Input value={newItem.mpn2} onChange={(e) => setNewItem({ ...newItem, mpn2: e.target.value })} />
              </div>
              <div>
                <Label>Make 3</Label>
                <Input value={newItem.make3} onChange={(e) => setNewItem({ ...newItem, make3: e.target.value })} />
              </div>
              <div>
                <Label>MPN 3</Label>
                <Input value={newItem.mpn3} onChange={(e) => setNewItem({ ...newItem, mpn3: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Remarks</Label>
                <Input value={newItem.remarks} onChange={(e) => setNewItem({ ...newItem, remarks: e.target.value })} />
              </div>
              <div>
                <Label>Action</Label>
                <Input value={newItem.action} onChange={(e) => setNewItem({ ...newItem, action: e.target.value })} placeholder="e.g., DNP, Active" />
              </div>
            </div>
            <Button type="submit" className={`${btnPrimary} px-6 py-2 rounded-lg`}>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </form>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOGS */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-lg">Move to Trash?</h3>
            </div>
            <p className="text-gray-600 mb-6">This item can be restored later from the Trash bin.</p>
            <div className="flex gap-3">
              <Button onClick={() => setShowDeleteConfirm(null)} className={`${btnSecondary} px-4 py-2 rounded-lg flex-1`}>
                Cancel
              </Button>
              <Button onClick={() => deleteItem(showDeleteConfirm)} className={`${btnDanger} px-4 py-2 rounded-lg flex-1`}>
                Move to Trash
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPermanentDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-lg text-red-600">Permanently Delete?</h3>
            </div>
            <p className="text-gray-600 mb-6">This action cannot be undone. The item will be permanently deleted.</p>
            <div className="flex gap-3">
              <Button onClick={() => setShowPermanentDeleteConfirm(null)} className={`${btnSecondary} px-4 py-2 rounded-lg flex-1`}>
                Cancel
              </Button>
              <Button onClick={() => permanentlyDeleteItem(showPermanentDeleteConfirm)} className={`${btnDanger} px-4 py-2 rounded-lg flex-1`}>
                Permanently Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* REVISION MODAL */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md shadow-xl">
            <h3 className="font-bold text-lg mb-4">Create New Revision</h3>
            <div className="space-y-4">
              <div>
                <Label>Revision Label *</Label>
                <Input
                  value={revisionForm.label}
                  onChange={(e) => setRevisionForm({ ...revisionForm, label: e.target.value })}
                  placeholder="e.g., Rev B, 1.1"
                  required
                />
              </div>
              <div>
                <Label>Revision Notes</Label>
                <textarea
                  value={revisionForm.notes}
                  onChange={(e) => setRevisionForm({ ...revisionForm, notes: e.target.value })}
                  placeholder="Optional notes about this revision"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                  rows={3}
                />
              </div>
              <p className="text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                All current items will be copied to the new revision. The current version will be marked as archived.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => setShowRevisionModal(false)} className={`${btnSecondary} px-4 py-2 rounded-lg flex-1`}>
                Cancel
              </Button>
              <Button
                onClick={createRevision}
                disabled={isCreatingRevision}
                className={`${btnPrimary} px-4 py-2 rounded-lg flex-1`}
              >
                {isCreatingRevision ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                Create Revision
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
