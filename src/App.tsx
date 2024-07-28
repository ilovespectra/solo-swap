// import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  useConnection,
  useWallet,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  UnsafeBurnerWalletAdapter,
  PhantomWalletAdapter,
  LedgerWalletAdapter,
  SolflareWalletAdapter,
  SolongWalletAdapter,
  TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import React, { FC, ReactNode, useMemo } from "react";
import { render } from "react-dom";
import { BrowserRouter as Router, Route, Routes, useNavigate } from "react-router-dom";
import AssetList from "./components/AssetList";
import Info from "./components/Info";
import Header from "./components/Header";
import { PercentageProvider } from "./PercentageContext";

require("./App.css");
require("@solana/wallet-adapter-react-ui/styles.css");

const App: FC = () => {
  return (
    <PercentageProvider>
      <Router>
        <Context>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/assets" element={<AssetListPage />} />
          </Routes>
        </Context>
      </Router>
    </PercentageProvider>
  );
};
export default App;

const Context: FC<{ children: ReactNode }> = ({ children }) => {
  const network =
    "https://attentive-frequent-darkness.solana-mainnet.quiknode.pro/5df866d1030f5bb9b9b95e95f1d5e3c41416ffcf/";

  const endpoint = useMemo(() => network, [network]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new LedgerWalletAdapter(),
      new SolflareWalletAdapter(),
      new SolongWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

const Home: FC = () => {
  const navigate = useNavigate();

  const handleEnterSolo = () => {
    navigate("/assets");
  };

  return (
    <>
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: `url('https://github.com/ilovespectra/solo-explorer/blob/main/src/lib/assets/helius/bg.png?raw=true')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="p-4 sm:p-8 md:p-16 lg:p-24 min-h-screen relative">
        <Header />
        <Info />
        <div className="text-center mt-10">
          <button
            onClick={handleEnterSolo}
            className="enter-solo-button bg-black border border-white text-white py-2 px-4 rounded-xl"
          >
            enter solo
          </button>
        </div>
      </div>
    </>
  );
};

const AssetListPage: FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();

  return (
    <>
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: `url('https://github.com/ilovespectra/solo-explorer/blob/main/src/lib/assets/helius/bg.png?raw=true')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="p-4 sm:p-8 md:p-16 lg:p-24 min-h-screen relative">
        <Header />
        {!wallet || !connection || !wallet.publicKey ? (
          <>
            <Info />
            <div className="lowercase text-white text-center pt-4 font-bold text-2xl italic h-[30vh] flex items-center justify-center relative z-40">
              connect your wallet to create a pro rata swap
            </div>
          </>
        ) : (
          <AssetList />
        )}
        <img
          src={`/images/bonk_logo_transparent.png`}
          width={500}
          className="absolute bottom-0 left-0"
          alt="solo logo"
        />
      </div>
    </>
  );
};
