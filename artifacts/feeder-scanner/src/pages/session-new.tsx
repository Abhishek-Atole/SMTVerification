import { useState } from "react";
import { useLocation } from "wouter";
import { useListBoms, useCreateSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Loader2, Upload } from "lucide-react";

const SUPERVISOR_NAMES = ["Umesh Nagile", "Dhupchand Bhardwaj", "Maruti Birader"];
const OPERATOR_NAMES = ["Aarti", "Aniket", "Suraj"];

function NameSelect({
  label,
  names,
  value,
  onChange,
  required,
}: {
  label: string;
  names: string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const isOther = value === "__other__" || (value && !names.includes(value));
  const selectVal = isOther ? "__other__" : value;

  return (
    <div className="space-y-2">
      <Label>{label}{required ? " *" : ""}</Label>
      <Select
        value={selectVal}
        onValueChange={(v) => {
          if (v === "__other__") onChange("__other__");
          else onChange(v);
        }}
        required={required}
      >
        <SelectTrigger className="bg-background rounded-sm">
          <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
        </SelectTrigger>
        <SelectContent>
          {names.map((n) => (
            <SelectItem key={n} value={n}>{n}</SelectItem>
          ))}
          <SelectItem value="__other__">Other (enter manually)</SelectItem>
        </SelectContent>
      </Select>
      {isOther && (
        <Input
          autoFocus
          required={required}
          placeholder={`Enter ${label.toLowerCase()} name`}
          value={value === "__other__" ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-background rounded-sm"
        />
      )}
    </div>
  );
}

export default function SessionNew() {
  const [, setLocation] = useLocation();
  const { data: boms, isLoading: bomsLoading } = useListBoms();
  const createSession = useCreateSession();

  const [bomId, setBomId] = useState("");
  const [companyName, setCompanyName] = useState("UCAL ELECTRONICS PVT. LTD.");
  const [customerName, setCustomerName] = useState("");
  const [panelName, setPanelName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [shiftName, setShiftName] = useState("Morning");
  const [shiftDate, setShiftDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [productionCount, setProductionCount] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogoUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomId) return alert("Please select a BOM");
    const resolvedSupervisor = supervisorName === "__other__" ? "" : supervisorName;
    const resolvedOperator = operatorName === "__other__" ? "" : operatorName;
    if (!resolvedSupervisor) return alert("Please enter supervisor name");
    if (!resolvedOperator) return alert("Please enter operator name");

    createSession.mutate({
      data: {
        bomId: Number(bomId),
        companyName,
        customerName,
        panelName,
        supervisorName: resolvedSupervisor,
        operatorName: resolvedOperator,
        shiftName,
        shiftDate,
        productionCount: productionCount ? Number(productionCount) : undefined,
        logoUrl: logoUrl || undefined,
      },
    }, {
      onSuccess: (session) => setLocation(`/session/${session.id}`),
    });
  };

  if (bomsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
      <div className="mb-8 border-b border-border pb-4">
        <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">NEW SESSION SETUP</h1>
        <p className="text-muted-foreground mt-2 font-mono">Initialize a new verification run</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card p-8 border border-border rounded-sm space-y-8 font-mono">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-primary border-b border-border pb-2">JOB DETAILS</h2>

            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-background rounded-sm font-bold" />
            </div>

            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="bg-background rounded-sm" />
            </div>

            <div className="space-y-2">
              <Label>Panel / Assembly Name *</Label>
              <Input required value={panelName} onChange={(e) => setPanelName(e.target.value)} className="bg-background rounded-sm" />
            </div>

            <div className="space-y-2">
              <Label>Target Production Count</Label>
              <Input type="number" min="1" value={productionCount} onChange={(e) => setProductionCount(e.target.value)} className="bg-background rounded-sm" placeholder="Optional" />
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-lg font-bold text-primary border-b border-border pb-2">SHIFT & OPERATOR</h2>

            <NameSelect
              label="Supervisor Name"
              names={SUPERVISOR_NAMES}
              value={supervisorName}
              onChange={setSupervisorName}
              required
            />

            <NameSelect
              label="Operator Name"
              names={OPERATOR_NAMES}
              value={operatorName}
              onChange={setOperatorName}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Shift</Label>
                <Select value={shiftName} onValueChange={setShiftName}>
                  <SelectTrigger className="bg-background rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Morning">Morning</SelectItem>
                    <SelectItem value="Afternoon">Afternoon</SelectItem>
                    <SelectItem value="Night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" required value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} className="bg-background rounded-sm" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bill of Materials (BOM) *</Label>
              <Select value={bomId} onValueChange={setBomId} required>
                <SelectTrigger className="bg-background rounded-sm border-primary">
                  <SelectValue placeholder="Select a BOM..." />
                </SelectTrigger>
                <SelectContent>
                  {boms?.map((bom) => (
                    <SelectItem key={bom.id} value={bom.id.toString()}>
                      {bom.name} ({bom.itemCount} items)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <Label>Company Logo (Optional, for Reports)</Label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-32 border border-dashed border-border bg-background rounded-sm flex items-center justify-center overflow-hidden">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
            </div>
            <Input type="file" accept="image/*" onChange={handleLogoUpload} className="max-w-xs text-sm file:text-foreground file:bg-secondary file:border-0 file:rounded-sm file:px-2 file:py-1 rounded-sm cursor-pointer" />
          </div>
        </div>

        <div className="pt-8 flex justify-end">
          <Button type="submit" size="lg" disabled={createSession.isPending || !bomId} className="w-full md:w-auto font-mono text-lg tracking-wider rounded-sm px-12" data-testid="btn-start-run">
            {createSession.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Upload className="w-5 h-5 mr-2" />}
            START VERIFICATION RUN
          </Button>
        </div>
      </form>
    </div>
  );
}
