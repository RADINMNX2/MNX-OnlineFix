import React from 'react';
// FIX: Import `Transition` type from framer-motion to resolve type inference issues.
import { motion, Transition } from 'framer-motion';

interface LoaderProps {
  text?: string;
}

export const Loader: React.FC<LoaderProps> = ({ text = "Loading Interface..." }) => {
  const containerVariants = {
    start: { transition: { staggerChildren: 0.1 } },
    end: { transition: { staggerChildren: 0.1 } },
  };

  const dotVariants = {
    start: { y: "0%" },
    end: { y: "100%" },
  };

  // FIX: Explicitly type `dotTransition` as `Transition` to fix type inference issue with `ease` and `repeatType` properties.
  const dotTransition: Transition = {
    duration: 0.5,
    repeat: Infinity,
    repeatType: "reverse",
    ease: "easeInOut",
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-transparent">
      <motion.div
        variants={containerVariants}
        initial="start"
        animate="end"
        className="flex space-x-2"
      >
        <motion.span variants={dotVariants} transition={dotTransition} className="block w-4 h-4 bg-neon-red rounded-full" />
        <motion.span variants={dotVariants} transition={dotTransition} className="block w-4 h-4 bg-neon-red rounded-full" />
        <motion.span variants={dotVariants} transition={dotTransition} className="block w-4 h-4 bg-neon-red rounded-full" />
      </motion.div>
      <p className="mt-4 text-gray-400 text-sm">{text}</p>
    </div>
  );
};
