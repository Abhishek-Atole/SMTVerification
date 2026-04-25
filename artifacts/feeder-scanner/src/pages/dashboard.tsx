// @ts-nocheck
import { useListSessions, useListBoms, useGetAnalyticsOverview, getGetAnalyticsOverviewQueryKey, getListSessionsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Boxes, CheckCircle2, Loader2, BarChart3, ScanLine, Clock, Trash2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useState, useEffect } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useListSessions();
  
  // ALTERNATIVE APPROACH: Try using mutation-level callbacks instead
  // Uncomment this entire section and comment out the handleDeleteSession function below
  // if call-level callbacks don't work
  /*
  const deleteSessionMutation = useDeleteSession({
        setDeletingSessionId(null);
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        alert("Session deleted successfully");
      },
      onError: (error: any) => {
        setDeletingSessionId(null);
        const errorMsg = error?.data?.error || error?.message || "Unknown error";
        alert(`Failed to delete session: ${errorMsg}`);
      }
    }
  });
  
  const handleDeleteSession = (sessionId: number) => {
    const confirmed = window.confirm("Are you sure you want to delete this session? This action cannot be undone.");
    if (!confirmed) return;
    setDeletingSessionId(sessionId);
    deleteSessionMutation.mutate({ sessionId });
  };
  */

  // PRIMARY APPROACH: Using call-level callbacks
  const deleteSessionMutation = useMutation({
    mutationFn: ({ sessionId }: { sessionId: number }) =>
      api.delete(`/api/sessions/${sessionId}`),
  });
  const { data: boms, isLoading: bomsLoading } = useListBoms();
  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useGetAnalyticsOverview({
    query: { 
      queryKey: getGetAnalyticsOverviewQueryKey(),
      enabled: user?.role === "qa" || user?.role === "engineer",
      retry: 1
    }
  });

  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showTrashBin, setShowTrashBin] = useState(false);
  const [showAllActiveSessions, setShowAllActiveSessions] = useState(false);
  const [showAllCompletedSessions, setShowAllCompletedSessions] = useState(false);
  const [showAllAdminControls, setShowAllAdminControls] = useState(false);
  const [recoveringSessionId, setRecoveringSessionId] = useState<number | null>(null);

  // Trash bin hooks
  const deletedSessionsQueryKey = ["deleted-sessions"] as const;
  const { data: deletedSessions, isLoading: deletedSessionsLoading, refetch: refetchDeletedSessions } = useQuery({
    queryKey: deletedSessionsQueryKey,
    queryFn: async () => {
      const response = await api.get("/api/sessions/deleted");
      return response.data;
    },
    enabled: showTrashBin,
  });
  
  // Fetch comprehensive trash items (all data types)
  const { data: trashItems, isLoading: trashItemsLoading } = useQuery({
    queryKey: ["trash-items"],
    queryFn: async () => {
      const response = await api.get("/api/trash/items", {
        params: { limit: 100 }
      });
      return response.data;
    },
    enabled: showTrashBin,
    refetchInterval: 5000,
  });
  
  // Fetch comprehensive trash stats
  const { data: trashStats } = useQuery({
    queryKey: ["trash-stats"],
    queryFn: async () => {
      const response = await api.get("/api/trash/stats");
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });
  
  const recoverSessionMutation = useMutation({
    mutationFn: ({ sessionId }: { sessionId: number }) =>
      api.post(`/api/sessions/${sessionId}/recover`),
  });

  useEffect(() => {
    if (!deletingSessionId || !deleteSessionMutation.isPending) {
      setElapsedMs(0);
      return;
    }

    const startTime = Date.now();
    let frameId: number;
    
    const updateElapsed = () => {
      const elapsed = Date.now() - startTime;
      setElapsedMs(elapsed);
      frameId = requestAnimationFrame(updateElapsed);
    };
    
    frameId = requestAnimationFrame(updateElapsed);
    return () => cancelAnimationFrame(frameId);
  }, [deletingSessionId, deleteSessionMutation.isPending]);

  const handleDeleteSession = async (sessionId: number) => {
    const confirmed = window.confirm("Are you sure you want to delete this session? This action cannot be undone.");
    if (!confirmed) {
      return;
    }
    
    // Show loading immediately
    setDeletingSessionId(sessionId);
    
    try {
      deleteSessionMutation.mutate(
        { sessionId },
        {
          onSuccess: (data) => {
            setDeletingSessionId(null);
            // Invalidate sessions query to refetch
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          },
          onError: (error: any) => {
            setDeletingSessionId(null);
            const errorMsg = error?.response?.data?.error || error?.data?.error || error?.message || "Unknown error";
            alert(`Failed to delete session: ${errorMsg}`);
          },
          onSettled: () => {
          }
        }
      );
    } catch (err) {
      setDeletingSessionId(null);
      alert("An unexpected error occurred");
    }
  };

  const [recoveringTrashItem, setRecoveringTrashItem] = useState<{ type: string; id: number } | null>(null);
  const [deletingTrashItem, setDeletingTrashItem] = useState<{ type: string; id: number } | null>(null);

  const handleRecoverSession = async (sessionId: number, sessionName: string) => {
    const confirmed = window.confirm(`Are you sure you want to recover "${sessionName}" from trash?`);
    if (!confirmed) return;

    setRecoveringSessionId(sessionId);
    
    recoverSessionMutation.mutate(
      { sessionId },
      {
        onSuccess: () => {
          setRecoveringSessionId(null);
          queryClient.invalidateQueries({ queryKey: deletedSessionsQueryKey });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          refetchDeletedSessions();
        },
        onError: (error: any) => {
          setRecoveringSessionId(null);
          const errorMsg = error?.response?.data?.error || error?.data?.error || error?.message || "Unknown error";
          alert(`Failed to recover session: ${errorMsg}`);
        }
      }
    );
  };

  const handleRecoverTrashItem = async (itemType: string, itemId: number, itemName: string) => {
    const confirmed = window.confirm(`Are you sure you want to recover "${itemName}" from trash?`);
    if (!confirmed) return;

    setRecoveringTrashItem({ type: itemType, id: itemId });
    
    try {
      const response = await api.post(`/api/trash/${itemType}/${itemId}/recover`);
      if (response.status === 200 || response.status === 204) {
        queryClient.invalidateQueries({ queryKey: ["trash-items"] });
        queryClient.invalidateQueries({ queryKey: ["trash-stats"] });
        setRecoveringTrashItem(null);
        alert(`"${itemName}" recovered successfully!`);
      }
    } catch (error: any) {
      setRecoveringTrashItem(null);
      const errorMsg = error?.response?.data?.error || error?.message || "Unknown error";
      alert(`Failed to recover item: ${errorMsg}`);
    }
  };

  const handlePermanentDeleteTrashItem = async (itemType: string, itemId: number, itemName: string) => {
    const confirmed = window.confirm(`Permanently delete "${itemName}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingTrashItem({ type: itemType, id: itemId });
    
    try {
      const response = await api.delete(`/api/trash/${itemType}/${itemId}`);
      if (response.status === 200 || response.status === 204) {
        queryClient.invalidateQueries({ queryKey: ["trash-items"] });
        queryClient.invalidateQueries({ queryKey: ["trash-stats"] });
        setDeletingTrashItem(null);
        alert(`"${itemName}" permanently deleted.`);
      }
    } catch (error: any) {
      setDeletingTrashItem(null);
      const errorMsg = error?.response?.data?.error || error?.message || "Unknown error";
      alert(`Failed to delete item: ${errorMsg}`);
    }
  };

  // Show loading screen only if sessions or boms are loading
  // For overview, if it errors, we'll just render without it
  if (sessionsLoading || bomsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Delete loading overlay
  const DeleteLoadingOverlay = () => {
    if (!deletingSessionId || !deleteSessionMutation.isPending) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 pointer-events-auto animate-in fade-in duration-300">
        <div className="bg-background rounded-xl shadow-2xl p-8 flex flex-col items-center gap-4 border border-primary/30">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-base font-semibold text-foreground">Deleting session...</p>
          <p className="text-xs text-muted-foreground">Please wait</p>
          <p className="text-xs text-primary/70 font-mono">{elapsedMs}ms</p>
        </div>
      </div>
    );
  };

  // Recovery loading overlay
  const RecoveryLoadingOverlay = () => {
    if (!recoveringSessionId || !recoverSessionMutation.isPending) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 pointer-events-auto animate-in fade-in duration-300">
        <div className="bg-background rounded-xl shadow-2xl p-8 flex flex-col items-center gap-4 border border-success/30">
          <Loader2 className="w-12 h-12 animate-spin text-success" />
          <p className="text-base font-semibold text-foreground">Recovering session...</p>
          <p className="text-xs text-muted-foreground">Please wait</p>
        </div>
      </div>
    );
  };

  // Defensive check: ensure sessions is an array
  const sessionsArray = Array.isArray(sessions) ? sessions : [];
  const bomsArray = Array.isArray(boms) ? boms : [];

  const activeSessions = sessionsArray.filter(s => s.status === "active");
  const completedSessions = sessionsArray.filter(s => s.status === "completed");
  const totalBoms = bomsArray.length;

  // OPERATOR VIEW
  if (user?.role === "operator") {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-b from-background to-secondary/5 p-4 sm:p-8 lg:p-12">
          <div className="max-w-6xl mx-auto w-full space-y-10 animate-in fade-in duration-500">
            <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center space-y-6">
              <div className="flex items-center justify-center gap-3 mb-2">
                <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-12 sm:h-16" />
                <div className="hidden sm:block h-8 w-px bg-border" />
                <div className="text-left">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Welcome</p>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">Ready to Scan</h1>
                </div>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
                Start a new verification session or resume an active one to begin quality assurance checks.
              </p>
              <div className="pt-6">
                <Button asChild size="lg" className="h-16 px-10 text-lg font-bold rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70" data-testid="btn-start-session">
                  <Link href="/session/new">⚡ Start New Session</Link>
                </Button>
              </div>
            </div>

            {activeSessions.length > 0 && (
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg sm:text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
                    <Play className="w-4 sm:w-5 h-4 sm:h-5 text-primary flex-shrink-0" /> Active Sessions
                  </h2>
                  {activeSessions.length > 4 && (
                    <button
                      onClick={() => setShowAllActiveSessions(!showAllActiveSessions)}
                      className="text-xs px-3 py-1  text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                    >
                      {showAllActiveSessions ? "Show Less ↑" : `View All (${activeSessions.length}) ↓`}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {(showAllActiveSessions ? activeSessions : activeSessions.slice(0, 4)).map(session => (
                    <Card key={session.id} className="bg-gradient-to-br from-blue-50/50 to-blue-50/20 dark:from-blue-950/20 dark:to-background border-blue-200 dark:border-blue-800 hover:border-blue-400 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden">
                      <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-400"></div>
                      <CardHeader className="pb-3 sm:pb-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <CardTitle className="text-base sm:text-lg font-bold truncate leading-tight text-foreground">
                            {session.panelName}
                          </CardTitle>
                          <span className="text-xs px-3 py-1 bg-blue-500/90 text-white rounded-full font-semibold flex-shrink-0 whitespace-nowrap">Active</span>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{session.shiftName}</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded line-clamp-1">
                          BOM: {session.bomName || session.bomId}
                        </div>
                        <Button asChild className="w-full font-bold py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 hover:shadow-md transition-all duration-200" data-testid={`btn-resume-session-${session.id}`}>
                          <Link href={`/session/${session.id}`}>▶ RESUME</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {completedSessions.length > 0 && (
              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-lg sm:text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 sm:w-5 h-4 sm:h-5 text-success flex-shrink-0" /> Completed Sessions
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mb-3">Incomplete sessions available for deletion:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {completedSessions.map(session => {
                    const isIncomplete = !session.scans || session.scans.length === 0;
                    if (!isIncomplete) return null;
                    return (
                      <Card key={session.id} className="bg-gradient-to-br from-amber-50/50 to-amber-50/20 dark:from-amber-950/20 dark:to-background border-amber-200 dark:border-amber-800 hover:border-amber-400 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400"></div>
                        <CardHeader className="pb-3 sm:pb-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <CardTitle className="text-base sm:text-lg font-bold truncate leading-tight text-foreground">
                              {session.panelName}
                            </CardTitle>
                            <span className="text-xs px-3 py-1 bg-amber-500/90 text-white rounded-full font-semibold flex-shrink-0 whitespace-nowrap">Incomplete</span>
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{session.shiftName}</p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded line-clamp-1">
                            BOM: {session.bomName || "N/A"}
                          </div>
                          <div className="flex gap-2 w-full">
                            <Button asChild className="flex-1 font-semibold py-2 h-9 text-sm rounded-lg bg-blue-600 hover:bg-blue-700" size="sm">
                              <Link href={`/session/${session.id}/report`}>📋 VIEW</Link>
                            </Button>
                            <Button className="font-semibold py-2 h-9 text-sm rounded-lg bg-red-600 hover:bg-red-700 transition-all duration-200" size="sm" disabled={deleteSessionMutation.isPending && deletingSessionId === session.id} onClick={() => handleDeleteSession(session.id)}>
                              {deleteSessionMutation.isPending && deletingSessionId === session.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>🗑️ DELETE</>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <DeleteLoadingOverlay />
        <RecoveryLoadingOverlay />
      </>
    );
  }

  // QA ENGINEER VIEW
  if (user?.role === "qa") {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-b from-background to-secondary/5 p-4 sm:p-8 lg:p-12">
        <div className="max-w-6xl mx-auto w-full space-y-10 animate-in fade-in duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-14 sm:h-16 flex-shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Quality Assurance</p>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">QA Dashboard</h1>
              </div>
            </div>
            <Button asChild className="font-bold gap-2 h-12 px-6 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5" size="lg">
              <Link href="/analytics">
                📊 Analytics
              </Link>
            </Button>
          </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/80 to-blue-50/40 dark:from-blue-950/30 dark:to-background shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10"></div>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-muted-foreground">📊 Scans</CardTitle>
            </CardHeader>
            <CardContent><div className="text-3xl sm:text-4xl font-black text-blue-600">{overview?.totalScans ?? '-'}</div></CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50/80 to-green-50/40 dark:from-green-950/30 dark:to-background shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full -mr-10 -mt-10"></div>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-muted-foreground">✅ OK Rate</CardTitle>
            </CardHeader>
            <CardContent><div className="text-3xl sm:text-4xl font-black text-green-600">{overview?.overallOkRate?.toFixed(1) ?? '-'}%</div></CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500 bg-gradient-to-br from-red-50/80 to-red-50/40 dark:from-red-950/30 dark:to-background shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full -mr-10 -mt-10"></div>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-muted-foreground">❌ Rejected</CardTitle>
            </CardHeader>
            <CardContent><div className="text-3xl sm:text-4xl font-black text-red-600">{overview?.totalReject ?? '-'}</div></CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/80 to-purple-50/40 dark:from-purple-950/30 dark:to-background shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full -mr-10 -mt-10"></div>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-muted-foreground">▶️ Active</CardTitle>
            </CardHeader>
            <CardContent><div className="text-3xl sm:text-4xl font-black text-purple-600">{overview?.activeSessions ?? '-'}</div></CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <div className="w-1 h-8 bg-green-500 rounded-full"></div>
                Recently Completed
              </h2>
              <p className="text-sm text-muted-foreground">Latest verification session results</p>
            </div>
            {completedSessions.length > 4 && (
              <button
                onClick={() => setShowAllCompletedSessions(!showAllCompletedSessions)}
                className="text-sm px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg font-semibold transition-colors"
              >
                {showAllCompletedSessions ? "Show Less" : `View All (${completedSessions.length})`}
              </button>
            )}
          </div>
          {completedSessions.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No completed sessions.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(showAllCompletedSessions ? completedSessions : completedSessions.slice(0, 4)).map(session => (
                <Card key={session.id} className="bg-card shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="truncate">{session.panelName}</span>
                      <span className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleDateString()}</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">BOM: {session.bomName || session.bomId}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button asChild variant="secondary" size="sm" className="flex-1 font-medium">
                        <Link href={`/session/${session.id}/report`}>VIEW REPORT</Link>
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="font-medium gap-1"
                        disabled={deleteSessionMutation.isPending && deletingSessionId === session.id}
                        onClick={() => handleDeleteSession(session.id)}
                      >
                        {deleteSessionMutation.isPending && deletingSessionId === session.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        DELETE
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* TRASH BIN SECTION */}
        <div className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setShowTrashBin(!showTrashBin)}
              className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2 hover:text-muted-foreground transition-colors"
            >
              <Trash2 className="w-5 h-5 text-destructive flex-shrink-0" /> 
              Trash Bin
              <span className="text-xs px-2 py-1 bg-destructive/10 text-destructive rounded-md">
                {trashStats?.totalCount || 0}
              </span>
            </button>
            {(trashStats?.totalCount || 0) > 0 && (
              <Link href="/trash" className="text-sm text-blue-600 hover:text-blue-700 font-semibold">
                View All →
              </Link>
            )}
          </div>
          
          {showTrashBin && (
            <div>
              {trashItemsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !trashItems || trashItems.items?.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">Trash is empty. Deleted items will appear here.</p>
              ) : (
                <div>
                  {/* Trash Stats Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    <div className="bg-destructive/5 p-3 rounded">
                      <p className="text-xs text-muted-foreground">Sessions</p>
                      <p className="text-xl font-bold">{trashStats?.sessionCount || 0}</p>
                    </div>
                    <div className="bg-destructive/5 p-3 rounded">
                      <p className="text-xs text-muted-foreground">BOMs</p>
                      <p className="text-xl font-bold">{trashStats?.bomCount || 0}</p>
                    </div>
                    <div className="bg-destructive/5 p-3 rounded">
                      <p className="text-xs text-muted-foreground">BOM Items</p>
                      <p className="text-xl font-bold">{trashStats?.itemCount || 0}</p>
                    </div>
                    <div className="bg-destructive/5 p-3 rounded">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-xl font-bold">{trashStats?.totalCount || 0}</p>
                    </div>
                  </div>

                  {/* Recent Trash Items */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {trashItems.items?.slice(0, 6).map((item: any) => {
                      const isRecovering = recoveringTrashItem?.type === item.type && recoveringTrashItem?.id === item.id;
                      const isDeleting = deletingTrashItem?.type === item.type && deletingTrashItem?.id === item.id;
                      return (
                        <Card key={`${item.type}-${item.id}`} className="bg-gradient-to-br from-red-50/50 to-red-50/20 dark:from-red-950/20 dark:to-background border-red-200 dark:border-red-800 hover:border-red-400 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                          <div className="h-1 bg-gradient-to-r from-red-500 to-red-400"></div>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <CardTitle className="text-sm font-bold truncate text-foreground leading-tight">{item.name}</CardTitle>
                              <span className="text-xs px-3 py-1 bg-red-500/90 text-white rounded-full font-semibold flex-shrink-0 whitespace-nowrap">
                                {item.type.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.deletedAt).toLocaleDateString()}
                              {item.deletedBy && ` • by ${item.deletedBy}`}
                            </p>
                          </CardHeader>
                          <CardContent>
                            <div className="flex gap-2 w-full">
                              <Button 
                                className="flex-1 font-semibold py-2 h-9 text-sm rounded-lg bg-green-600 hover:bg-green-700 transition-all duration-200" 
                                size="sm" 
                                disabled={isRecovering || isDeleting}
                                onClick={() => handleRecoverTrashItem(item.type, item.id, item.name)}
                              >
                                {isRecovering ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>↩️ RESTORE</>
                                )}
                              </Button>
                              <Button 
                                className="font-semibold py-2 h-9 text-sm rounded-lg bg-gray-600 hover:bg-gray-700 transition-all duration-200" 
                                size="sm" 
                                disabled={isRecovering || isDeleting}
                                onClick={() => handlePermanentDeleteTrashItem(item.type, item.id, item.name)}
                              >
                                {isDeleting ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>🗑️</>
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {(trashItems.items?.length || 0) > 6 && (
                    <Button asChild variant="link" className="mt-4 p-0 h-auto text-sm font-semibold text-blue-600 hover:text-blue-700">
                      <Link href="/trash" className="no-underline text-blue-600 hover:text-blue-700">
                        See all {trashStats?.totalCount} deleted items →
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ADMIN CONTROL PANEL - QA FULL ACCESS */}
        <div className="space-y-6 border-t border-border pt-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <div className="w-1 h-8 bg-orange-500 rounded-full"></div>
                Admin Controls
              </h2>
              <p className="text-sm text-muted-foreground">System management and access</p>
            </div>
            {showAllAdminControls && (
              <button
                onClick={() => setShowAllAdminControls(!showAllAdminControls)}
                className="text-sm px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg font-semibold transition-colors"
              >
                Show Less
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
            <Card className="bg-gradient-to-br from-blue-50/50 to-blue-50/20 dark:from-blue-950/20 dark:to-background border-blue-200 dark:border-blue-800 hover:border-blue-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-2 cursor-pointer overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-400"></div>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><Boxes className="w-5 h-5 text-blue-600" /></div>
                  BOMs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-2">Create & manage bill of materials</p>
                <Button asChild className="w-full font-bold py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 hover:shadow-md transition-all duration-200">
                  <Link href="/bom">📦 Manage</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50/50 to-purple-50/20 dark:from-purple-950/20 dark:to-background border-purple-200 dark:border-purple-800 hover:border-purple-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-2 cursor-pointer overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-purple-500 to-purple-400"></div>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><BarChart3 className="w-5 h-5 text-purple-600" /></div>
                  Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-2">Analytics & export data</p>
                <Button asChild className="w-full font-bold py-2 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 hover:shadow-md transition-all duration-200">
                  <Link href="/analytics">📊 View</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-50/50 to-red-50/20 dark:from-red-950/20 dark:to-background border-red-200 dark:border-red-800 hover:border-red-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-2 cursor-pointer overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-red-500 to-red-400"></div>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-3 text-foreground">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg"><Trash2 className="w-5 h-5 text-red-600" /></div>
                  Trash
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-2">Recover or delete items</p>
                <Button asChild className="w-full font-bold py-2 h-10 rounded-lg bg-red-600 hover:bg-red-700 hover:shadow-md transition-all duration-200">
                  <Link href="/trash">🗑️ Access</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      </div>
      <DeleteLoadingOverlay />
      <RecoveryLoadingOverlay />
      </>
    );
  }

  // ENGINEER VIEW (Default)
  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/5 p-4 sm:p-8 lg:p-12">
        <div className="max-w-6xl mx-auto w-full space-y-10 animate-in fade-in duration-500">
          <div className="flex justify-between items-start sm:items-center gap-6 flex-col sm:flex-row">
            <div className="flex items-center gap-4">
              <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-16" />
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Operations</p>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">Engineer Dashboard</h1>
              </div>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <Button asChild variant="outline" className="font-semibold gap-2 flex-1 sm:flex-none h-11">
                <Link href="/analytics">
                  <BarChart3 className="w-4 h-4" /> Analytics
                </Link>
              </Button>
              <Button asChild className="font-semibold flex-1 sm:flex-none h-11" data-testid="btn-start-session">
                <Link href="/session/new">New Session</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-0 bg-gradient-to-br from-blue-50/50 to-background hover:shadow-md transition-shadow duration-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs uppercase tracking-widest font-semibold text-muted-foreground flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  Active Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-blue-600">{activeSessions.length}</div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-gradient-to-br from-green-50/50 to-background hover:shadow-md transition-shadow duration-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs uppercase tracking-widest font-semibold text-muted-foreground flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  Completed Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-green-600">{completedSessions.length}</div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-gradient-to-br from-purple-50/50 to-background hover:shadow-md transition-shadow duration-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs uppercase tracking-widest font-semibold text-muted-foreground flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  BOMs Configured
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-4xl font-bold text-purple-600">{totalBoms}</div>
                  <Button asChild variant="link" className="p-0 h-auto text-xs text-purple-600 font-semibold">
                    <Link href="/bom">Manage →</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <div className="w-1 h-8 bg-blue-500 rounded-full"></div>
              Active Sessions
            </h2>
            <p className="text-sm text-muted-foreground">Currently running verification sessions</p>
          </div>
          {activeSessions.length > 4 && (
            <button
              onClick={() => setShowAllActiveSessions(!showAllActiveSessions)}
              className="text-sm px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg font-semibold transition-colors"
            >
              {showAllActiveSessions ? "Show Less" : `View All (${activeSessions.length})`}
            </button>
          )}
        </div>
        {activeSessions.length === 0 ? (
          <div className="p-8 text-center bg-secondary/30 rounded-lg border border-border border-dashed">
            <p className="text-muted-foreground font-medium">No active sessions. Start a new session to begin verification.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(showAllActiveSessions ? activeSessions : activeSessions.slice(0, 4)).map(session => (
              <Card key={session.id} className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className="truncate">{session.panelName}</span>
                    <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md uppercase tracking-wider font-semibold">Active</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{session.shiftName} - {session.operatorName}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="text-sm text-muted-foreground">
                      BOM: {session.bomName || session.bomId}
                    </div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" className="flex-1 font-bold tracking-wide" data-testid={`btn-resume-session-${session.id}`}>
                        <Link href={`/session/${session.id}`}>RESUME</Link>
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="font-medium gap-1"
                        disabled={deleteSessionMutation.isPending && deletingSessionId === session.id}
                        onClick={() => handleDeleteSession(session.id)}
                      >
                        {deleteSessionMutation.isPending && deletingSessionId === session.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        DELETE
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <div className="w-1 h-8 bg-green-500 rounded-full"></div>
              Recently Completed
            </h2>
            <p className="text-sm text-muted-foreground">Latest verification session results</p>
          </div>
          {completedSessions.length > 4 && (
            <button
              onClick={() => setShowAllCompletedSessions(!showAllCompletedSessions)}
              className="text-sm px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg font-semibold transition-colors"
            >
              {showAllCompletedSessions ? "Show Less" : `View All (${completedSessions.length})`}
            </button>
          )}
        </div>
        {completedSessions.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No completed sessions.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(showAllCompletedSessions ? completedSessions : completedSessions.slice(0, 4)).map(session => (
              <Card key={session.id} className="bg-card shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className="truncate">{session.panelName}</span>
                    <span className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleDateString()}</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">BOM: {session.bomName || session.bomId}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button asChild variant="secondary" size="sm" className="flex-1 font-medium">
                      <Link href={`/session/${session.id}/report`}>VIEW REPORT</Link>
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="font-medium gap-1"
                      disabled={deleteSessionMutation.isPending && deletingSessionId === session.id}
                      onClick={() => handleDeleteSession(session.id)}
                    >
                      {deleteSessionMutation.isPending && deletingSessionId === session.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      DELETE
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6 border-t border-border pt-8">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setShowTrashBin(!showTrashBin)}
            className="text-2xl font-bold flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-1 h-8 bg-red-500 rounded-full"></div>
            Trash Bin
            <span className="text-xs px-3 py-1 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg font-semibold ml-2">
              {trashStats?.totalCount || 0} items
            </span>
          </button>
          {(trashStats?.totalCount || 0) > 0 && (
            <Button asChild variant="link" className="p-0 h-auto text-sm font-semibold text-blue-600 hover:text-blue-700">
              <Link href="/trash" className="no-underline text-blue-600 hover:text-blue-700">
                View All →
              </Link>
            </Button>
          )}
        </div>
        
        {showTrashBin && (
          <div>
            {trashItemsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !trashItems || trashItems.items?.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Trash is empty. Deleted items will appear here.</p>
            ) : (
              <div>
                {/* Trash Stats Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  <div className="bg-destructive/5 p-3 rounded">
                    <p className="text-xs text-muted-foreground">Sessions</p>
                    <p className="text-xl font-bold">{trashStats?.sessionCount || 0}</p>
                  </div>
                  <div className="bg-destructive/5 p-3 rounded">
                    <p className="text-xs text-muted-foreground">BOMs</p>
                    <p className="text-xl font-bold">{trashStats?.bomCount || 0}</p>
                  </div>
                  <div className="bg-destructive/5 p-3 rounded">
                    <p className="text-xs text-muted-foreground">BOM Items</p>
                    <p className="text-xl font-bold">{trashStats?.itemCount || 0}</p>
                  </div>
                  <div className="bg-destructive/5 p-3 rounded">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-xl font-bold">{trashStats?.totalCount || 0}</p>
                  </div>
                </div>

                {/* Recent Trash Items */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {trashItems.items?.slice(0, 6).map((item: any) => {
                    const isRecovering = recoveringTrashItem?.type === item.type && recoveringTrashItem?.id === item.id;
                    const isDeleting = deletingTrashItem?.type === item.type && deletingTrashItem?.id === item.id;
                    return (
                      <Card key={`${item.type}-${item.id}`} className="bg-card border-border border-destructive/20 hover:border-destructive/40 transition-colors shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg flex items-center justify-between">
                            <span className="truncate">{item.name}</span>
                            <span className="text-xs px-2 py-1 bg-destructive/10 text-destructive rounded-md uppercase tracking-wider font-semibold">
                              {item.type.replace('_', ' ')}
                            </span>
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {new Date(item.deletedAt).toLocaleDateString()}
                            {item.deletedBy && ` • by ${item.deletedBy}`}
                          </p>
                        </CardHeader>
                        <CardContent>
                          <div className="flex gap-2">
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              className="flex-1 font-medium gap-1"
                              disabled={isRecovering || isDeleting}
                              onClick={() => handleRecoverTrashItem(item.type, item.id, item.name)}
                            >
                              {isRecovering ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "↻"
                              )}
                              {isRecovering ? "RECOVERING" : "RECOVER"}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="font-medium gap-1 text-destructive hover:bg-destructive/10"
                              disabled={isRecovering || isDeleting}
                              onClick={() => handlePermanentDeleteTrashItem(item.type, item.id, item.name)}
                            >
                              {isDeleting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {(trashItems.items?.length || 0) > 6 && (
                  <Button asChild variant="link" className="mt-4 p-0 h-auto text-sm font-semibold text-blue-600 hover:text-blue-700">
                    <Link href="/trash" className="no-underline text-blue-600 hover:text-blue-700">
                      View all {trashStats?.totalCount} deleted items →
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ADVANCED SYSTEM ADMINISTRATION - ENGINEER FULL CONTROL */}
      <div className="space-y-6 border-t border-border pt-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <div className="w-1 h-8 bg-orange-500 rounded-full"></div>
              System Administration
            </h2>
            <p className="text-sm text-muted-foreground">Advanced tools and controls</p>
          </div>
          {showAllAdminControls && (
            <button
              onClick={() => setShowAllAdminControls(!showAllAdminControls)}
              className="text-sm px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg font-semibold transition-colors"
            >
              Show Less
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Boxes className="w-4 h-4 text-primary" />
                BOM Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Create, modify, delete, and manage all BOMs and components</p>
              <Button asChild variant="secondary" size="sm" className="w-full font-medium">
                <Link href="/bom">Manage BOMs</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                System Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">View comprehensive analytics, reports, and system health metrics</p>
              <Button asChild variant="secondary" size="sm" className="w-full font-medium">
                <Link href="/analytics">View Analytics</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-destructive" />
                Trash Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Full system trash access with recovery and permanent delete capabilities</p>
              <Button asChild variant="secondary" size="sm" className="w-full font-medium">
                <Link href="/trash">Manage Trash</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-primary" />
                Session Control
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Full control over all sessions: create, resume, view, and delete</p>
              <Button asChild variant="secondary" size="sm" className="w-full font-medium">
                <Link href="/session/new">New Session</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Permission Summary */}
        <Card className="bg-primary/5 border-primary/20 shadow-sm mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Full System Access Enabled</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>✓ Create and manage all sessions (active, completed, incomplete)</li>
              <li>✓ Create, edit, and delete BOMs and BOM items</li>
              <li>✓ Access full system analytics and reporting</li>
              <li>✓ View and manage all deleted items in system trash</li>
              <li>✓ Recover or permanently delete any system resource</li>
              <li>✓ View real-time system status and metrics</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
    <DeleteLoadingOverlay />
    <RecoveryLoadingOverlay />
    </>
  );
}
