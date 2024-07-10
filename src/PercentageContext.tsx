import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';

// Define the Asset interface
interface Asset {
  balance: number;
  // Add other properties as needed
}

interface PercentageContextProps {
  percentage: number;
  bigIntPercentage: bigint;
  setPercentage: (value: number) => void;
}

const PercentageContext = createContext<PercentageContextProps | undefined>(undefined);

export const PercentageProvider = ({ children }: { children: ReactNode }) => {
  const [percentage, setPercentage] = useState<number>(0);

  const updatePercentage = (value: number) => {
    setPercentage(value);
  };

  const bigIntPercentage = useMemo(() => BigInt(percentage), [percentage]);

  return (
    <PercentageContext.Provider value={{ percentage, bigIntPercentage, setPercentage: updatePercentage }}>
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

export const useBigIntPercentageValue = () => {
  const context = useContext(PercentageContext);
  if (!context) {
    throw new Error('useBigIntPercentageValue must be used within a PercentageProvider');
  }
  return context.bigIntPercentage;
};

// Usage example:
interface ComponentProps {
  asset: Asset;
}

const Component: React.FC<ComponentProps> = ({ asset }) => {
  const bigIntPercentage = useBigIntPercentageValue(); // Call the hook at the top level
  const percentage = bigIntPercentage;
  const swapAmount = BigInt(asset.balance) * percentage;

  return (
    <div>
      Swap Amount: {swapAmount.toString()}
    </div>
  );
};

export default Component;
