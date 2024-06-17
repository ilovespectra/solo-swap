import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PercentageContextProps {
  percentage: number;
  setPercentage: (value: number) => void;
}

const PercentageContext = createContext<PercentageContextProps | undefined>(undefined);

export const PercentageProvider = ({ children }: { children: ReactNode }) => {
  const [percentage, setPercentage] = useState<number>(0);

  return (
    <PercentageContext.Provider value={{ percentage, setPercentage }}>
      {children}
    </PercentageContext.Provider>
  );
};

export const usePercentage = () => {
  const context = useContext(PercentageContext);
  if (!context) {
    throw new Error('usePercentage must be used within a PercentageProvider');
  }
  return context;
};

export const usePercentageValue = () => {
  const context = useContext(PercentageContext);
  if (!context) {
    throw new Error('usePercentageValue must be used within a PercentageProvider');
  }
  return context.percentage;
};
