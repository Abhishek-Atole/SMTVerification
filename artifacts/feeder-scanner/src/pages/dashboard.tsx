// @ts-nocheck
import { useListSessions, useListBoms, useGetAnalyticsOverview, getGetAnalyticsOverviewQueryKey, useDeleteSession, getListSessionsQueryKey, useListDeletedSessions, getListDeletedSessionsQueryKey, useRecoverSession } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Boxes, CheckCircle2, Loader2, BarChart3, ScanLine, Clock, Trash2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
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
  const deleteSessionMutation = useDeleteSession();
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
  const [recoveringSessionId, setRecoveringSessionId] = useState<number | null>(null);

  // Trash bin hooks
  const { data: deletedSessions, isLoading: deletedSessionsLoading, refetch: refetchDeletedSessions } = useListDeletedSessions({
    query: { enabled: showTrashBin }
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
  
  const recoverSessionMutation = useRecoverSession();

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
            // Keep loading screen visible for at least 500ms
            setTimeout(() => {
              setDeletingSessionId(null);
              // Invalidate sessions query to refetch
              queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
            }, 500);
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
          queryClient.invalidateQueries({ queryKey: getListDeletedSessionsQueryKey() });
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center space-y-4 sm:space-y-6">
          <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-16 sm:h-20 mb-2" />
          <div className="w-20 sm:w-24 h-20 sm:h-24 bg-primary/10 rounded-full flex items-center justify-center mb-2 sm:mb-4">
            <ScanLine className="w-10 sm:w-12 h-10 sm:h-12 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground">Ready to Scan</h1>
          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-lg px-2">
            Start a new verification session or resume an active one.
          </p>
          <Button asChild size="lg" className="h-12 sm:h-16 px-6 sm:px-12 text-base sm:text-xl font-bold tracking-wide rounded-full shadow-lg hover:shadow-xl transition-all w-full sm:w-auto" data-testid="btn-start-session">
            <Link href="/session/new">START NEW SESSION</Link>
          </Button>
        </div>

        {activeSessions.length > 0 && (
          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-lg sm:text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
              <Play className="w-4 sm:w-5 h-4 sm:h-5 text-primary flex-shrink-0" /> Active Sessions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {activeSessions.map(session => (
                <Card key={session.id} className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-base sm:text-lg flex items-center justify-between gap-2 flex-wrap">
                      <span className="truncate">{session.panelName}</span>
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md uppercase tracking-wider font-semibold flex-shrink-0">Active</span>
                    </CardTitle>
                    <p className="text-xs sm:text-sm text-muted-foreground">{session.shiftName} - {session.operatorName}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2.5 mt-2 sm:mt-4">
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        BOM: {session.bomName || session.bomId}
                      </div>
                      <Button asChild size="sm" className="font-bold tracking-wide w-full sm:w-auto" data-testid={`btn-resume-session-${session.id}`}>
                        <Link href={`/session/${session.id}`}>RESUME</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {completedSessions.length > 0 && (
          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-lg sm:text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 sm:w-5 h-4 sm:h-5 text-success flex-shrink-0" /> Completed Sessions (Incomplete Only)
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-3">You can only delete incomplete changeovers below:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {completedSessions.map(session => {
                // Check if session is incomplete (has no scans or minimal scans)
                const isIncomplete = !session.scans || session.scans.length === 0;
                if (!isIncomplete) return null;
                
                return (
                  <Card key={session.id} className="bg-card border-border border-amber-200 dark:border-amber-800 hover:border-amber-400 transition-colors shadow-sm">
                    <CardHeader className="pb-2 sm:pb-3">
                      <CardTitle className="text-base sm:text-lg flex items-center justify-between gap-2 flex-wrap">
                        <span className="truncate">{session.panelName}</span>
                        <span className="text-xs px-2 py-1 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded-md uppercase tracking-wider font-semibold flex-shrink-0">Incomplete</span>
                      </CardTitle>
                      <p className="text-xs sm:text-sm text-muted-foreground">{session.shiftName}</p>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-2 mt-2 sm:mt-4">
                        <div className="text-xs sm:text-sm text-muted-foreground">
                          BOM: {session.bomName || "N/A"}
                        </div>
                        <div className="flex gap-2 w-full">
                          <Button 
                            asChild 
                            variant="secondary" 
                            size="sm" 
                            className="flex-1 font-medium"
                          >
                            <Link href={`/session/${session.id}/report`}>VIEW</Link>
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
                );
              })}
            </div>
            {completedSessions.filter(s => !s.scans || s.scans.length === 0).length === 0 && (
              <p className="text-muted-foreground text-sm py-4">No incomplete sessions available for deletion.</p>
            )}
          </div>
        )}

        {/* TRASH BIN SECTION */}
        <div className="space-y-3 sm:space-y-4 border-t border-border pt-6 sm:pt-8">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setShowTrashBin(!showTrashBin)}
              className="text-lg sm:text-xl font-bold border-b border-border pb-2 flex items-center gap-2 hover:text-muted-foreground transition-colors"
            >
              <Trash2 className="w-4 sm:w-5 h-4 sm:h-5 text-destructive flex-shrink-0" /> 
              Trash Bin
              <span className="text-xs px-2 py-1 bg-destructive/10 text-destructive rounded-md">
                {trashStats?.totalCount || 0}
              </span>
            </button>
            {(trashStats?.totalCount || 0) > 0 && (
              <Link href="/trash" className="text-xs text-blue-600 hover:text-blue-700 font-semibold">
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
                <p className="text-xs sm:text-sm text-muted-foreground py-4">Trash is empty. Deleted items will appear here.</p>
              ) : (
                <div>
                  {/* Trash Stats Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    <div className="bg-destructive/5 p-2 rounded">
                      <p className="text-xs text-muted-foreground">Sessions</p>
                      <p className="text-lg font-bold">{trashStats?.sessionCount || 0}</p>
                    </div>
                    <div className="bg-destructive/5 p-2 rounded">
                      <p className="text-xs text-muted-foreground">BOMs</p>
                      <p className="text-lg font-bold">{trashStats?.bomCount || 0}</p>
                    </div>
                    <div className="bg-destructive/5 p-2 rounded">
                      <p className="text-xs text-muted-foreground">BOM Items</p>
                      <p className="text-lg font-bold">{trashStats?.itemCount || 0}</p>
                    </div>
                    <div className="bg-destructive/5 p-2 rounded">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-lg font-bold">{trashStats?.totalCount || 0}</p>
                    </div>
                  </div>

                  {/* Recent Trash Items */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4">
                    {trashItems.items?.slice(0, 6).map((item: any) => {
                      const isRecovering = recoveringTrashItem?.type === item.type && recoveringTrashItem?.id === item.id;
                      const isDeleting = deletingTrashItem?.type === item.type && deletingTrashItem?.id === item.id;
                      return (
                        <Card key={`${item.type}-${item.id}`} className="bg-card border-border border-destructive/20 hover:border-destructive/40 transition-colors shadow-sm">
                          <CardHeader className="pb-2 sm:pb-3">
                            <CardTitle className="text-base sm:text-lg flex items-center justify-between gap-2 flex-wrap">
                              <span className="truncate text-sm">{item.name}</span>
                              <span className="text-xs px-2 py-1 bg-destructive/10 text-destructive rounded-md uppercase tracking-wider font-semibold flex-shrink-0">
                                {item.type.replace('_', ' ')}
                              </span>
                            </CardTitle>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              {new Date(item.deletedAt).toLocaleDateString()}
                              {item.deletedBy && ` • by ${item.deletedBy}`}
                            </p>
                          </CardHeader>
                          <CardContent>
                            <div className="flex gap-2 w-full">
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="flex-1 font-medium gap-1 text-xs"
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
                                className="font-medium gap-1 text-xs text-destructive hover:bg-destructive/10"
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
                    <Link href="/trash" className="inline-block mt-4 text-sm text-blue-600 hover:text-blue-700 font-semibold">
                      See all {trashStats?.totalCount} deleted items →
                    </Link>
                  )}
                </div>
              )}
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-12 sm:h-16 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">QA Dashboard</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Quality & Performance Overview</p>
            </div>
          </div>
          <Button asChild variant="outline" className="font-bold gap-2">
            <Link href="/analytics">
              <BarChart3 className="w-4 h-4" /> Full Analytics
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Scans</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{overview?.totalScans}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overall OK Rate</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-success">{overview?.overallOkRate?.toFixed(1) || 0}%</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Reject Count</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-destructive">{overview?.totalReject}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Sessions</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-primary">{overview?.activeSessions}</div></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success" /> Recently Completed Sessions
          </h2>
          {completedSessions.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No completed sessions.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedSessions.slice(0, 6).map(session => (
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
        <div className="space-y-4 border-t border-border pt-6">
          <h2 className="text-xl font-bold border-b border-border pb-2">Admin Controls</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-primary" />
                  BOM Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">Create, edit, and manage all BOMs in the system</p>
                <Button asChild variant="secondary" size="sm" className="w-full font-medium">
                  <Link href="/bom">Manage BOMs</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Advanced Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">Export and analyze comprehensive system data</p>
                <Button asChild variant="secondary" size="sm" className="w-full font-medium">
                  <Link href="/analytics">View Reports</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-destructive" />
                  Full Trash Access
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">View and manage all deleted items system-wide</p>
                <Button asChild variant="secondary" size="sm" className="w-full font-medium">
                  <Link href="/trash">View Trash</Link>
                </Button>
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

  // ENGINEER VIEW (Default)
  return (
    <>
    <div className="p-8 max-w-6xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end mb-4">
        <div className="flex items-center gap-4">
          <img src="/ucal-logo.svg" alt="UCAL Electronics" className="h-16" />
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Engineer Dashboard</h1>
            <p className="text-muted-foreground mt-2">System Status & Management</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline" className="font-bold gap-2">
            <Link href="/analytics">
              <BarChart3 className="w-4 h-4" /> Analytics
            </Link>
          </Button>
          <Button asChild className="font-bold tracking-wide" data-testid="btn-start-session">
            <Link href="/session/new">NEW SESSION</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Active Sessions
              <Play className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">{activeSessions.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Completed Sessions
              <CheckCircle2 className="w-4 h-4 text-success" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{completedSessions.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Total BOMs Configured
              <Boxes className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{totalBoms}</div>
            <div className="mt-2">
              <Button asChild variant="link" className="p-0 h-auto text-sm text-primary">
                <Link href="/bom">Manage BOMs &rarr;</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
          <Clock className="w-5 h-5" /> Active Sessions
        </h2>
        {activeSessions.length === 0 ? (
          <div className="p-8 text-center bg-secondary/30 rounded-lg border border-border border-dashed">
            <p className="text-muted-foreground font-medium">No active sessions. Start a new session to begin verification.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSessions.map(session => (
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

      <div className="space-y-4">
        <h2 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success" /> Recently Completed Sessions
        </h2>
        {completedSessions.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No completed sessions.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completedSessions.slice(0, 6).map(session => (
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
      <div className="space-y-4 border-t border-border pt-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">System Administration</h2>
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
    <DeleteLoadingOverlay />
    <RecoveryLoadingOverlay />
    </>
  );
}
