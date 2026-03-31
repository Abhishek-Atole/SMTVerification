import { Link, useLocation } from "wouter";
import { LayoutDashboard, Boxes, History, PlusSquare, BarChart3, LogOut, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const NAV_ITEMS = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["engineer", "qa", "operator"] },
    { href: "/session/new", label: "New Session", icon: PlusSquare, roles: ["engineer", "operator"] },
    { href: "/bom", label: "BOM Manager", icon: Boxes, roles: ["engineer"] },
    { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["engineer", "qa"] },
    { href: "/sessions", label: "Session History", icon: History, roles: ["engineer", "qa", "operator"] },
  ];

  const visibleNavItems = NAV_ITEMS.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="w-64 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col shrink-0 transition-colors">
        <div className="h-16 flex items-center justify-between px-6 border-b border-sidebar-border bg-sidebar">
          <span className="font-mono font-bold tracking-tight text-lg text-sidebar-primary">
            SMT_VERIFY
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-full"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </Button>
        </div>
        
        {user && (
          <div className="p-4 border-b border-sidebar-border bg-sidebar-accent/50">
            <div className="flex flex-col">
              <span className="font-bold text-sm truncate">{user.name}</span>
              <span className="text-xs text-sidebar-foreground/70 uppercase tracking-wider">{user.role}</span>
            </div>
          </div>
        )}

        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          {visibleNavItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors text-sm font-medium",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        {user && (
          <div className="p-4 border-t border-sidebar-border">
            <Button 
              variant="ghost" 
              className="w-full flex items-center justify-start gap-3 text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={logout}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        )}
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
