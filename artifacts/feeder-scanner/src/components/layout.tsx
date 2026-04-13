import { Link, useLocation } from "wouter";
import { LayoutDashboard, Boxes, History, PlusSquare, BarChart3, LogOut, Sun, Moon, Menu, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const NAV_ITEMS = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["engineer", "qa", "operator"] },
    { href: "/session/new", label: "New Session", icon: PlusSquare, roles: ["engineer", "operator"] },
    { href: "/bom", label: "BOM Manager", icon: Boxes, roles: ["engineer"] },
    { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["engineer", "qa"] },
    { href: "/sessions", label: "Session History", icon: History, roles: ["engineer", "qa", "operator"] },
    { href: "/trash", label: "Trash Bin", icon: Trash2, roles: ["engineer"] },
  ];

  const visibleNavItems = NAV_ITEMS.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground flex-col md:flex-row">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col shrink-0 transition-all duration-300 transform md:transform-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-sidebar-border bg-sidebar">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img src="/ucal-logo.svg" alt="UCAL" className="h-10 w-10 flex-shrink-0" />
            <span className="font-mono font-bold tracking-tight text-sm text-sidebar-primary hidden sm:inline truncate">
              SMT_VERIFY
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-full md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-full hidden md:inline-flex"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </Button>
        </div>
        
        {user && (
          <div className="p-3 md:p-4 border-b border-sidebar-border bg-sidebar-accent/50">
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm truncate">{user.name}</span>
              <span className="text-xs text-sidebar-foreground/70 uppercase tracking-wider">{user.role}</span>
            </div>
          </div>
        )}

        <nav className="flex-1 py-4 flex flex-col gap-1 px-2 md:px-3 overflow-y-auto">
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
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        {user && (
          <div className="p-3 md:p-4 border-t border-sidebar-border">
            <Button 
              variant="ghost" 
              className="w-full flex items-center justify-start gap-3 text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent text-sm"
              onClick={logout}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Logout</span>
            </Button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-border bg-background flex items-center justify-between px-4 sticky top-0 z-30">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1 text-center font-semibold text-sm truncate px-2">SMT-VERIFY</div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </Button>
        </div>
        {children}
      </main>
    </div>
  );
}
