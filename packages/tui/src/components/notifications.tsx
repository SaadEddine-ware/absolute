import { Box, Text } from 'ink';
import { useEffect, useState, useCallback } from 'react';
import { theme } from '../styles/theme.js';

export interface Notification {
  id: string;
  text: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

interface NotificationToastProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const TOAST_LIFETIME_MS = 4000;
const MAX_VISIBLE = 3;

function kindColor(kind: Notification['kind']): string {
  switch (kind) {
    case 'success': return theme.statusOk;
    case 'warning': return theme.statusWarn;
    case 'error': return theme.statusErr;
    default: return theme.header;
  }
}

function kindIcon(kind: Notification['kind']): string {
  switch (kind) {
    case 'success': return '\u2713';
    case 'warning': return '\u26a0';
    case 'error': return '\u2717';
    default: return '\u2022';
  }
}

export function NotificationToast({ notifications, onDismiss }: NotificationToastProps): JSX.Element | null {
  const visible = notifications.slice(-MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <Box flexDirection="column" gap={0}>
      {visible.map((n) => (
        <ToastItem key={n.id} notification={n} onDismiss={onDismiss} />
      ))}
    </Box>
  );
}

function ToastItem({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), TOAST_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <Box
      flexDirection="row"
      borderStyle="single"
      borderColor={theme.border}
      paddingX={1}
      paddingTop={0}
      paddingBottom={0}
    >
      <Text color={kindColor(notification.kind)}>
        {kindIcon(notification.kind)}{' '}
      </Text>
      <Text color={theme.text}>
        {notification.text}
      </Text>
    </Box>
  );
}

export function useNotifications(): {
  notifications: Notification[];
  push: (text: string, kind?: Notification['kind']) => void;
  dismiss: (id: string) => void;
  clear: () => void;
} {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const push = useCallback((text: string, kind: Notification['kind'] = 'info') => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNotifications((prev) => [...prev, { id, text, kind, timestamp: Date.now() }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  return { notifications, push, dismiss, clear };
}
