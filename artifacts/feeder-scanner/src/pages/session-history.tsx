import { useState } from "react";
import { useListSessions } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2, Search } from "lucide-react";

export default function SessionHistory() {
  const { data: sessions, isLoading } = useListSessions();
  const [search, setSearch] = useState("");

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const filtered = sessions?.filter(s => 
    s.panelName.toLowerCase().includes(search.toLowerCase()) ||
    s.operatorName.toLowerCase().includes(search.toLowerCase()) ||
    (s.bomName && s.bomName.toLowerCase().includes(search.toLowerCase()))
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || [];

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-border pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">SESSION HISTORY</h1>
          <p className="text-muted-foreground mt-2 font-mono">Past verification runs</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search sessions..." 
            className="pl-9 bg-background border-border font-mono rounded-sm"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-mono">DATE / TIME</TableHead>
              <TableHead className="font-mono">PANEL</TableHead>
              <TableHead className="font-mono">BOM</TableHead>
              <TableHead className="font-mono">OPERATOR</TableHead>
              <TableHead className="font-mono">STATUS</TableHead>
              <TableHead className="font-mono text-right">ACTION</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                  No sessions found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(session => (
                <TableRow key={session.id} className="border-border hover:bg-secondary/50">
                  <TableCell className="font-mono text-sm">
                    <div>{format(new Date(session.startTime), "MMM dd, yyyy")}</div>
                    <div className="text-muted-foreground text-xs">{format(new Date(session.startTime), "HH:mm")}</div>
                  </TableCell>
                  <TableCell className="font-mono font-bold text-primary">{session.panelName}</TableCell>
                  <TableCell className="font-mono text-sm">{session.bomName || session.bomId}</TableCell>
                  <TableCell className="font-mono text-sm">{session.operatorName}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-mono font-bold rounded-sm uppercase tracking-wider ${session.status === 'completed' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}`}>
                      {session.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="secondary" size="sm" className="rounded-sm font-mono">
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
  );
}
