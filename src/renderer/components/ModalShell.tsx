import React, { ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export type ModalTone = 'default' | 'warning' | 'danger' | 'success';

const TONE_BORDER: Record<ModalTone, string> = {
  default: 'border-neon-red/40',
  warning: 'border-yellow-500/50',
  danger: 'border-red-500/50',
  success: 'border-emerald-500/40',
};

const TONE_SHADOW: Record<ModalTone, string> = {
  default: 'shadow-neon-red/15',
  warning: 'shadow-yellow-500/10',
  danger: 'shadow-red-500/10',
  success: 'shadow-emerald-500/10',
};

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  tone?: ModalTone;
  maxWidth?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
}

const MAX_WIDTH: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export const ModalShell: React.FC<ModalShellProps> = ({ isOpen, onClose, children, tone = 'default', maxWidth = 'md', hideClose = false }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full ${MAX_WIDTH[maxWidth]} bg-gray-900/85 backdrop-blur-xl border ${TONE_BORDER[tone]} rounded-2xl p-8 shadow-2xl ${TONE_SHADOW[tone]} ${hideClose ? '' : 'pt-10'}`}
          >
            {!hideClose && (
              <button
                onClick={onClose}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ModalTone;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  tone = 'danger', onConfirm, onCancel,
}) => {
  const btnTone = tone === 'danger' ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20' : 'bg-neon-red hover:bg-red-700 shadow-neon-red/30';

  return (
    <ModalShell isOpen={isOpen} onClose={onCancel} tone={tone}>
      <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-gray-400 leading-relaxed mb-8">{description}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-lg bg-gray-700/70 hover:bg-gray-700 text-white font-semibold transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`px-5 py-2 rounded-lg text-white font-semibold transition-all shadow-lg ${btnTone}`}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
};