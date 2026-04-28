import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetBom, useAddBomItem, useDeleteBom, useDeleteBomItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBomQueryKey, getListBomsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Trash2, Upload, ChevronLeft, Plus, FileText, Package, Eye, Edit2 } from "lucide-react";
import Papa from "papaparse";
import { AppLogo } from "@/components/AppLogo";
import { appConfig } from "@/lib/appConfig";

export default function BomDetail() {
  const [, params] = useRoute("/bom/:id");
  const bomId = Number(params?.id);
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // State to track mode (defaults to 'view')
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const isEditMode = mode === 'edit';
  const isViewMode = mode === 'view';

  // State for form tab selection
  const [activeFormTab, setActiveFormTab] = useState<'add' | 'import'>('add');

  // Parse mode from URL on mount and when location changes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    if (modeParam === 'edit') {
      setMode('edit');
    } else {
      setMode('view');
    }
  }, [location]);

  // Helper functions for mode switching
  const switchToEditMode = () => {
    setMode('edit');
    setLocation(`/bom/${bomId}?mode=edit`);
  };

  const switchToViewMode = () => {
    setMode('view');
    setLocation(`/bom/${bomId}?mode=view`);
  };

  const { data: bom, isLoading } = useGetBom(bomId, { query: { enabled: !!bomId, queryKey: getGetBomQueryKey(bomId) } });
  const addItem = useAddBomItem();
  const deleteItem = useDeleteBomItem();
  const deleteBom = useDeleteBom();

  const [feederNumber, setFeederNumber] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [locationField, setLocationField] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

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

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    addItem.mutate({ 
      bomId, 
      data: { feederNumber, partNumber, description, location: locationField, quantity: Number(quantity) } 
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Item added to BOM" });
        setFeederNumber("");
        setPartNumber("");
        setDescription("");
        setLocationField("");
        setQuantity("1");
        queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
      },
      onError: (error) => {
        console.error("Failed to add item:", error);
        toast({ title: "Error", description: "Failed to add item" });
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
        const rawRows = (results.data as string[][]).map((row) =>
          row.map((cell) => (cell ?? "").toString().trim()),
        );

        const feederAliases = [
          "feedernumber",
          "feedernumber",
          "feeder",
          "feeder no",
          "feeder no.",
          "feeder number",
        ];
        const itemNameAliases = ["itemname", "item name", "partname", "part name"];
        const srNoAliases = ["srno", "sr no", "serialno", "serial no", "sno", "sr#"];
        const internalPartAliases = [
          "ucalinternalpartnumber",
          "internalpartnumber",
          "internal no",
          "partnumber",
          "part number",
          "part no",
          "rdeplypartno",
        ];
        const partAliases = [...internalPartAliases, ...itemNameAliases];
        const descriptionAliases = ["description", "desc", "componentvalues", "component value"];
        const locationAliases = ["referencelocation", "reference location", "location", "loc"];
        const packageAliases = [
          "packagedescription",
          "package description",
          "package/description",
          "packagedesc",
        ];
        const dnpAliases = ["dnpparts", "dnp parts", "dnp"];
        const supplier1Aliases = ["make/supplier1", "make supplier 1", "supplier1", "make1"];
        const partNo1Aliases = ["spoolpartno/mpn1", "spool part no. / mpn 1", "mpn1", "partno1"];
        const supplier2Aliases = ["make/supplier2", "make supplier 2", "supplier2", "make2"];
        const partNo2Aliases = ["spoolpartno/mpn2", "spool part no. / mpn 2", "mpn2", "partno2"];
        const supplier3Aliases = ["make/supplier3", "make supplier 3", "supplier3", "make3"];
        const partNo3Aliases = ["spoolpartno/mpn3", "spool part no. / mpn 3", "mpn3", "partno3"];
        const remarksAliases = ["remarks", "remark", "comments"];
        const quantityAliases = ["quantity", "qty", "requiredqty", "required qty"];

        let headerIndex = -1;
        let feederIndex = -1;
        let partIndex = -1;
        let srNoIndex = -1;
        let itemNameIndex = -1;
        let internalPartIndex = -1;
        let descriptionIndex = -1;
        let locationIndex = -1;
        let packageIndex = -1;
        let dnpIndex = -1;
        let supplier1Index = -1;
        let partNo1Index = -1;
        let supplier2Index = -1;
        let partNo2Index = -1;
        let supplier3Index = -1;
        let partNo3Index = -1;
        let remarksIndex = -1;
        let quantityIndex = -1;

        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          const maybeFeederIndex = findColumnIndex(row, feederAliases);
          const maybePartIndex = findColumnIndex(row, partAliases);
          if (maybeFeederIndex !== -1 && maybePartIndex !== -1) {
            headerIndex = i;
            feederIndex = maybeFeederIndex;
            partIndex = maybePartIndex;
            srNoIndex = findColumnIndex(row, srNoAliases);
            itemNameIndex = findColumnIndex(row, itemNameAliases);
            internalPartIndex = findColumnIndex(row, internalPartAliases);
            descriptionIndex = findColumnIndex(row, descriptionAliases);
            locationIndex = findColumnIndex(row, locationAliases);
            packageIndex = findColumnIndex(row, packageAliases);
            dnpIndex = findColumnIndex(row, dnpAliases);
            supplier1Index = findColumnIndex(row, supplier1Aliases);
            partNo1Index = findColumnIndex(row, partNo1Aliases);
            supplier2Index = findColumnIndex(row, supplier2Aliases);
            partNo2Index = findColumnIndex(row, partNo2Aliases);
            supplier3Index = findColumnIndex(row, supplier3Aliases);
            partNo3Index = findColumnIndex(row, partNo3Aliases);
            remarksIndex = findColumnIndex(row, remarksAliases);
            quantityIndex = findColumnIndex(row, quantityAliases);
            break;
          }
        }

        if (headerIndex === -1) {
          console.error("Could not detect CSV header row", rawRows.slice(0, 5));
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
          alert("CSV import failed: Could not find Feeder Number and Part Number columns.");
          return;
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (let i = headerIndex + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          const feederNumberValue = cleanCell(row[feederIndex] ?? "");
          const fallbackPartNumber = cleanCell(row[partIndex] ?? "");
          const itemNameValue = itemNameIndex >= 0 ? cleanCell(row[itemNameIndex] ?? "") : "";
          const internalPartValue =
            internalPartIndex >= 0 ? cleanCell(row[internalPartIndex] ?? "") : "";
          const partNumberValue = internalPartValue || fallbackPartNumber;

          // Skip empty lines and malformed rows silently, but keep count for user summary.
          if (!feederNumberValue || !partNumberValue) {
            skippedCount++;
            continue;
          }

          const quantityRaw = quantityIndex >= 0 ? (row[quantityIndex] ?? "").trim() : "";
          const quantityValue = Number(quantityRaw);
          const locationValue = locationIndex >= 0 ? cleanCell(row[locationIndex] ?? "") : "";
          const descriptionValue = descriptionIndex >= 0 ? cleanCell(row[descriptionIndex] ?? "") : "";

          try {
            await addItem.mutateAsync({
              bomId,
              data: {
                srNo: srNoIndex >= 0 ? cleanCell(row[srNoIndex] ?? "") : "",
                feederNumber: feederNumberValue,
                partNumber: partNumberValue,
                itemName: itemNameValue || partNumberValue,
                rdeplyPartNo: internalPartValue,
                referenceDesignator: locationValue,
                description: descriptionValue,
                location: locationValue,
                packageDescription: packageIndex >= 0 ? cleanCell(row[packageIndex] ?? "") : "",
                dnpParts: dnpIndex >= 0 ? cleanCell(row[dnpIndex] ?? "") : "",
                make1: supplier1Index >= 0 ? cleanCell(row[supplier1Index] ?? "") : "",
                mpn1: partNo1Index >= 0 ? cleanCell(row[partNo1Index] ?? "") : "",
                make2: supplier2Index >= 0 ? cleanCell(row[supplier2Index] ?? "") : "",
                mpn2: partNo2Index >= 0 ? cleanCell(row[partNo2Index] ?? "") : "",
                make3: supplier3Index >= 0 ? cleanCell(row[supplier3Index] ?? "") : "",
                mpn3: partNo3Index >= 0 ? cleanCell(row[partNo3Index] ?? "") : "",
                remarks: remarksIndex >= 0 ? cleanCell(row[remarksIndex] ?? "") : "",
                quantity:
                  Number.isFinite(quantityValue) && quantityValue > 0
                    ? quantityValue
                    : 1,
              },
            });
            importedCount++;
          } catch (err) {
            skippedCount++;
            console.error("Failed to add row", { rowNumber: i + 1, row }, err);
          }
        }

        queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";

        if (importedCount > 0) {
          toast({ 
            title: "CSV Import Complete", 
            description: `${importedCount} items added${skippedCount > 0 ? `, ${skippedCount} skipped` : ""}` 
          });
        } else {
          toast({ 
            title: "Import Failed", 
            description: `${skippedCount} rows skipped. Check CSV format and try again.` 
          });
        }
      },
      error: () => {
        setIsUploading(false);
        toast({ title: "Error", description: "Failed to parse CSV file" });
      }
    });
  };

  const handleDeleteBom = () => {
    const confirmed = window.confirm("Are you sure you want to delete this BOM? This will move it to trash and can be recovered within 30 days.");
    if (!confirmed) return;
    
    deleteBom.mutate({ bomId }, {
      onSuccess: () => {
        toast({ title: "Success", description: "BOM moved to trash" });
        queryClient.invalidateQueries({ queryKey: getListBomsQueryKey() });
        setTimeout(() => setLocation("/bom"), 500);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete BOM" });
      }
    });
  };

  const handleDeleteItem = (itemId: number) => {
    if (confirm("Are you sure you want to delete this item?")) {
      setDeletingItemId(itemId);
      deleteItem.mutate({ bomId, itemId }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Item removed from BOM" });
          queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to delete item" });
        },
        onSettled: () => {
          setDeletingItemId(null);
        }
      });
    }
  };

  if (isLoading || !bom) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-navy" />
          <p className="text-navy font-semibold">Loading BOM...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              onClick={() => setLocation("/bom")}
              className="hover:bg-blue-100 text-navy"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-3xl sm:text-4xl font-bold text-navy">BOM Detail</h1>
            {isViewMode && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                <Eye className="w-3 h-3" /> VIEW MODE
              </span>
            )}
            {isEditMode && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
                <Edit2 className="w-3 h-3" /> EDIT MODE
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {isViewMode && (
              <Button
                onClick={switchToEditMode}
                className="bg-white text-navy border-navy border-2 hover:bg-gray-50 flex items-center gap-2 font-semibold"
              >
                <Edit2 className="w-4 h-4" /> Switch to Edit
              </Button>
            )}
            {isEditMode && (
              <Button
                onClick={switchToViewMode}
                variant="outline"
                className="bg-white text-navy border-navy border-2 hover:bg-gray-50 flex items-center gap-2 font-semibold"
              >
                <Eye className="w-4 h-4" /> Switch to View
              </Button>
            )}
          </div>
        </div>

        {/* BOM Info Card */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-2xl font-bold text-navy mb-2">{bom.name}</h2>
              {bom.description && (
                <p className="text-gray-600 text-sm mb-4">{bom.description}</p>
              )}
              <div className="space-y-2 text-sm">
                {bom.version && <div><span className="text-gray-600">Version:</span> <span className="font-semibold text-navy">{bom.version}</span></div>}
                {bom.product && <div><span className="text-gray-600">Product:</span> <span className="font-semibold text-navy">{bom.product}</span></div>}
                {bom.customer && <div><span className="text-gray-600">Customer:</span> <span className="font-semibold text-navy">{bom.customer}</span></div>}
                <div><span className="text-gray-600">Created:</span> <span className="font-semibold text-navy">{new Date(bom.createdAt).toLocaleDateString()}</span></div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-navy">
                <div className="text-3xl font-bold text-navy">{bom.items?.length || 0}</div>
                <div className="text-sm text-gray-600">Total Items</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-600">
                <div className="text-3xl font-bold text-green-600">{bom.items?.filter(i => i.quantity).reduce((sum, i) => sum + i.quantity, 0) || 0}</div>
                <div className="text-sm text-gray-600">Total Qty</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-2 justify-end">
            {isEditMode && (
              <Button 
                onClick={handleDeleteBom}
                disabled={deleteBom.isPending}
                className="bg-white text-navy border-navy border-2 hover:bg-gray-50 flex items-center gap-2"
              >
                {deleteBom.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete BOM
              </Button>
            )}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Forms (Only in Edit Mode) */}
        {isEditMode && (
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <Tabs value={activeFormTab} onValueChange={(val) => setActiveFormTab(val as 'add' | 'import')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-gray-100 p-1 rounded-lg">
                <TabsTrigger value="add" className="flex items-center gap-2 data-[state=active]:bg-navy data-[state=active]:text-white">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Single</span>
                </TabsTrigger>
                <TabsTrigger value="import" className="flex items-center gap-2 data-[state=active]:bg-navy data-[state=active]:text-white">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Bulk CSV</span>
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Add Item Manually */}
              <TabsContent value="add" className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-navy mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Add Item Manually
                  </h3>
                </div>
                <form onSubmit={handleAddItem} className="space-y-4" autoComplete="off">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700">Feeder Number *</Label>
                    <Input 
                      value={feederNumber} 
                      onChange={e => setFeederNumber(e.target.value)} 
                      required 
                      placeholder="e.g., F-001"
                      className="border border-gray-300 focus:border-navy focus:ring-navy rounded-lg"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700">Part Number *</Label>
                    <Input 
                      value={partNumber} 
                      onChange={e => setPartNumber(e.target.value)} 
                      required 
                      placeholder="e.g., SMD-123-456"
                      className="border border-gray-300 focus:border-navy focus:ring-navy rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700">Description</Label>
                    <Input 
                      value={description} 
                      onChange={e => setDescription(e.target.value)} 
                      placeholder="Part description"
                      className="border border-gray-300 focus:border-navy focus:ring-navy rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-gray-700">Location</Label>
                      <Input 
                        value={locationField} 
                        onChange={e => setLocationField(e.target.value)} 
                        placeholder="Ref. Des."
                        className="border border-gray-300 focus:border-navy focus:ring-navy rounded-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-gray-700">Quantity</Label>
                      <Input 
                        type="number" 
                        min="1" 
                        value={quantity} 
                        onChange={e => setQuantity(e.target.value)} 
                        required 
                        className="border border-gray-300 focus:border-navy focus:ring-navy rounded-lg"
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    disabled={addItem.isPending} 
                    className="w-full bg-white text-navy border-navy border-2 hover:bg-gray-50 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 py-2.5"
                  >
                    {addItem.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {addItem.isPending ? "Adding..." : "Add Item"}
                  </Button>
                </form>
              </TabsContent>

              {/* Tab 2: Bulk Import CSV */}
              <TabsContent value="import" className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-navy mb-3 flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Bulk Import
                  </h3>
                  <p className="text-xs text-gray-600 mb-4 bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <strong>Expected columns:</strong> SR NO, Feeder Number, {appConfig.companyShort} Internal Part Number, Required Qty, Reference Location, Description, Package/Description, Supplier + MPN 1/2/3, Remarks
                  </p>
                </div>
                <div className="flex items-center gap-3 p-4 bg-blue-50 border-2 border-dashed border-navy rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">
                  <FileText className="w-5 h-5 text-navy flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Input 
                      type="file" 
                      accept=".csv" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      className="text-sm file:text-white file:bg-navy file:hover:bg-blue-900 file:border-0 file:rounded-lg file:px-4 file:py-2 file:font-semibold cursor-pointer"
                    />
                  </div>
                  {isUploading && <Loader2 className="w-5 h-5 animate-spin text-navy flex-shrink-0" />}
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-700">
                    <strong>💡 Tip:</strong> You can add multiple items at once by uploading a CSV file with all your components. Much faster than adding one at a time!
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        )}

        {/* Right Side - Items Table */}
        <div className={isEditMode ? "lg:col-span-2" : "lg:col-span-3"}>
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col max-h-[800px]">
            <div className="bg-gradient-to-r from-navy to-blue-700 p-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-white" />
                <span className="font-bold text-white text-lg">BOM Items</span>
              </div>
              <span className="bg-white text-navy font-bold px-3 py-1 rounded-full text-sm">Total: {bom.items.length}</span>
            </div>
            
            {bom.items.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-semibold">No items added yet</p>
                  <p className="text-gray-400 text-sm">Add items manually or import from CSV</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50 border-b-2 border-gray-200 z-10">
                    <TableRow className="hover:bg-gray-50">
                      <TableHead className="font-bold text-navy text-xs">SR NO</TableHead>
                      <TableHead className="font-bold text-navy text-xs">FEEDER#</TableHead>
                      <TableHead className="font-bold text-navy text-xs">{appConfig.companyShort.toUpperCase()} INT PN</TableHead>
                      <TableHead className="font-bold text-navy text-xs text-right">QTY</TableHead>
                      <TableHead className="font-bold text-navy text-xs">REF</TableHead>
                      <TableHead className="font-bold text-navy text-xs">DESC</TableHead>
                      <TableHead className="font-bold text-navy text-xs">PKG</TableHead>
                      <TableHead className="font-bold text-navy text-xs">MAKE 1 / MPN 1</TableHead>
                      <TableHead className="font-bold text-navy text-xs">MAKE 2 / MPN 2</TableHead>
                      <TableHead className="font-bold text-navy text-xs">MAKE 3 / MPN 3</TableHead>
                      <TableHead className="font-bold text-navy text-xs">REMARKS</TableHead>
                      <TableHead className="font-bold text-navy text-xs text-right">ACTION</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bom.items.map((item, index) => (
                      <TableRow key={item.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                        <TableCell className="font-mono text-xs text-gray-700">{index + 1}</TableCell>
                        <TableCell className="font-bold text-navy text-sm">{item.feederNumber}</TableCell>
                        <TableCell className="font-mono text-xs text-gray-700 max-w-[180px] truncate" title={item.rdeplyPartNo || item.partNumber}>{item.rdeplyPartNo || item.partNumber || "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-gray-700 text-right font-semibold">{item.quantity}</TableCell>
                        <TableCell className="font-mono text-xs text-gray-600 max-w-[120px] truncate" title={item.referenceDesignator || item.location}>{item.referenceDesignator || item.location || "-"}</TableCell>
                        <TableCell className="text-xs text-gray-600 max-w-[140px] truncate" title={item.description}>{item.description || "-"}</TableCell>
                        <TableCell className="text-xs text-gray-600 max-w-[120px] truncate" title={item.packageDescription}>{item.packageDescription || "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-gray-600 max-w-[140px]">
                          <div className="truncate">{item.make1 || "-"}</div>
                          <div className="truncate text-gray-500">{item.mpn1 || ""}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-600 max-w-[140px]">
                          <div className="truncate">{item.make2 || "-"}</div>
                          <div className="truncate text-gray-500">{item.mpn2 || ""}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-600 max-w-[140px]">
                          <div className="truncate">{item.make3 || "-"}</div>
                          <div className="truncate text-gray-500">{item.mpn3 || ""}</div>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 max-w-[120px] truncate" title={item.remarks}>{item.remarks || "-"}</TableCell>
                        <TableCell className="text-right">
                          {isEditMode && (
                            <Button 
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={deleteItem.isPending && deletingItemId === item.id}
                              variant="ghost" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                            >
                              {deletingItemId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
