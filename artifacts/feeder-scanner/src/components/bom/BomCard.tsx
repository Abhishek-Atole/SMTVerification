import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Edit2, Copy, Archive, Trash2, MoreVertical, History, BadgeCheck } from "lucide-react";

export function BomCard({ bom, onDelete }: { bom: any; onDelete: (bom: any) => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const statusBadgeColor = {
    ACTIVE: "bg-green-100 text-green-800",
    DRAFT: "bg-amber-100 text-amber-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  }[bom.status] || "bg-blue-100 text-blue-800";

  const handleDelete = () => {
    onDelete(bom);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-orange-400 to-emerald-400" />

        {/* Header with Status Badge and Menu */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusBadgeColor}`}>
              {bom.status || "ACTIVE"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
              <History className="h-3.5 w-3.5" />
              Rev {bom.revisionLabel || "Original"}
            </span>
            {bom.isLatest && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-green-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                Latest
              </span>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="rounded-full">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setLocation(`/bom/${bom.id}`); toast({ title: "Opening", description: `Viewing BOM: ${bom.name}` }); }}>
              <Eye className="w-4 h-4 mr-2" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setLocation(`/bom/${bom.id}`); toast({ title: "Opening", description: `Editing BOM: ${bom.name}` }); }}>
              <Edit2 className="w-4 h-4 mr-2" /> Edit BOM
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast({ title: "Duplicate", description: "Duplicate feature coming soon" })}>
              <Copy className="w-4 h-4 mr-2" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast({ title: "Archive", description: "Archive feature coming soon" })}>
                <Archive className="w-4 h-4 mr-2" /> Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Title and Description */}
        <h3 className="mb-1 text-lg font-bold text-navy transition-colors group-hover:text-orange-700">{bom.name}</h3>
        {bom.description && (
          <p className="mb-4 line-clamp-2 text-sm text-gray-600">{bom.description}</p>
        )}

        {/* Meta Info */}
        <div className="mb-4 grid grid-cols-2 gap-2 text-sm text-gray-600">
          {bom.product && <div className="rounded-lg bg-gray-50 px-2.5 py-2">Product: <span className="font-semibold text-gray-800">{bom.product}</span></div>}
          {bom.customer && <div className="rounded-lg bg-gray-50 px-2.5 py-2">Customer: <span className="font-semibold text-gray-800">{bom.customer}</span></div>}
          {bom.version && <div className="rounded-lg bg-gray-50 px-2.5 py-2">Version: <span className="font-semibold text-gray-800">{bom.version}</span></div>}
          <div className="rounded-lg bg-gray-50 px-2.5 py-2">Revision: <span className="font-semibold text-gray-800">{bom.revisionLabel || "Original"}</span></div>
        </div>

        {/* Stats Grid */}
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white p-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-navy">{bom.itemCount || 0}</div>
            <div className="text-xs text-gray-600">Items</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-navy">{bom.makesCount || 0}</div>
            <div className="text-xs text-gray-600">Makes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-navy">{bom.revisionLabel || "—"}</div>
            <div className="text-xs text-gray-600">Rev Tag</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex-1 cursor-pointer border-2 border-navy bg-white font-semibold text-navy transition-colors hover:bg-gray-50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLocation(`/bom/${bom.id}?mode=view`);
              toast({ title: "View Mode", description: `Viewing BOM: ${bom.name}` });
            }}
          >
            <Eye className="w-4 h-4 mr-2" />
            View
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 cursor-pointer border-2 border-navy bg-white font-semibold text-navy transition-colors hover:bg-gray-50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLocation(`/bom/${bom.id}?mode=edit`);
              toast({ title: "Edit Mode", description: `Editing BOM: ${bom.name}` });
            }}
          >
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-2 border-navy bg-white font-semibold text-navy transition-colors hover:bg-gray-50"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete BOM?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-semibold">{bom.name}</span>? It will be moved to trash and recoverable for 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Move to Trash
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
