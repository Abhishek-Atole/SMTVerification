import { useEffect, useState } from "react";
import { Clock, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useSession } from "@/context/session-context";
import { AppLogo } from "@/components/AppLogo";
import { appConfig } from "@/lib/appConfig";
import { formatSmtSessionCode } from "@/lib/session-code";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user } = useAuth();
  const { activeSession, loading: sessionLoading } = useSession();
  const [time, setTime] = useState<string>(new Date().toLocaleTimeString());
  const [lastActionTime, setLastActionTime] = useState<string>(new Date().toLocaleTimeString());
  const [bomLoaded, setBomLoaded] = useState(true);
  const displaySessionId = activeSession ? formatSmtSessionCode(activeSession.startedAt, activeSession.id) : null;

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Track last action (document interaction)
  useEffect(() => {
    const updateLastAction = () => {
      setLastActionTime(new Date().toLocaleTimeString());
    };

    document.addEventListener("click", updateLastAction);
    document.addEventListener("keydown", updateLastAction);

    return () => {
      document.removeEventListener("click", updateLastAction);
      document.removeEventListener("keydown", updateLastAction);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-neutral-50">
      {/* Top Navbar */}
      <header className="border-b border-neutral-200 bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <AppLogo className="h-10 w-10" />
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-neutral-900">{appConfig.companyShort} — {appConfig.systemTitle}</h1>
              <p className="text-xs text-neutral-500">{appConfig.companyName}</p>
            </div>
          </div>

          <div className="flex items-center gap-8">
            {/* Clock */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-600" />
              <time className="font-mono text-sm font-semibold text-neutral-700">{time}</time>
            </div>

            {/* Job ID Badge */}
            {sessionLoading ? (
              <div className="px-3 py-1.5 rounded-full bg-neutral-100 border border-neutral-300">
                <p className="text-xs font-medium text-neutral-600">Session: Loading...</p>
              </div>
            ) : activeSession ? (
              <div className="px-3 py-1.5 rounded-full bg-teal-100 border border-teal-300">
                <p className="text-xs font-medium text-teal-900">Session: {displaySessionId}</p>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-full bg-amber-100 border border-amber-300">
                <p className="text-xs font-medium text-amber-900">No active session</p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Bottom Status Bar */}
      <footer className="border-t border-neutral-200 bg-white px-6 py-3 shadow-md">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            {/* Operator Mode */}
            <div className="flex flex-col">
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Operator Mode</span>
              <span className="font-semibold text-neutral-900">{user?.name || "Unknown"} — {user?.role || "N/A"}</span>
            </div>

            {/* Last Action */}
            <div className="flex flex-col">
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Last Action</span>
              <time className="font-mono text-neutral-700">{lastActionTime}</time>
            </div>
          </div>

          {/* BOM Loaded Status */}
          <div className="flex items-center gap-2">
            {bomLoaded ? (
              <>
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-neutral-700">BOM Loaded</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-700">BOM Not Loaded</span>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
