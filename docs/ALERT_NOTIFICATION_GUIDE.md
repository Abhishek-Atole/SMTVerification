# Alert Notification System with Buzzer Sounds

This document explains the enhanced alert notification system with buzzer sounds and priority levels.

## Features

### 1. **Buzzer Sounds**
- **Four Priority Levels**: Critical, High, Medium, Low
- **Different Sound Patterns**: Each priority has a unique buzzer tone and pattern
- **Web Audio API**: Uses browser's native audio capabilities
- **Automatic Unlock**: Handles browser audio context suspension

### 2. **Priority Levels**

| Priority | Frequency | Pattern | Use Case |
|----------|-----------|---------|----------|
| **Critical** (🔴) | 1000 Hz | Rapid pulses (200-100ms) | System failures, critical errors |
| **High** (⛔) | 800 Hz | Medium pulses (300-150ms) | Scan errors, verification failures |
| **Medium** (⚠️) | 600 Hz | Slower pulses (400-200ms) | Duplicates, warnings |
| **Low** (📢) | 400 Hz | Single tone (500ms) | Info, success messages |

### 3. **Alert Types**

- **Error**: Validation failures, scan errors → High priority
- **Duplicate**: Already scanned components → Medium priority  
- **Warning**: Non-critical issues → Medium priority
- **Success**: Operations completed → Low priority

## Usage

### In Your Components

#### Using the Hook

```typescript
import { useNotification } from '@/hooks/use-notification';

export function MyComponent() {
  const {
    notification,
    showNotification,
    showAlert,
    showErrorAlert,
    showWarningAlert,
    showDuplicateAlert,
    showSuccessAlert,
    clearNotification,
  } = useNotification();

  const handleScanError = () => {
    // Show error with high priority
    showErrorAlert('Invalid component scanned');
    
    // Or with custom priority
    showAlert(
      'Custom error message',
      'error',
      'critical',
      'Critical Error',
      0 // Auto-dismiss time (0 = manual dismiss)
    );
  };

  return (
    <div>
      <button onClick={handleScanError}>
        Trigger Error
      </button>

      {/* Display the notification dialog */}
      <AlertNotificationDialog
        notification={notification}
        open={showNotification}
        onOpenChange={(open) => {
          if (!open) clearNotification();
        }}
        onDismiss={clearNotification}
      />
    </div>
  );
}
```

#### Convenience Methods

```typescript
// Show error with buzzer (high priority)
showErrorAlert('Component verification failed');

// Show warning with buzzer (medium priority)
showWarningAlert('Unusual scan pattern detected');

// Show duplicate alert (medium priority)
showDuplicateAlert('This component was already scanned');

// Show success (low priority, auto-dismisses in 2 seconds)
showSuccessAlert('Session completed successfully');

// Show custom alert with specific priority
showAlert(
  'Custom message here',
  'error',           // type: 'error' | 'duplicate' | 'warning' | 'success'
  'critical',        // priority: 'critical' | 'high' | 'medium' | 'low'
  'Alert Title',     // title (optional)
  5000               // auto-dismiss in 5 seconds (0 = manual dismiss)
);
```

### Buzzer Sounds in Session Active

The notification system is integrated into `session-active.tsx`:

```typescript
// Automatic buzzer based on error type
if (lastScanResult.status === "reject") {
  if (msgLower.includes("duplicate")) {
    showDuplicateAlert(lastScanResult.msg);  // Medium priority buzzer
  } else if (msgLower.includes("error")) {
    showErrorAlert(lastScanResult.msg);      // High priority buzzer
  } else if (msgLower.includes("warning")) {
    showWarningAlert(lastScanResult.msg);    // Medium priority buzzer
  }
}
```

## Components

### AlertNotificationDialog

**Location**: `src/components/alert-notification-dialog.tsx`

**Props**:
- `notification: AlertNotification | null` - The notification object
- `open: boolean` - Whether the dialog is visible
- `onOpenChange: (open: boolean) => void` - Callback when open state changes
- `onDismiss?: () => void` - Callback when notification is dismissed

**Features**:
- Priority-based border colors
- Visual priority indicator (colored bar)
- Icon selection based on alert type
- Timestamp display
- Keyboard accessibility
- Auto-unlock for browser audio context

```tsx
<AlertNotificationDialog
  notification={notification}
  open={showNotification}
  onOpenChange={(open) => {
    if (!open) clearNotification();
  }}
  onDismiss={clearNotification}
/>
```

## Buzzer Sound Details

### Critical Priority
- **Frequency**: 1000 Hz (high pitch)
- **Pattern**: 200ms on, 100ms off, repeated 3 times
- **Duration**: ~900ms total
- **Volume**: 100%
- **Use**: System errors, verification failures

### High Priority  
- **Frequency**: 800 Hz
- **Pattern**: 300ms on, 150ms off, repeated 2 times
- **Duration**: ~600ms total
- **Volume**: 90%
- **Use**: Scan errors, validation failures

### Medium Priority
- **Frequency**: 600 Hz
- **Pattern**: 400ms on, 200ms off
- **Duration**: ~600ms total
- **Volume**: 70%
- **Use**: Duplicates, warnings

### Low Priority
- **Frequency**: 400 Hz
- **Pattern**: Single 500ms tone
- **Duration**: ~500ms total
- **Volume**: 50%
- **Use**: Success, info messages

## Browser Compatibility

- **Supported**: Chrome, Firefox, Safari, Edge (2020+)
- **Fallback**: Gracefully handles browsers without Web Audio API
- **Audio Context**: Automatically resumes suspended audio context on user interaction

## Customization

### Custom Buzzer Sound

```typescript
import { playCustomBuzzer } from '@/utils/buzzer-sounds';

// Play custom buzzer
await playCustomBuzzer(
  frequency: 500,  // Hz
  duration: 1000,  // ms
  volume: 0.8      // 0-1
);
```

### Double Beep (Success Sound)

```typescript
import { playDoubleBuzzer } from '@/utils/buzzer-sounds';

await playDoubleBuzzer();  // Plays two ascending beeps
```

## Audio Context Management

```typescript
import { unlockAudio } from '@/utils/buzzer-sounds';

// Call on user interaction to unlock audio context
document.addEventListener('click', unlockAudio);
document.addEventListener('keydown', unlockAudio);
```

## TypeScript Types

```typescript
// Alert notification type
interface AlertNotification {
  id: string;
  type: AlertType;           // 'error' | 'duplicate' | 'warning' | 'success'
  priority: AlertPriority;   // 'critical' | 'high' | 'medium' | 'low'
  message: string;
  title?: string;
  timestamp: number;
  duration?: number;         // Auto-dismiss in ms
}

type AlertPriority = 'critical' | 'high' | 'medium' | 'low';
type AlertType = 'error' | 'duplicate' | 'warning' | 'success';
```

## Examples

### Error Handling

```typescript
try {
  await scanFeeder.mutateAsync({ ... });
} catch (error) {
  showErrorAlert(
    `Scan failed: ${error.message}`,
    'high'
  );
}
```

### Validation

```typescript
if (!isValidComponent(component)) {
  showDuplicateAlert('This component was already scanned in this session');
}
```

### Success Confirmation

```typescript
if (sessionComplete) {
  showSuccessAlert('Session completed! All components verified.');
}
```

### Custom Priority

```typescript
// Critical system alert that won't auto-dismiss
showAlert(
  'Critical system maintenance required!',
  'error',
  'critical',
  'System Alert',
  0  // Manual dismiss only
);
```

## Accessibility

- **Keyboard**: Tab through navigation keys, Escape/Enter to dismiss
- **Screen Readers**: Alert role and ARIA labels
- **Audio Cues**: Provides non-visual feedback for scanning
- **Color**: Supports high contrast modes with color-coded priorities

## Performance

- **Lazy Loading**: Audio context created on demand
- **Memory Efficient**: Uses reusable oscillators
- **Non-Blocking**: Async buzzer playback doesn't block UI
- **Cleanup**: Automatic oscillator cleanup after sound ends

## Troubleshooting

### Sound not playing?
1. Check browser audio permissions
2. Call `unlockAudio()` on user interaction first
3. Verify speaker/headphones are connected

### Notification not showing?
1. Ensure `AlertNotificationDialog` is rendered
2. Check that `showNotification` state is true
3. Verify `notification` object is not null

### Wrong priority buzzer playing?
1. Check alert type mapping in `PRIORITY_BY_TYPE`
2. Verify priority is passed correctly to `showAlert()`
3. Check browser console for errors
