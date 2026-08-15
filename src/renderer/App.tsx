import React, { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NetworkStateChange } from '../shared/types';
import { TitleBar } from './components/TitleBar';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import { Loader } from './components/Loader';
import { NetworkRadar } from './components/NetworkRadar';
import { Crown, RefreshCcw } from 'lucide-react';

const SetupWizard = React.lazy(() => import('./components/SetupWizard'));
const Lobby = React.lazy(() => import('./components/Lobby'));

export type SetupState = 'checking' | 'required' | 'progress' | 'complete' | 'error';

const MigrationOverlay: React.FC<{ status: NetworkStateChange }> = ({ status }) => {
  const isMigrating = status === 'migrating';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[85] bg-black/80 backdrop-blur-lg flex items-center justify-center"
    >
      <div className="flex flex-col items-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-neon-red/20 blur-2xl" />
          <div className="w-28 h-28 rounded-full border-2 border-neon-red/30 relative flex items-center justify-center">
            <div className="radar-sweep absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255,0,0,0.45) 50deg, transparent 100deg)' }} />
            <div className="absolute inset-3 rounded-full border border-neon-red/20" />
            <div className="absolute inset-6 rounded-full border border-neon-red/20" />
            {isMigrating
              ? <Crown className="w-8 h-8 text-yellow-400" />
              : <RefreshCcw className="w-8 h-8 text-neon-red animate-spin" />}
          </div>
        </div>
        <h2 className="text-xl font-bold text-white tracking-widest mb-2">
          {isMigrating ? 'HOST MIGRATION IN PROGRESS' : 'RESTORING NETWORK LINK'}
        </h2>
        <p className="text-sm text-gray-400 font-mono">
          {isMigrating ? 'Electing new host...' : 'Recovering connection...'}
        </p>
        <div className="mt-6 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 rounded-full bg-neon-red"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [setupState, setSetupState] = useState<SetupState>('checking');
  const [networkStatus, setNetworkStatus] = useState<NetworkStateChange>('stable');

  useEffect(() => {
    const checkStatus = async () => {
      const isCompiled = await window.electron.checkSetupStatus();
      setTimeout(() => setSetupState(isCompiled ? 'complete' : 'required'), 1000);
    };
    checkStatus();
    const unsubNetwork = window.electron.onNetworkStateChange(setNetworkStatus);
    return () => unsubNetwork();
  }, []);

  const renderContent = () => {
    switch (setupState) {
      case 'checking': return <Loader text="Checking setup..." />;
      case 'required':
      case 'progress':
      case 'error': return <SetupWizard setSetupState={setSetupState} initialState={setupState} />;
      case 'complete': return <Lobby />;
    }
  };

  return (
    <AppProvider>
      <ToastProvider>
        <div className="min-h-screen w-full flex flex-col bg-black font-sans relative overflow-hidden hex-background border border-gray-900 rounded-lg">
          <TitleBar />
          <main className="flex-grow relative p-4 min-h-0">
            <Suspense fallback={<Loader />}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={setupState} className="h-full"
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
                >
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </Suspense>
            <AnimatePresence>
              {networkStatus !== 'stable' && <MigrationOverlay status={networkStatus} />}
            </AnimatePresence>
          </main>
        </div>
      </ToastProvider>
    </AppProvider>
  );
}