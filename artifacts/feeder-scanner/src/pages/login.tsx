import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings, ShieldCheck, ScanLine } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState<"engineer" | "qa" | "operator" | null>(null);
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleRoleChange = (r: "engineer" | "qa" | "operator") => {
    setRole(r);
    setPassword("");
    setError("");
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username.trim() || !role) return;
    try {
      setError("");
      await login(username.trim(), role, password);
      setLocation("/");
    } catch (error: unknown) {
      console.warn("[Login] Authentication failed", error);
      setError(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-32 mx-auto mb-4" />
        <h1 className="text-3xl font-black tracking-tighter text-primary">UCAL ELECTRONICS</h1>
        <p className="text-lg font-bold text-foreground/80 mt-1">PVT. LTD.</p>
        <p className="text-muted-foreground mt-2">SMT Feeder Scanning & Verification System</p>
      </div>

      <Card className="w-full max-w-xl shadow-lg border-border">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Authentication</CardTitle>
          <CardDescription className="text-center">Select your role and enter credentials to continue</CardDescription>
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

            <div className="space-y-3">
              <label className="text-sm font-medium" htmlFor="username">
                Username
              </label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 text-lg"
              />
            </div>

            {role && (
              <div className="space-y-3">
                <label className="text-sm font-medium" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 text-lg"
                />
              </div>
            )}

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <Button
              type="submit"
              className="w-full h-12 text-lg font-bold tracking-wide"
              disabled={!username.trim() || !role || !password}
            >
              LOGIN
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
