// @ts-nocheck
import { useState } from "react";
import { useListSessions } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2, Search, ChevronRight } from "lucide-react";

export default function SessionHistory() {
  const { data: sessions, isLoading } = useListSessions();
  const [search, setSearch] = useState("");

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  // Defensive check: ensure sessions is an array
  const sessionsArray = Array.isArray(sessions) ? sessions : [];
  
  const filtered = sessionsArray
    .filter(s => 
      s.panelName.toLowerCase().includes(search.toLowerCase()) ||
      s.operatorName.toLowerCase().includes(search.toLowerCase()) ||
      (s.bomName && s.bomName.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header - Responsive */}
      <div className="px-4 sm:px-6 lg:px-8 flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-10 sm:h-14" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-foreground">SESSION HISTORY</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-mono">Past verification runs</p>
            </div>
          </div>
        </div>

        {/* Search - Full Width on Mobile */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search by panel, operator, or BOM..." 
            className="pl-9 w-full bg-background border-border font-mono text-sm rounded-sm"
          />
        </div>
      </div>

      {/* Desktop Table View - Hidden on mobile */}
      <div className="hidden lg:block px-4 sm:px-6 lg:px-8">
        <div className="bg-card border border-border rounded-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs sm:text-sm">DATE / TIME</TableHead>
                <TableHead className="font-mono text-xs sm:text-sm">PANEL</TableHead>
                <TableHead className="font-mono text-xs sm:text-sm">BOM</TableHead>
                <TableHead className="font-mono text-xs sm:text-sm">OPERATOR</TableHead>
                <TableHead className="font-mono text-xs sm:text-sm">STATUS</TableHead>
                <TableHead className="font-mono text-xs sm:text-sm text-right">ACTION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono text-sm">
                    No sessions found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(session => (
                  <TableRow key={session.id} className="border-border hover:bg-secondary/50 transition-colors">
                    <TableCell className="font-mono text-xs sm:text-sm">
                      <div>{format(new Date(session.startTime), "MMM dd, yyyy")}</div>
                      <div className="text-muted-foreground text-xs">{format(new Date(session.startTime), "HH:mm")}</div>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-primary text-sm">{session.panelName}</TableCell>
                    <TableCell className="font-mono text-xs sm:text-sm">
                      {session.bomId === 0 ? (
                        <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded text-amber-800 dark:text-amber-400 text-xs font-bold">FREE SCAN</span>
                      ) : (
                        <span>{session.bomName || session.bomId}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs sm:text-sm">{session.operatorName}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 text-xs font-mono font-bold rounded-sm uppercase tracking-wider inline-block ${session.status === 'completed' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}`}>
                        {session.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="secondary" size="sm" className="rounded-sm font-mono text-xs sm:text-sm">
                        <Link href={`/session/${session.id}${session.status === 'completed' ? '/report' : ''}`}>
                          {session.status === 'completed' ? 'REPORT' : 'RESUME'}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile/Tablet Card View */}
      <div className="lg:hidden px-4 sm:px-6">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground font-mono">
            No sessions found.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(session => (
              <Link key={session.id} href={`/session/${session.id}${session.status === 'completed' ? '/report' : ''}`}>
                <div className="bg-card border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors active:bg-secondary cursor-pointer tap-highlight-transparent">
                  {/* Top Row: Date and Status */}
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <div className="flex-1">
                      <div className="font-mono text-xs text-muted-foreground">
                        {format(new Date(session.startTime), "MMM dd, yyyy HH:mm")}
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-mono font-bold rounded-sm uppercase tracking-wider whitespace-nowrap flex-shrink-0 ${session.status === 'completed' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}`}>
                      {session.status}
                    </span>
                  </div>

                  {/* Panel Name - Prominent */}
                  <div className="mb-3">
                    <div className="text-xs text-muted-foreground font-mono">PANEL</div>
                    <div className="font-mono font-bold text-primary text-base truncate">
                      {session.panelName}
                    </div>
                  </div>

                  {/* BOM and Operator - Two Columns */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="text-xs text-muted-foreground font-mono">BOM</div>
                      <div className="font-mono text-xs truncate flex items-center gap-2">
                        {session.bomId === 0 ? (
                          <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded text-amber-800 dark:text-amber-400 text-xs font-bold">FREE</span>
                        ) : (
                          <span>{session.bomName || session.bomId}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-mono">OPERATOR</div>
                      <div className="font-mono text-xs truncate">
                        {session.operatorName}
                      </div>
                    </div>
                  </div>

                  {/* Action Button - Full Width on Mobile, Icon on Tablet */}
                  <Button 
                    asChild 
                    variant="secondary" 
                    className="w-full rounded-md font-mono text-sm py-2 h-auto flex items-center justify-between"
                  >
                    <div>
                      <span>{session.status === 'completed' ? 'VIEW REPORT' : 'RESUME'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </Button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
