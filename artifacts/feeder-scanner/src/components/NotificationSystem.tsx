import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from "lucide-react";

type NotificationType = "success" | "error" | "warning" | "info";

interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  details?: string;
  createdAt: number;
  autoDismissMs: number;
  onDismiss?: () => void;
}

interface NotificationContextValue {
  notify: {
    success: (message: string, details?: string) => void;
    error: (message: string, details?: string, onDismiss?: () => void) => void;
    warning: (message: string, details?: string) => void;
    info: (message: string, details?: string) => void;
  };
}

const NOTIFICATION_LIMIT = 5;

const TYPE_STYLE: Record<NotificationType, { title: string; color: string; Icon: typeof CheckCircle2 }> = {
  success: { title: "SUCCESS", color: "#16a34a", Icon: CheckCircle2 },
  error: { title: "ERROR", color: "#dc2626", Icon: XCircle },
  warning: { title: "WARNING", color: "#d97706", Icon: TriangleAlert },
  info: { title: "INFO", color: "#2563eb", Icon: Info },
};

const AUTO_DISMISS_MS: Record<NotificationType, number> = {
  success: 3000,
  warning: 4000,
  error: 10000,
  info: 5000,
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function playBuzzer(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);

    oscillator.onended = () => {
      void audioContext.close();
    };
  } catch {
    // Ignore audio failures (autoplay restrictions, unsupported browsers).
  }
}

function NotificationToast({
  item,
  onClose,
}: {
  item: NotificationItem;
  onClose: (id: string) => void;
}) {
  const style = TYPE_STYLE[item.type];
  const { Icon } = style;

  useEffect(() => {
    if (item.type === "error") {
      playBuzzer();
    }
  }, [item.type]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2 }}
      className="relative w-full max-w-[360px] overflow-hidden rounded-md border bg-card shadow-lg"
      data-testid={`notification-${item.id}`}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5" style={{ color: style.color }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{style.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{item.message}</p>
          {item.details ? <p className="mt-1 text-xs text-muted-foreground">{item.details}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onClose(item.id)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-0.5" style={{ backgroundColor: style.color }} />
    </motion.div>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.onDismiss) target.onDismiss();
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const push = useCallback(
    (type: NotificationType, message: string, details?: string, onDismiss?: () => void) => {
      const item: NotificationItem = {
        id: createId(),
        type,
        message,
        details,
        createdAt: Date.now(),
        autoDismissMs: AUTO_DISMISS_MS[type],
        onDismiss,
      };

      setItems((prev) => {
        const next = [...prev, item];
        if (next.length <= NOTIFICATION_LIMIT) return next;

        const [oldest, ...rest] = next;
        const oldTimer = timersRef.current.get(oldest.id);
        if (oldTimer) {
          clearTimeout(oldTimer);
          timersRef.current.delete(oldest.id);
        }
        if (oldest.onDismiss) oldest.onDismiss();
        return rest;
      });

      const timer = setTimeout(() => dismiss(item.id), item.autoDismissMs);
      timersRef.current.set(item.id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notify: {
        success: (message, details) => push("success", message, details),
        error: (message, details, onDismiss) => push("error", message, details, onDismiss),
        warning: (message, details) => push("warning", message, details),
        info: (message, details) => push("info", message, details),
      },
    }),
    [push],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="fixed right-3 top-3 z-[9999] flex w-full max-w-[360px] flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <NotificationToast key={item.id} item={item} onClose={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue["notify"] {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context.notify;
}
