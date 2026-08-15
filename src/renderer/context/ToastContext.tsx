import React, { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  title: string;
  description?: string;
  duration?: number;
}

interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
}

interface ToastContextValue {
  success: (title: string, description?: string, duration?: number) => void;
  error: (title: string, description?: string, duration?: number) => void;
  info: (title: string, description?: string, duration?: number) => void;
  warning: (title: string, description?: string, duration?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const MAX_TOASTS = 5;

const TYPE_CONFIG: Record<ToastType, { icon: React.ElementType; iconColor: string; iconBg: string; border: string; bar: string; }> = {
  success: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15 shadow-[0_0_18px_rgba(16,185,129,0.35)]',
    border: 'border-emerald-500/40',
    bar: 'bg-emerald-400',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/15 shadow-[0_0_18px_rgba(239,68,68,0.35)]',
    border: 'border-red-500/40',
    bar: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-400',
    iconBg: 'bg-yellow-500/15 shadow-[0_0_18px_rgba(234,179,8,0.35)]',
    border: 'border-yellow-500/40',
    bar: 'bg-yellow-400',
  },
  info: {
    icon: Info,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/15 shadow-[0_0_18px_rgba(56,189,248,0.35)]',
    border: 'border-sky-500/40',
    bar: 'bg-sky-400',
  },
};

const Toaster: React.FC<{ toasts: ToastItem[]; onDismiss: (id: number) => void }> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-96 max-w-[calc(100vw-3rem)] pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const cfg = TYPE_CONFIG[toast.type];
          const Icon = cfg.icon;
          return (
            <motion.div
              key={toast.id}
              layout
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.7 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 120) onDismiss(toast.id);
              }}
              initial={{ opacity: 0, y: 28, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 180, transition: { duration: 0.22 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`group pointer-events-auto relative overflow-hidden flex items-start gap-3 p-4 pr-9 rounded-xl bg-gray-900/90 backdrop-blur-xl border ${cfg.border} shadow-2xl shadow-black/60 cursor-grab active:cursor-grabbing`}
            >
              <button
                onClick={() => onDismiss(toast.id)}
                className="absolute top-2.5 right-2.5 p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${cfg.iconBg}`}>
                <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
              </div>

              <div className="flex-grow min-w-0 pt-0.5">
                <p className="text-sm font-bold text-white leading-snug">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{toast.description}</p>
                )}
              </div>

              <div
                className={`absolute bottom-0 left-0 h-[3px] rounded-full ${cfg.bar} toast-progress group-hover:[animation-play-state:paused]`}
                style={{ animationDuration: `${toast.duration}ms` }}
                onAnimationEnd={() => onDismiss(toast.id)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type: ToastType, input: ToastInput) => {
    const id = ++idRef.current;
    const duration = Math.max(input.duration ?? 4000, 1200);
    setToasts((prev) => {
      const next = [...prev, { id, type, title: input.title, description: input.description, duration }];
      return next.slice(-MAX_TOASTS);
    });
  }, []);

  const value: ToastContextValue = {
    success: useCallback((title, description, duration) => push('success', { title, description, duration }), [push]),
    error: useCallback((title, description, duration) => push('error', { title, description, duration }), [push]),
    info: useCallback((title, description, duration) => push('info', { title, description, duration }), [push]),
    warning: useCallback((title, description, duration) => push('warning', { title, description, duration }), [push]),
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};