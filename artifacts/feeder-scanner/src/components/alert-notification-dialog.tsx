import React from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { AlertNotification } from '@/hooks/use-notification';
import { unlockAudio } from '@/utils/buzzer-sounds';

interface AlertNotificationDialogProps {
  notification: AlertNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDismiss?: () => void;
}

const PRIORITY_COLORS = {
  critical: 'bg-red-900 border-red-700 text-white',
  high: 'bg-red-600 border-red-500',
  medium: 'bg-orange-500 border-orange-400',
  low: 'bg-blue-600 border-blue-500',
};

const BUTTON_COLORS = {
  critical: 'bg-red-900 hover:bg-red-800',
  high: 'bg-red-600 hover:bg-red-700',
  medium: 'bg-orange-600 hover:bg-orange-700',
  low: 'bg-blue-600 hover:bg-blue-700',
};

const ICON_COLORS = {
  error: 'text-red-600',
  duplicate: 'text-orange-600',
  warning: 'text-yellow-600',
  success: 'text-green-600',
};

const TYPE_ICONS = {
  error: XCircle,
  duplicate: AlertTriangle,
  warning: AlertCircle,
  success: CheckCircle2,
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: '🔴 CRITICAL',
  high: '⛔ HIGH',
  medium: '⚠️ MEDIUM',
  low: '📢 LOW',
};

export function AlertNotificationDialog({
  notification,
  open,
  onOpenChange,
  onDismiss,
}: AlertNotificationDialogProps) {
  const handleDismiss = () => {
    onOpenChange(false);
    onDismiss?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Allow Tab and navigation keys for accessibility
    const navigationKeys = [
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ];
    if (navigationKeys.includes(e.key)) {
      return;
    }

    // Dismiss on other keys (Enter, Escape, or any character) excluding modifiers
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      handleDismiss();
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleDismiss();
    } else {
      // Unlock audio on user interaction
      unlockAudio();
      onOpenChange(newOpen);
    }
  };

  if (!notification) {
    return (
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
          <AlertDialogHeader>
            <AlertDialogTitle>No Notifications</AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const IconComponent = TYPE_ICONS[notification.type];
  const buttonColor = BUTTON_COLORS[notification.priority];
  const priorityLabel = PRIORITY_LABELS[notification.priority];

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className={`sm:max-w-md border-2 ${PRIORITY_COLORS[notification.priority]}`}
        onKeyDown={handleKeyDown}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3 text-lg">
            <IconComponent className={`w-6 h-6 ${ICON_COLORS[notification.type]}`} />
            <div>
              <div className="text-sm font-semibold opacity-75">{priorityLabel}</div>
              <div>{notification.title || getTitleForType(notification.type)}</div>
            </div>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm sm:text-base font-mono mt-4 whitespace-pre-wrap">
            {notification.message}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Priority Indicator */}
        <div className="flex items-center gap-2 mt-4">
          <div className="flex-1 bg-gray-200 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full ${getPriorityBarColor(notification.priority)}`}
              style={{ width: getPriorityBarWidth(notification.priority) }}
            />
          </div>
          <span className="text-xs font-semibold">{notification.priority.toUpperCase()}</span>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-gray-500 mt-2">
          {new Date(notification.timestamp).toLocaleTimeString()}
        </div>

        <AlertDialogFooter className="mt-6">
          <AlertDialogAction
            onClick={handleDismiss}
            autoFocus
            className={`w-full font-bold text-lg sm:text-xl py-6 ${buttonColor}`}
          >
            ✓ OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getTitleForType(type: AlertNotification['type']): string {
  const titles = {
    error: '❌ ERROR',
    duplicate: '⚠️ DUPLICATE',
    warning: '⚡ WARNING',
    success: '✓ SUCCESS',
  };
  return titles[type];
}

function getPriorityBarColor(priority: string): string {
  const colors = {
    critical: 'bg-red-900',
    high: 'bg-red-600',
    medium: 'bg-orange-500',
    low: 'bg-blue-600',
  };
  return colors[priority as keyof typeof colors] || 'bg-gray-400';
}

function getPriorityBarWidth(priority: string): string {
  const widths = {
    critical: '100%',
    high: '75%',
    medium: '50%',
    low: '25%',
  };
  return widths[priority as keyof typeof widths] || '50%';
}
