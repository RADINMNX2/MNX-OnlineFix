import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Keyboard } from 'lucide-react';
import { Hotkey } from '../../shared/types';
import { ModalShell } from './ModalShell';

interface HotkeyRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentHotkey: Hotkey;
  onSave: (newHotkey: Hotkey) => void;
}

const formatHotkey = (hotkey: Hotkey | null): string => {
    if (!hotkey) return '...';
    const parts: string[] = [];
    if (hotkey.ctrl) parts.push('Ctrl');
    if (hotkey.alt) parts.push('Alt');
    if (hotkey.shift) parts.push('Shift');
    parts.push(hotkey.key);
    return parts.join(' + ');
};

const DEFAULT_HOTKEY: Hotkey = { key: 'Tab', vkCode: 0x09, ctrl: false, alt: false, shift: true };

const HotkeyRecorderModal: React.FC<HotkeyRecorderModalProps> = ({ isOpen, onClose, currentHotkey, onSave }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordedHotkey, setRecordedHotkey] = useState<Hotkey>(currentHotkey);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        event.preventDefault();

        if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;

        setRecordedHotkey({
            key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
            vkCode: 0,
            ctrl: event.ctrlKey,
            alt: event.altKey,
            shift: event.shiftKey,
        });
        setIsRecording(false);
    }, []);

    useEffect(() => {
        if (isRecording) {
            window.addEventListener('keydown', handleKeyDown);
        } else {
            window.removeEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRecording, handleKeyDown]);

    useEffect(() => {
        if (isOpen) {
            setRecordedHotkey(currentHotkey);
            setIsRecording(false);
        }
    }, [isOpen, currentHotkey]);

    const handleSave = () => {
        onSave(recordedHotkey);
        onClose();
    };

    const handleReset = () => {
        setRecordedHotkey(DEFAULT_HOTKEY);
    };

    return (
        <ModalShell isOpen={isOpen} onClose={onClose}>
            <div className="flex items-start mb-6">
                <div className="p-3 bg-neon-red/20 rounded-full mr-4">
                    <Keyboard className="w-6 h-6 text-neon-red" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Change Overlay Hotkey</h2>
                    <p className="text-sm text-gray-400">Press a key combination to toggle the in-game overlay.</p>
                </div>
            </div>

            <div
                onClick={() => setIsRecording(true)}
                className={`relative w-full text-center p-5 rounded-xl border-2 cursor-pointer transition-all overflow-hidden ${
                    isRecording ? 'border-neon-red bg-neon-red/10' : 'border-gray-600 bg-black/50 hover:border-neon-red/60'
                }`}
            >
                {isRecording && (
                    <>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-16 h-16 rounded-full bg-neon-red/20 pulse-ring" />
                        </div>
                        <div className="absolute top-3 right-4 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />
                            <span className="text-[10px] font-mono text-red-400 font-bold">REC</span>
                        </div>
                    </>
                )}
                <motion.span
                    key={recordedHotkey.key + recordedHotkey.ctrl + recordedHotkey.alt + recordedHotkey.shift}
                    initial={{ scale: 0.9, opacity: 0.4 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={`text-2xl font-mono ${isRecording ? 'text-neon-red glow-flicker' : 'text-white'}`}
                >
                    {isRecording ? 'LISTENING...' : formatHotkey(recordedHotkey)}
                </motion.span>
            </div>

            <div className="mt-8 flex justify-between items-center">
                <button onClick={handleReset} className="px-5 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-white font-semibold transition-colors text-sm">
                    Reset to Default
                </button>
                <div className="flex space-x-4">
                    <button onClick={onClose} className="px-6 py-2 rounded-lg text-white font-semibold transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-neon-red hover:bg-red-700 text-white font-semibold transition-colors shadow-lg shadow-neon-red/30">
                        Save
                    </button>
                </div>
            </div>
        </ModalShell>
    );
};

export default HotkeyRecorderModal;