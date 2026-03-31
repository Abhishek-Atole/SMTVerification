import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings, ShieldCheck, ScanLine } from "lucide-react";

export default function Login() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"engineer" | "qa" | "operator" | null>(null);
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role) return;
    
    login(name.trim(), role);
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-tighter text-primary">SMT VERIFY</h1>
        <p className="text-muted-foreground mt-2">Feeder Scanning & Verification System</p>
      </div>

      <Card className="w-full max-w-xl shadow-lg border-border">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Authentication</CardTitle>
          <CardDescription className="text-center">Select your role and enter your name to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-8">
            <div className="space-y-4">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Select Role
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  type="button"
                  data-testid="role-engineer"
                  onClick={() => setRole("engineer")}
                  className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all ${
                    role === "engineer" 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-border hover:border-primary/50 text-muted-foreground"
                  }`}
                >
                  <Settings className="w-8 h-8 mb-2" />
                  <span className="font-medium">Engineer</span>
                  <span className="text-xs mt-1 opacity-80">Full Access</span>
                </button>
                
                <button
                  type="button"
                  data-testid="role-qa"
                  onClick={() => setRole("qa")}
                  className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all ${
                    role === "qa" 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-border hover:border-primary/50 text-muted-foreground"
                  }`}
                >
                  <ShieldCheck className="w-8 h-8 mb-2" />
                  <span className="font-medium">QA Engineer</span>
                  <span className="text-xs mt-1 opacity-80">Reports Only</span>
                </button>

                <button
                  type="button"
                  data-testid="role-operator"
                  onClick={() => setRole("operator")}
                  className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all ${
                    role === "operator" 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-border hover:border-primary/50 text-muted-foreground"
                  }`}
                >
                  <ScanLine className="w-8 h-8 mb-2" />
                  <span className="font-medium">Operator</span>
                  <span className="text-xs mt-1 opacity-80">Scanning Only</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Full Name
              </label>
              <Input
                id="name"
                data-testid="input-name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 text-lg"
              />
            </div>

            <Button 
              type="submit" 
              data-testid="button-login"
              className="w-full h-12 text-lg font-bold tracking-wide" 
              disabled={!name.trim() || !role}
            >
              LOGIN
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
