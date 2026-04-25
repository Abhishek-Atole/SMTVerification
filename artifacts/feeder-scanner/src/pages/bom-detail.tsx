import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { useGetBom, useAddBomItem, useDeleteBom, useDeleteBomItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBomQueryKey, getListBomsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trash2, Upload } from "lucide-react";
import Papa from "papaparse";
import { useLocation } from "wouter";
import { AppLogo } from "@/components/AppLogo";

export default function BomDetail() {
  const [, params] = useRoute("/bom/:id");
  const bomId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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
                supplier1: supplier1Index >= 0 ? cleanCell(row[supplier1Index] ?? "") : "",
                partNo1: partNo1Index >= 0 ? cleanCell(row[partNo1Index] ?? "") : "",
                supplier2: supplier2Index >= 0 ? cleanCell(row[supplier2Index] ?? "") : "",
                partNo2: partNo2Index >= 0 ? cleanCell(row[partNo2Index] ?? "") : "",
                supplier3: supplier3Index >= 0 ? cleanCell(row[supplier3Index] ?? "") : "",
                partNo3: partNo3Index >= 0 ? cleanCell(row[partNo3Index] ?? "") : "",
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

        alert(`CSV import complete: ${importedCount} added, ${skippedCount} skipped.`);
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
      setDeletingItemId(itemId);
      deleteItem.mutate({ bomId, itemId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
        },
        onSettled: () => {
          setDeletingItemId(null);
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
        <div className="flex items-start gap-4">
          <AppLogo className="h-16" />
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
              Columns: SR NO, Feeder Number, UCAL Internal Part Number, Required Qty, Reference Location, Description, Package/Description, Supplier + MPN 1/2/3, Remarks
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
                    <TableHead className="font-mono">SR NO</TableHead>
                    <TableHead className="font-mono">FEEDER#</TableHead>
                    <TableHead className="font-mono">UCAL INTERNAL PART#</TableHead>
                    <TableHead className="font-mono text-right">QTY</TableHead>
                    <TableHead className="font-mono">REF LOCATION</TableHead>
                    <TableHead className="font-mono">DESCRIPTION</TableHead>
                    <TableHead className="font-mono">PACKAGE/DESC</TableHead>
                    <TableHead className="font-mono">SUPPLIER 1</TableHead>
                    <TableHead className="font-mono">MPN 1</TableHead>
                    <TableHead className="font-mono">SUPPLIER 2</TableHead>
                    <TableHead className="font-mono">MPN 2</TableHead>
                    <TableHead className="font-mono">SUPPLIER 3</TableHead>
                    <TableHead className="font-mono">MPN 3</TableHead>
                    <TableHead className="font-mono">REMARKS</TableHead>
                    <TableHead className="font-mono text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.items.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={15} className="text-center py-12 text-muted-foreground font-mono">
                        No items added yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bom.items.map(item => (
                      <TableRow key={item.id} className="border-border hover:bg-secondary/30">
                        <TableCell className="font-mono text-sm">{item.srNo || "-"}</TableCell>
                        <TableCell className="font-mono font-bold text-primary">{item.feederNumber}</TableCell>
                        <TableCell className="font-mono text-sm max-w-[260px] truncate" title={item.rdeplyPartNo || item.partNumber}>{item.rdeplyPartNo || item.partNumber}</TableCell>
                        <TableCell className="font-mono text-right">{item.quantity}</TableCell>
                        <TableCell className="font-mono text-sm max-w-[160px] truncate" title={item.referenceDesignator || item.location}>{item.referenceDesignator || item.location}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[220px] truncate" title={item.description}>{item.description || "-"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate" title={item.packageDescription}>{item.packageDescription || "-"}</TableCell>
                        <TableCell className="font-mono text-sm max-w-[160px] truncate" title={item.supplier1}>{item.supplier1 || "-"}</TableCell>
                        <TableCell className="font-mono text-sm max-w-[220px] truncate" title={item.partNo1}>{item.partNo1 || "-"}</TableCell>
                        <TableCell className="font-mono text-sm max-w-[160px] truncate" title={item.supplier2}>{item.supplier2 || "-"}</TableCell>
                        <TableCell className="font-mono text-sm max-w-[220px] truncate" title={item.partNo2}>{item.partNo2 || "-"}</TableCell>
                        <TableCell className="font-mono text-sm max-w-[160px] truncate" title={item.supplier3}>{item.supplier3 || "-"}</TableCell>
                        <TableCell className="font-mono text-sm max-w-[220px] truncate" title={item.partNo3}>{item.partNo3 || "-"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[220px] truncate" title={item.remarks}>{item.remarks || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            onClick={() => handleDeleteItem(item.id)}
                            disabled={deleteItem.isPending && deletingItemId === item.id}
                            variant="ghost" 
                            size="sm" 
                            className="rounded-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                            data-testid={`btn-delete-item-${item.id}`}
                          >
                            {deletingItemId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </TableCell>
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
