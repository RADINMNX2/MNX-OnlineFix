import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { AppState } from '../../shared/types';

interface AppContextType {
  isVisible: boolean;
}

export const AppContext = createContext<AppContextType>({ isVisible: true });

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const unsubscribe = window.electron.onAppStateChange((state: AppState) => {
      setIsVisible(state.isVisible);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AppContext.Provider value={{ isVisible }}>
      {children}
    </AppContext.Provider>
  );
};
