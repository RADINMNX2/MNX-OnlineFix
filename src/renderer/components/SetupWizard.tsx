import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, CheckCircle, AlertTriangle, Cpu, Download } from 'lucide-react';
import { SetupState } from '../App';
import { useToast } from '../context/ToastContext';

interface SetupWizardProps {
  setSetupState: (state: SetupState) => void;
  initialState: SetupState;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ setSetupState, initialState }) => {
    const [status, setStatus] = useState<SetupState>(initialState);
    const [logs, setLogs] = useState<string[]>(['Welcome to MNX ONLINE FIX Setup Wizard.']);
    const [error, setError] = useState<string | null>(null);
    const consoleEndRef = useRef<null | HTMLDivElement>(null);
    const toast = useToast();

    useEffect(() => {
        const unsubscribe = window.electron.onSetupProgress((log) => {
            setLogs(prev => [...prev, log]);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleStartSetup = async () => {
        setStatus('progress');
        setLogs(prev => [...prev, 'Starting setup process...']);
        setError(null);
        toast.info('Compilation Started', 'Building the native proxy. This may take a few minutes.');
        try {
            const success = await window.electron.startSetup();
            if (success) {
                setLogs(prev => [...prev, 'Setup completed successfully! Restarting interface...']);
                toast.success('Setup Complete', 'Native proxy compiled successfully.');
                setTimeout(() => setStatus('complete'), 1500);
            } else {
                throw new Error("The setup process failed. Check the logs for details.");
            }
        } catch (err: any) {
            const errorMessage = err.message || 'An unknown error occurred.';
            setError(errorMessage);
            setLogs(prev => [...prev, `ERROR: ${errorMessage}`]);
            setStatus('error');
            toast.error('Compilation Failed', errorMessage, 6000);
        }
    };
    
    return (
        <div className="md:col-span-3 h-full p-6 bg-black/50 backdrop-blur-md border border-neon-red/30 rounded-lg flex flex-col items-center justify-center text-center">
            <AnimatePresence mode="wait">
                {status === 'required' && (
                    <motion.div key="required" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Cpu className="w-16 h-16 text-neon-red mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">One-Time Setup Required</h2>
                        <p className="text-gray-400 mb-6 max-w-md mx-auto">
                            To enable smart DLL injection, the app needs to compile a native network proxy. This is an automated, one-time process.
                        </p>
                        <motion.button
                            onClick={handleStartSetup}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-8 py-3 bg-neon-red hover:bg-red-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-neon-red/30">
                            Start Setup
                        </motion.button>
                    </motion.div>
                )}

                {(status === 'progress' || status === 'error') && (
                    <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col">
                        <h2 className="text-2xl font-bold mb-4 flex items-center justify-center">
                            <Terminal className="w-6 h-6 mr-2" />
                            {status === 'error' ? 'Setup Failed' : 'Setup in Progress...'}
                        </h2>
                        <div className="flex-grow bg-black/70 rounded-lg p-4 text-left font-mono text-sm overflow-y-auto border border-gray-700 mb-4">
                            {logs.map((log, i) => (
                                <p key={i} className={`whitespace-pre-wrap ${log.includes('ERROR') || log.includes('error') ? 'text-red-400' : 'text-green-400'}`}>
                                    {`> ${log}`}
                                </p>
                            ))}
                            <div ref={consoleEndRef} />
                        </div>
                        {status === 'error' && (
                            <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg flex flex-col items-start text-left">
                                <div className="flex items-center mb-2">
                                    <AlertTriangle className="w-6 h-6 mr-3 text-red-400" />
                                    <p className="text-red-300 font-bold">Compilation Failed</p>
                                </div>
                                <p className="text-red-200 text-sm mb-3">{error}</p>
                                <div className="bg-black/40 p-3 rounded w-full text-xs text-gray-300">
                                    <p className="mb-1"><strong>Possible Solution:</strong> You are missing C++ Build Tools.</p>
                                    <p>1. Install <strong>Visual Studio 2022 Community</strong>.</p>
                                    <p>2. Select <strong>"Desktop development with C++"</strong> during installation.</p>
                                    <p>3. Restart this app and try again.</p>
                                </div>
                                <motion.button
                                    onClick={handleStartSetup}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="mt-3 w-full py-2 bg-red-700 hover:bg-red-600 text-white font-semibold rounded transition-colors"
                                >
                                    Retry Setup
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                )}
                
                {status === 'complete' && (
                     <motion.div key="complete" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Setup Complete!</h2>
                        <p className="text-gray-400 mb-6">
                            The native proxy has been compiled. You can now use the application.
                        </p>
                        <motion.button
                            onClick={() => setSetupState('complete')}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors">
                            Continue to App
                        </motion.button>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
};
// FIX: Add default export to be used with React.lazy
export default SetupWizard;