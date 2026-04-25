// @ts-nocheck
import { useState } from "react";
import { useLocation } from "wouter";
import { useListBoms, useCreateSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Loader2, Upload } from "lucide-react";
import { appConfig } from "@/lib/appConfig";
import { AppLogo } from "@/components/AppLogo";

const SUPERVISOR_NAMES = ["Umesh Nagile", "Dhupchand Bhardwaj", "Maruti Birader"];
const OPERATOR_NAMES = ["Aarti", "Aniket", "Suraj"];
const QA_NAMES = ["Ravi Patel", "Priya Singh", "Amit Kumar"];
const MACHINES = ["YSM20R (YAMAHA)", "M20", "M10", "YSM20R+M20"];
const LINES = ["LINE-01", "LINE-02", "LINE-03", "LINE-04"];

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
  const [freeScanMode, setFreeScanMode] = useState(false);
  const [companyName, setCompanyName] = useState(appConfig.companyName);
  const [customerName, setCustomerName] = useState("");
  const [panelName, setPanelName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [qaName, setQaName] = useState("");
  const [shiftName, setShiftName] = useState("Morning");
  const [shiftDate, setShiftDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [productionCount, setProductionCount] = useState("");
  const [machineType, setMachineType] = useState("");
  const [lineNumber, setLineNumber] = useState("");
  const defaultLogoUrl = appConfig.logoUrl ?? "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeScanMode && !bomId) return alert("Please select a BOM or enable Free Scan Mode");
    const resolvedSupervisor = supervisorName === "__other__" ? "" : supervisorName;
    const resolvedOperator = operatorName === "__other__" ? "" : operatorName;
    if (!resolvedSupervisor) return alert("Please enter supervisor name");
    if (!resolvedOperator) return alert("Please enter operator name");

    createSession.mutate({
      data: {
        bomId: freeScanMode ? 0 : Number(bomId),
        companyName,
        customerName,
        panelName,
        supervisorName: resolvedSupervisor,
        operatorName: resolvedOperator,
        qaName: qaName || undefined,
        shiftName,
        shiftDate,
        machineType: machineType || undefined,
        lineNumber: lineNumber || undefined,
        productionCount: productionCount ? Number(productionCount) : undefined,
        logoUrl: defaultLogoUrl,
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

  // Defensive check: ensure boms is an array
  const bomsArray = Array.isArray(boms) ? boms : [];

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-4xl mx-auto">
      {/* Header - Responsive */}
      <div className="border-b border-border pb-3 sm:pb-4 lg:pb-4 flex items-center gap-2 sm:gap-3 lg:gap-4">
        <AppLogo className="h-10 sm:h-12 lg:h-14" />
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold tracking-tight text-foreground">NEW SESSION</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-mono">Initialize verification run</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-card p-4 sm:p-6 lg:p-8 border border-border rounded-sm space-y-6 sm:space-y-8 lg:space-y-8 font-mono">
        {/* Form Grid - Responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-8">
          {/* Left Column: Job Details */}
          <div className="space-y-4 sm:space-y-6 lg:space-y-6">
            <h2 className="text-base sm:text-lg lg:text-lg font-bold text-primary border-b border-border pb-2 tracking-wide">JOB DETAILS</h2>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Company Name *</Label>
              <Input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-background rounded-sm font-bold text-sm" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Customer Name</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="bg-background rounded-sm text-sm" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Panel / Assembly Name *</Label>
              <Input required value={panelName} onChange={(e) => setPanelName(e.target.value)} className="bg-background rounded-sm text-sm" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Production Count</Label>
              <Input type="number" min="1" value={productionCount} onChange={(e) => setProductionCount(e.target.value)} className="bg-background rounded-sm text-sm" placeholder="Optional" />
            </div>
          </div>

          {/* Right Column: Shift & Operator */}
          <div className="space-y-4 sm:space-y-6 lg:space-y-6">
            <h2 className="text-base sm:text-lg lg:text-lg font-bold text-primary border-b border-border pb-2 tracking-wide">SHIFT & OPERATOR</h2>

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

            <NameSelect
              label="QA Name"
              names={QA_NAMES}
              value={qaName}
              onChange={setQaName}
            />

            {/* Machine & Line Selection */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Machine</Label>
                <Select value={machineType} onValueChange={setMachineType}>
                  <SelectTrigger className="bg-background rounded-sm text-sm h-10 sm:h-10">
                    <SelectValue placeholder="Select machine..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MACHINES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Line</Label>
                <Select value={lineNumber} onValueChange={setLineNumber}>
                  <SelectTrigger className="bg-background rounded-sm text-sm h-10 sm:h-10">
                    <SelectValue placeholder="Select line..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LINES.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Shift Details - Responsive Grid */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Shift</Label>
                <Select value={shiftName} onValueChange={setShiftName}>
                  <SelectTrigger className="bg-background rounded-sm text-sm h-10 sm:h-10">
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
                <Label className="text-sm font-medium">Date</Label>
                <Input type="date" required value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} className="bg-background rounded-sm text-sm h-10 sm:h-10" />
              </div>
            </div>

            {/* BOM Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="free-scan" 
                  checked={freeScanMode} 
                  onChange={(e) => {
                    setFreeScanMode(e.target.checked);
                    if (e.target.checked) setBomId("");
                  }}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <Label htmlFor="free-scan" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  Free Scan Mode 
                  <span className="text-xs text-muted-foreground font-normal">(scan without BOM validation)</span>
                </Label>
              </div>
              {!freeScanMode && (
                <div>
                  <Label className="text-sm font-medium">Bill of Materials (BOM) *</Label>
                  <Select value={bomId} onValueChange={setBomId} required>
                    <SelectTrigger className="bg-background rounded-sm border-primary text-sm h-10 sm:h-10">
                      <SelectValue placeholder="Select a BOM..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bomsArray.map((bom) => (
                        <SelectItem key={bom.id} value={bom.id.toString()}>
                          {bom.name} ({bom.itemCount} items)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {freeScanMode && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 rounded-md text-sm text-amber-700 dark:text-amber-400">
                  <p className="font-bold mb-1">Free Scan Mode Active</p>
                  <p>You can scan any feeder numbers and spools without BOM validation. No component verification will be performed.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit Button - Responsive */}
        <div className="pt-6 sm:pt-8 lg:pt-8 flex justify-center lg:justify-end">
          <Button 
            type="submit" 
            disabled={createSession.isPending || (!freeScanMode && !bomId)} 
            className="w-full sm:w-auto font-mono text-sm sm:text-base tracking-wider rounded-sm px-6 sm:px-10 lg:px-12 py-2 sm:py-2 h-10 sm:h-auto"
            data-testid="btn-start-run"
          >
            {createSession.isPending ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin mr-2" /> : <Upload className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />}
            <span className="hidden sm:inline">START VERIFICATION RUN</span>
            <span className="sm:hidden">START RUN</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
