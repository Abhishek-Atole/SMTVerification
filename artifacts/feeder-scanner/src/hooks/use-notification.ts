import { useState, useCallback } from 'react';
import { playBuzzer, playBuzzerForType, playDoubleBuzzer, AlertPriority, AlertType } from '@/utils/buzzer-sounds';

export interface AlertNotification {
  id: string;
  type: AlertType;
  priority: AlertPriority;
  message: string;
  title?: string;
  timestamp: number;
  duration?: number; // Auto-dismiss time in ms (0 = manual dismiss)
}

interface UseNotificationReturn {
  notification: AlertNotification | null;
  showNotification: boolean;
  showAlert: (
    message: string,
    type: AlertType,
    priority?: AlertPriority,
    title?: string,
    duration?: number
  ) => void;
  showErrorAlert: (message: string, priority?: AlertPriority) => void;
  showWarningAlert: (message: string, priority?: AlertPriority) => void;
  showDuplicateAlert: (message: string) => void;
  showSuccessAlert: (message: string) => void;
  clearNotification: () => void;
}

/**
 * Hook for managing alert notifications with buzzer sounds and priorities
 */
export function useNotification(): UseNotificationReturn {
  const [notification, setNotification] = useState<AlertNotification | null>(null);
  const [showNotification, setShowNotification] = useState(false);

  const showAlert = useCallback(
    (
      message: string,
      type: AlertType = 'warning',
      priority: AlertPriority = 'medium',
      title?: string,
      duration: number = 0
    ) => {
      // Create notification
      const newNotification: AlertNotification = {
        id: `${Date.now()}-${Math.random()}`,
        type,
        priority,
        message,
        title,
        timestamp: Date.now(),
        duration,
      };

      setNotification(newNotification);
      setShowNotification(true);

      // Play buzzer sound
      playBuzzer(priority);

      // Auto-dismiss if duration specified
      if (duration > 0) {
        const timer = setTimeout(() => {
          setShowNotification(false);
        }, duration);

        return () => clearTimeout(timer);
      }
    },
    []
  );

  const showErrorAlert = useCallback(
    (message: string, priority: AlertPriority = 'high') => {
      showAlert(message, 'error', priority, '❌ ERROR');
    },
    [showAlert]
  );

  const showWarningAlert = useCallback(
    (message: string, priority: AlertPriority = 'medium') => {
      showAlert(message, 'warning', priority, '⚡ WARNING');
    },
    [showAlert]
  );

  const showDuplicateAlert = useCallback(
    (message: string) => {
      showAlert(message, 'duplicate', 'medium', '⚠️ DUPLICATE');
    },
    [showAlert]
  );

  const showSuccessAlert = useCallback(
    (message: string) => {
      playDoubleBuzzer();
      showAlert(message, 'success', 'low', '✓ SUCCESS', 2000);
    },
    [showAlert]
  );

  const clearNotification = useCallback(() => {
    setShowNotification(false);
  }, []);

  return {
    notification,
    showNotification,
    showAlert,
    showErrorAlert,
    showWarningAlert,
    showDuplicateAlert,
    showSuccessAlert,
    clearNotification,
  };
}
