import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  accent?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon, title, description, action, accent = 'text-neon-red',
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="relative mb-5">
        <div className={`absolute inset-0 rounded-full ${accent.replace('text-', 'bg-')}/15 blur-xl`} />
        <motion.div
          animate={{ y: [0, -9, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <div className={`absolute inset-0 rounded-full border ${accent.replace('text-', 'border-')}/30 scale-150 pulse-ring`} />
          <div className={`w-16 h-16 rounded-2xl border ${accent.replace('text-', 'border-')}/30 bg-black/60 backdrop-blur flex items-center justify-center shadow-lg shadow-black/50`}>
            <Icon className={`w-8 h-8 ${accent}`} />
          </div>
        </motion.div>
      </div>
      <p className="font-bold text-white text-base mb-1.5">{title}</p>
      {description && <p className="text-xs text-gray-500 max-w-[220px] leading-relaxed mb-5">{description}</p>}
      {action}
    </div>
  );
};