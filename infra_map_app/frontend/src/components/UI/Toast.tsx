import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  onClose: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: 'bg-green-50 text-green-800 border-green-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
};

const iconStyles = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-blue-500',
};

export function Toast({ id, type, message, duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose(id), 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  const Icon = icons[type];

  return (
    <div
      className={clsx(
        'flex items-center gap-3 p-4 rounded-lg border shadow-lg transition-all duration-300',
        styles[type],
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
      )}
    >
      <Icon className={clsx('w-5 h-5 flex-shrink-0', iconStyles[type])} />
      <p className="flex-1 text-sm">{message}</p>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => onClose(id), 300);
        }}
        className="flex-shrink-0 p-1 rounded hover:bg-black/5"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Toast Container and Hook
interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

let toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];

function notifyListeners() {
  toastListeners.forEach((listener) => listener([...toasts]));
}

export const toast = {
  show: (type: ToastType, message: string, duration = 5000) => {
    const id = Math.random().toString(36).substring(2, 9);
    toasts = [...toasts, { id, type, message, duration }];
    notifyListeners();
    return id;
  },
  success: (message: string, duration?: number) =>
    toast.show('success', message, duration),
  error: (message: string, duration?: number) =>
    toast.show('error', message, duration),
  warning: (message: string, duration?: number) =>
    toast.show('warning', message, duration),
  info: (message: string, duration?: number) =>
    toast.show('info', message, duration),
  dismiss: (id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  },
};

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setItems(newToasts);
    toastListeners.push(listener);

    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <Toast
            id={item.id}
            type={item.type}
            message={item.message}
            duration={item.duration}
            onClose={toast.dismiss}
          />
        </div>
      ))}
    </div>
  );
}

export default Toast;
