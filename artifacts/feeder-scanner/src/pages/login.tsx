import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, ShieldCheck, ScanLine } from "lucide-react";

const NAMES_BY_ROLE: Record<string, string[]> = {
  engineer: ["Umesh Nagile", "Dhupchand Bhardwaj", "Maruti Birader"],
  qa: ["Abhishek Atole", "Viswajit"],
  operator: ["Aarti", "Aniket", "Suraj"],
};

export default function Login() {
  const [selectedName, setSelectedName] = useState("");
  const [customName, setCustomName] = useState("");
  const [role, setRole] = useState<"engineer" | "qa" | "operator" | null>(null);
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const names = role ? NAMES_BY_ROLE[role] ?? [] : [];
  const isOther = selectedName === "__other__";
  const finalName = isOther ? customName.trim() : selectedName;

  const handleRoleChange = (r: "engineer" | "qa" | "operator") => {
    setRole(r);
    setSelectedName("");
    setCustomName("");
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalName || !role) return;
    login(finalName, role);
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-tighter text-primary">UCAL ELECTRONICS</h1>
        <p className="text-lg font-bold text-foreground/80 mt-1">PVT. LTD.</p>
        <p className="text-muted-foreground mt-2">SMT Feeder Scanning & Verification System</p>
      </div>

      <Card className="w-full max-w-xl shadow-lg border-border">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Authentication</CardTitle>
          <CardDescription className="text-center">Select your role and name to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-8">
            <div className="space-y-4">
              <label className="text-sm font-medium">Select Role</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(["engineer", "qa", "operator"] as const).map((r) => {
                  const Icon = r === "engineer" ? Settings : r === "qa" ? ShieldCheck : ScanLine;
                  const label = r === "engineer" ? "Engineer" : r === "qa" ? "QA Engineer" : "Operator";
                  const sub = r === "engineer" ? "Full Access" : r === "qa" ? "Reports Only" : "Scanning Only";
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleChange(r)}
                      className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all ${
                        role === r
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-8 h-8 mb-2" />
                      <span className="font-medium">{label}</span>
                      <span className="text-xs mt-1 opacity-80">{sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {role && (
              <div className="space-y-3">
                <label className="text-sm font-medium">Select Name</label>
                <Select value={selectedName} onValueChange={setSelectedName}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Choose your name..." />
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
                    placeholder="Enter your full name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="h-12 text-lg"
                  />
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-lg font-bold tracking-wide"
              disabled={!finalName || !role}
            >
              LOGIN
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
