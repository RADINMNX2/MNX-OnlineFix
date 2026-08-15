import React, { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { X, Settings as SettingsIcon, User, Image as ImageIcon, Keyboard } from 'lucide-react';
import { AppSettings, Hotkey } from '../../shared/types';
import { Loader } from './Loader';
import { useToast } from '../context/ToastContext';

const HotkeyRecorderModal = React.lazy(() => import('./HotkeyRecorderModal'));

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAvatarChange: () => void;
}

const ToggleSwitch: React.FC<{ label: string; enabled: boolean; onChange: (enabled: boolean) => void }> = ({ label, enabled, onChange }) => {
  return (
    <div className="flex items-center justify-between">
      <label className="text-gray-300">{label}</label>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-neon-red ${
          enabled ? 'bg-neon-red' : 'bg-gray-700'
        }`}
      >
        <span
          className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } },
};

const formatHotkey = (hotkey: Hotkey): string => {
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push('Ctrl');
  if (hotkey.alt) parts.push('Alt');
  if (hotkey.shift) parts.push('Shift');
  parts.push(hotkey.key);
  return parts.join(' + ');
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, onAvatarChange }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isHotkeyModalOpen, setIsHotkeyModalOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      window.electron.getSettings().then(setSettings);
    }
  }, [isOpen]);

  const handleSettingChange = (key: keyof AppSettings, value: any) => {
    if (!settings) return;
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    window.electron.saveSettings(newSettings);
    if (key === 'playerName') toast.success('Identity Updated', `You are now "${value}"`, 2500);
    if (key === 'hotkey') toast.success('Hotkey Saved', `Overlay toggle: ${formatHotkey(value)}`, 2500);
  };
  
  if (!settings) return null;

  return (
    <>
      <Suspense fallback={<div />}>
        <HotkeyRecorderModal
          isOpen={isHotkeyModalOpen}
          onClose={() => setIsHotkeyModalOpen(false)}
          currentHotkey={settings.hotkey}
          onSave={(newHotkey) => {
            handleSettingChange('hotkey', newHotkey);
            setIsHotkeyModalOpen(false);
          }}
        />
      </Suspense>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={backdropVariants} initial="hidden" animate="visible" exit="hidden"
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={onClose}
          >
            <motion.div
              variants={panelVariants} initial="hidden" animate="visible" exit="exit"
              className="absolute right-0 top-0 h-full w-full max-w-md bg-gray-900/95 border-l border-neon-red/50 p-6 shadow-2xl shadow-neon-red/10 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-white flex items-center tracking-wider">
                  <SettingsIcon className="w-6 h-6 mr-3 text-neon-red" />
                  SETTINGS
                </h2>
                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-full"> <X /> </button>
              </div>

              <div className="space-y-8 flex-grow">
                {/* General Section */}
                <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">General</h3>
                    <ToggleSwitch
                    label="Minimize to Tray on Close"
                    enabled={settings.minimizeToTray}
                    onChange={(value) => handleSettingChange('minimizeToTray', value)}
                    />
                </div>

                 <hr className="border-gray-800" />

                 {/* Identity Section */}
                 <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Identity</h3>
                    <div className="flex items-center space-x-4 bg-gray-800/30 p-4 rounded-xl border border-gray-700/50">
                        <div onClick={onAvatarChange} className="relative w-14 h-14 rounded-full bg-gray-800 border-2 border-gray-600 cursor-pointer overflow-hidden hover:border-neon-red transition-all group shrink-0">
                             {settings.avatarDataUrl ? (
                                 <img src={settings.avatarDataUrl} alt="Avatar" className="w-full h-full object-cover" />
                             ) : (
                                 <User className="w-7 h-7 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400" />
                             )}
                             <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                 <ImageIcon className="w-5 h-5 text-white" />
                             </div>
                        </div>
                        <div className="flex flex-col flex-grow">
                             <label className="text-xs text-gray-400 mb-1">Agent Codename</label>
                             <input 
                                type="text" 
                                value={settings.playerName} 
                                onChange={(e) => handleSettingChange('playerName', e.target.value)}
                                className="bg-transparent border-b border-gray-600 focus:border-neon-red outline-none text-white font-mono text-lg transition-colors w-full"
                                placeholder="Enter Name..."
                             />
                        </div>
                    </div>
                 </div>

                 <hr className="border-gray-800" />

                 {/* Controls Section */}
                 <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Overlay Controls</h3>
                    <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
                        <div className="flex items-center">
                            <Keyboard className="w-5 h-5 mr-3 text-gray-400" />
                            <span className="text-gray-300 font-medium">Toggle Overlay</span>
                        </div>
                        <button 
                            onClick={() => setIsHotkeyModalOpen(true)}
                            className="px-3 py-1.5 bg-black/50 hover:bg-neon-red/10 hover:border-neon-red rounded-lg font-mono text-neon-red border border-gray-700 transition-all text-sm font-bold"
                        >
                            {formatHotkey(settings.hotkey)}
                        </button>
                    </div>
                 </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-800 text-center">
                <p className="text-sm text-gray-400 font-semibold tracking-wide">MNX ONLINE FIX v1.0.0</p>
                <p className="text-xs text-gray-600 mt-1">Dev: RADINMNX</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
export default SettingsPanel;