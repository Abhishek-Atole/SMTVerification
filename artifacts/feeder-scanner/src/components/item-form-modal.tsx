// @ts-nocheck
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

export interface ItemFormData {
  // CSV Fields - 16 Field BOM
  srNo?: string;
  feederNumber: string;
  itemName?: string;
  rdeplyPartNo?: string;
  referenceDesignator?: string;
  values?: string;
  packageDescription?: string;
  dnpParts?: boolean;
  supplier1?: string;
  partNo1?: string;
  supplier2?: string;
  partNo2?: string;
  supplier3?: string;
  partNo3?: string;
  remarks?: string;
  
  // Legacy Fields (for backward compatibility)
  partNumber: string;
  description?: string;
  location?: string;
  quantity: number;
  mpn?: string;
  manufacturer?: string;
  packageSize?: string;
  leadTime?: number;
  cost?: string;
  isAlternate?: boolean;
  parentItemId?: number;
}

interface ItemFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ItemFormData) => void;
  onCancel?: () => void;
  initialData?: Partial<ItemFormData>;
  isLoading?: boolean;
  isEditing?: boolean;
  bomItems?: Array<{ id: number; feederNumber: string; partNumber: string }>;
}

export function ItemFormModal({
  open,
  onOpenChange,
  onSubmit,
  onCancel,
  initialData,
  isLoading = false,
  isEditing = false,
  bomItems = [],
}: ItemFormModalProps) {
  // CSV Fields - 16 Field BOM
  const [srNo, setSrNo] = useState("");
  const [itemName, setItemName] = useState("");
  const [rdeplyPartNo, setRdeplyPartNo] = useState("");
  const [referenceDesignator, setReferenceDesignator] = useState("");
  const [values, setValues] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [dnpParts, setDnpParts] = useState(false);
  const [supplier1, setSupplier1] = useState("");
  const [partNo1, setPartNo1] = useState("");
  const [supplier2, setSupplier2] = useState("");
  const [partNo2, setPartNo2] = useState("");
  const [supplier3, setSupplier3] = useState("");
  const [partNo3, setPartNo3] = useState("");
  const [remarks, setRemarks] = useState("");

  // Legacy Fields
  const [feederNumber, setFeederNumber] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [mpn, setMpn] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [packageSize, setPackageSize] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [cost, setCost] = useState("");
  const [isAlternate, setIsAlternate] = useState(false);
  const [parentItemId, setParentItemId] = useState<number | "">();

  useEffect(() => {
    if (initialData) {
      // CSV Fields
      setSrNo(initialData.srNo || "");
      setItemName(initialData.itemName || "");
      setRdeplyPartNo(initialData.rdeplyPartNo || "");
      setReferenceDesignator(initialData.referenceDesignator || "");
      setValues(initialData.values || "");
      setPackageDescription(initialData.packageDescription || "");
      setDnpParts(initialData.dnpParts || false);
      setSupplier1(initialData.supplier1 || "");
      setPartNo1(initialData.partNo1 || "");
      setSupplier2(initialData.supplier2 || "");
      setPartNo2(initialData.partNo2 || "");
      setSupplier3(initialData.supplier3 || "");
      setPartNo3(initialData.partNo3 || "");
      setRemarks(initialData.remarks || "");
      
      // Legacy Fields
      setFeederNumber(initialData.feederNumber || "");
      setPartNumber(initialData.partNumber || "");
      setDescription(initialData.description || "");
      setLocation(initialData.location || "");
      setQuantity(String(initialData.quantity || 1));
      setMpn(initialData.mpn || "");
      setManufacturer(initialData.manufacturer || "");
      setPackageSize(initialData.packageSize || "");
      setLeadTime(initialData.leadTime ? String(initialData.leadTime) : "");
      setCost(initialData.cost || "");
      setIsAlternate(initialData.isAlternate || false);
      setParentItemId(initialData.parentItemId || "");
    } else {
      resetForm();
    }
  }, [initialData, open]);

  const resetForm = () => {
    // CSV Fields
    setSrNo("");
    setItemName("");
    setRdeplyPartNo("");
    setReferenceDesignator("");
    setValues("");
    setPackageDescription("");
    setDnpParts(false);
    setSupplier1("");
    setPartNo1("");
    setSupplier2("");
    setPartNo2("");
    setSupplier3("");
    setPartNo3("");
    setRemarks("");
    
    // Legacy Fields
    setFeederNumber("");
    setPartNumber("");
    setDescription("");
    setLocation("");
    setQuantity("1");
    setMpn("");
    setManufacturer("");
    setPackageSize("");
    setLeadTime("");
    setCost("");
    setIsAlternate(false);
    setParentItemId("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: ItemFormData = {
      // CSV Fields
      srNo: srNo || undefined,
      feederNumber,
      itemName: itemName || undefined,
      rdeplyPartNo: rdeplyPartNo || undefined,
      referenceDesignator: referenceDesignator || undefined,
      values: values || undefined,
      packageDescription: packageDescription || undefined,
      dnpParts: dnpParts ? true : false,
      supplier1: supplier1 || undefined,
      partNo1: partNo1 || undefined,
      supplier2: supplier2 || undefined,
      partNo2: partNo2 || undefined,
      supplier3: supplier3 || undefined,
      partNo3: partNo3 || undefined,
      remarks: remarks || undefined,
      
      // Legacy Fields
      partNumber,
      description: description || undefined,
      location: location || undefined,
      quantity: Number(quantity),
      mpn: mpn || undefined,
      manufacturer: manufacturer || undefined,
      packageSize: packageSize || undefined,
      leadTime: leadTime ? Number(leadTime) : undefined,
      cost: cost || undefined,
      isAlternate: isAlternate ? true : false,
      parentItemId: parentItemId ? Number(parentItemId) : undefined,
    };
    onSubmit(data);
    resetForm();
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
    onCancel?.();
  };

  // Filter parent items (only non-alternates can be parents)
  const primaryItems = bomItems.filter((item) => true);  // For now, show all available items

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border text-foreground font-mono max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "EDIT" : "ADD"} BOM ITEM</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the BOM item details" : "Add a new component with complete information including manufacturer details"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information Section */}
          <div className="space-y-4 border-b border-border pb-4">
            <p className="text-xs font-bold text-muted-foreground uppercase">Basic Information</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="feeder">Feeder Number *</Label>
                <Input
                  id="feeder"
                  value={feederNumber}
                  onChange={(e) => setFeederNumber(e.target.value)}
                  required
                  placeholder="e.g., F001"
                  className="bg-background border-border rounded-sm"
                  data-testid="input-feeder-number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="part">Part Number *</Label>
                <Input
                  id="part"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  required
                  placeholder="e.g., R1206-10K"
                  className="bg-background border-border rounded-sm"
                  data-testid="input-part-number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Input
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., 10K Ohm Resistor"
                className="bg-background border-border rounded-sm"
                data-testid="input-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loc">Location</Label>
                <Input
                  id="loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Shelf A1"
                  className="bg-background border-border rounded-sm"
                  data-testid="input-location"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity</Label>
                <Input
                  id="qty"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="bg-background border-border rounded-sm"
                  data-testid="input-quantity"
                />
              </div>
            </div>
          </div>

          {/* 16-Field CSV BOM Section */}
          <div className="space-y-4 border-b border-border pb-4">
            <p className="text-xs font-bold text-muted-foreground uppercase">16-Field CSV BOM Data</p>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="srno">SR No.</Label>
                <Input
                  id="srno"
                  value={srNo}
                  onChange={(e) => setSrNo(e.target.value)}
                  placeholder="e.g., 1"
                  className="bg-background border-border rounded-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="itemname">Item Name</Label>
                <Input
                  id="itemname"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g., CAPACITOR"
                  className="bg-background border-border rounded-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rdepl">RDEPL Part No.</Label>
                <Input
                  id="rdepl"
                  value={rdeplyPartNo}
                  onChange={(e) => setRdeplyPartNo(e.target.value)}
                  placeholder="Internal part no."
                  className="bg-background border-border rounded-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="refdes">Reference Designator</Label>
                <Input
                  id="refdes"
                  value={referenceDesignator}
                  onChange={(e) => setReferenceDesignator(e.target.value)}
                  placeholder="e.g., C1, R3"
                  className="bg-background border-border rounded-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="val">Values/Spec</Label>
                <Input
                  id="val"
                  value={values}
                  onChange={(e) => setValues(e.target.value)}
                  placeholder="e.g., 4.7nF, 10K"
                  className="bg-background border-border rounded-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pkgdesc">Package/Description</Label>
                <Input
                  id="pkgdesc"
                  value={packageDescription}
                  onChange={(e) => setPackageDescription(e.target.value)}
                  placeholder="e.g., 0603, SMD"
                  className="bg-background border-border rounded-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="dnp"
                checked={dnpParts}
                onCheckedChange={(checked) => setDnpParts(checked === true)}
              />
              <Label htmlFor="dnp" className="text-sm cursor-pointer">
                DNP (Do Not Populate)
              </Label>
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase mt-4 mb-2">Supplier Information (up to 3)</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supp1">Supplier 1</Label>
                <Input
                  id="supp1"
                  value={supplier1}
                  onChange={(e) => setSupplier1(e.target.value)}
                  placeholder="e.g., KEMET, Yageo"
                  className="bg-background border-border rounded-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="part1">Part No. 1</Label>
                <Input
                  id="part1"
                  value={partNo1}
                  onChange={(e) => setPartNo1(e.target.value)}
                  placeholder="e.g., C0603C472K5RA"
                  className="bg-background border-border rounded-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supp2">Supplier 2 (Alt.)</Label>
                <Input
                  id="supp2"
                  value={supplier2}
                  onChange={(e) => setSupplier2(e.target.value)}
                  placeholder="Optional"
                  className="bg-background border-border rounded-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="part2">Part No. 2 (Alt.)</Label>
                <Input
                  id="part2"
                  value={partNo2}
                  onChange={(e) => setPartNo2(e.target.value)}
                  placeholder="Optional"
                  className="bg-background border-border rounded-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supp3">Supplier 3 (Alt.)</Label>
                <Input
                  id="supp3"
                  value={supplier3}
                  onChange={(e) => setSupplier3(e.target.value)}
                  placeholder="Optional"
                  className="bg-background border-border rounded-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="part3">Part No. 3 (Alt.)</Label>
                <Input
                  id="part3"
                  value={partNo3}
                  onChange={(e) => setPartNo3(e.target.value)}
                  placeholder="Optional"
                  className="bg-background border-border rounded-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks/Notes</Label>
              <Input
                id="remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g., RoHS compliant, Lead-free"
                className="bg-background border-border rounded-sm"
              />
            </div>
          </div>

          {/* Component Details Section */}
          <div className="space-y-4 border-b border-border pb-4">
            <p className="text-xs font-bold text-muted-foreground uppercase">Component Details</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mpn">Manufacturer Part Number (MPN)</Label>
                <Input
                  id="mpn"
                  value={mpn}
                  onChange={(e) => setMpn(e.target.value)}
                  placeholder="e.g., RC0603FR-074K7L"
                  className="bg-background border-border rounded-sm"
                  data-testid="input-mpn"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mfg">Manufacturer</Label>
                <Input
                  id="mfg"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="e.g., Yageo"
                  className="bg-background border-border rounded-sm"
                  data-testid="input-manufacturer"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pkg">Package Size</Label>
                <Input
                  id="pkg"
                  value={packageSize}
                  onChange={(e) => setPackageSize(e.target.value)}
                  placeholder="e.g., 0603"
                  className="bg-background border-border rounded-sm"
                  data-testid="input-package-size"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lt">Lead Time (days)</Label>
                <Input
                  id="lt"
                  type="number"
                  min="0"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  placeholder="e.g., 7"
                  className="bg-background border-border rounded-sm"
                  data-testid="input-lead-time"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cost">Cost (per unit)</Label>
                <Input
                  id="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="e.g., 0.12"
                  className="bg-background border-border rounded-sm"
                  data-testid="input-cost"
                />
              </div>
            </div>
          </div>

          {/* Alternate Component Section */}
          <div className="space-y-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="is-alt"
                checked={isAlternate}
                onCheckedChange={(checked) => {
                  setIsAlternate(checked === true);
                  if (!checked) setParentItemId("");
                }}
                data-testid="checkbox-is-alternate"
              />
              <Label htmlFor="is-alt" className="text-sm cursor-pointer">
                This is an alternate component for another item
              </Label>
            </div>

            {isAlternate && primaryItems.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="parent">Link to Primary Component *</Label>
                <select
                  id="parent"
                  value={parentItemId || ""}
                  onChange={(e) => setParentItemId(e.target.value ? Number(e.target.value) : "")}
                  required={isAlternate}
                  className="w-full px-3 py-2 bg-background border border-border rounded-sm text-foreground text-sm font-mono"
                  data-testid="select-parent-item"
                >
                  <option value="">-- Select a primary component --</option>
                  {primaryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.feederNumber} - {item.partNumber}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isAlternate && primaryItems.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No primary components available. Add or create a primary component first.
              </p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="rounded-sm"
              data-testid="btn-cancel"
            >
              CANCEL
            </Button>
            <Button
              type="submit"
              disabled={isLoading || (isAlternate && !parentItemId)}
              className="rounded-sm font-bold"
              data-testid="btn-submit-item"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isEditing ? "UPDATE" : "ADD"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
