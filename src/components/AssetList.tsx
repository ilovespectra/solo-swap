import React, { useState, ChangeEvent } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  sweepTokens,
  findQuotes,
  TokenInfo,
  TokenBalance,
  loadJupyterApi,
  BONK_TOKEN_MINT,
} from "../scooper";
import { DefaultApi, SwapInstructionsResponse, QuoteResponse } from "@jup-ag/api";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { track } from "@vercel/analytics";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoneyBillWave, faChartPie } from "@fortawesome/free-solid-svg-icons";
import { ApplicationStates } from "./util/applicationStates";
import { AssetState } from "./util/assetState";
import {
  updateAssetList,
  reload,
  calculateTotalScoop,
  handlePercentageChange,
  handleTotalScoopChange,
} from "./util/utils";

const forbiddenTokens = ["USDC"];

const AssetList: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [assetList, setAssetList] = React.useState<{ [id: string]: AssetState }>({});
  const [walletAddress, setWalletAddress] = React.useState("");
  const [tokens, setTokens] = React.useState<{ [id: string]: TokenInfo }>({});
  const [state, setState] = React.useState<ApplicationStates>(
    ApplicationStates.LOADING
  );
  const [percentage, setPercentage] = useState<number>(0);
  const [valueToSwap, setValueToSwap] = useState<number>(0);
  const [totalScoop, setTotalScoop] = useState<number>(0);
  const [selectAll, setSelectAll] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [search, setSearch] = useState("");
  const [showZeroBalance, setShowZeroBalance] = useState(false);
  const [showStrict, setShowStrict] = useState(false);
  const [sortOption, setSortOption] = useState("scoopValue");
  const [ascending, setAscending] = useState(false);

  // Handlers
  const handlePercentageChangeCallback = handlePercentageChange(setPercentage, setValueToSwap, totalScoop);
  const handleTotalScoopChangeCallback = handleTotalScoopChange(setTotalScoop, setValueToSwap, percentage);

  const handleSwapButtonClick = () => {
    setOpenModal(true);
  };

  const isButtonDisabled = !Object.values(assetList).some(
    (entry) => entry.checked
  );

  const selectedItems = Object.values(assetList).filter(
    (entry) => entry.checked
  );

  const handleSelectAll = () => {
    setSelectAll(!selectAll);

    const updatedAssetListObject = Object.fromEntries(
      Object.entries(assetList).map(([key, asset]) => [
        key,
        {
          ...asset,
          checked: !selectAll && filteredData.some((entry) => entry[0] === key),
        },
      ])
    );
    setAssetList(updatedAssetListObject);
  };

  // Application startup
  if (wallet.connected && wallet.publicKey && connection) {
    if (walletAddress != wallet.publicKey.toString()) {
      setWalletAddress(wallet.publicKey.toString());
    }
  }

  const [jupiterQuoteApi, setQuoteApi] = React.useState<DefaultApi | null>(null);
  React.useEffect(() => {
    loadJupyterApi().then(([quoteApi, tokenMap]) => {
      setTokens(tokenMap);
      setQuoteApi(quoteApi);
    });
  }, []);

  React.useEffect(() => {
    if (
      walletAddress &&
      jupiterQuoteApi &&
      tokens &&
      state == ApplicationStates.LOADING
    ) {
      setState(ApplicationStates.LOADED_JUPYTER);
      setAssetList({});
      findQuotes(
        connection,
        tokens,
        BONK_TOKEN_MINT,
        walletAddress,
        jupiterQuoteApi,
        (id, asset) => {
          updateAssetList(setAssetList, (s) => ({ ...s, [id]: new AssetState(asset) }));
        },
        (id, quote) => {
          updateAssetList(setAssetList, (aL) => {
            aL[id].quote = quote;
            return aL;
          });
        },
        (id, swap) => {
          updateAssetList(setAssetList, (aL) => {
            aL[id].swap = swap;
            return aL;
          });
        },
        (id, error) => {}
      ).then(() => {
        setState(ApplicationStates.LOADED_QUOTES);
      });
    }
  }, [walletAddress, jupiterQuoteApi, tokens, state]);

  const scoop = () => {
    if (state == ApplicationStates.LOADED_QUOTES) {
      setState(ApplicationStates.SCOOPING);
      sweepTokens(
        wallet,
        connection,
        Object.values(assetList),
        (id: string, state: string) => {
          updateAssetList(setAssetList, (aL) => {
            assetList[id].transactionState = state;
            return aL;
          });
        },
        (id, txid) => {},
        (id, error) => {}
      )
        .then(() => {
          setState(ApplicationStates.SCOOPED);
          track("Scooped");
        })
        .catch((err) => {
          const notify = () => toast.error("User rejected transaction!");
          notify();
          console.log("Error signing for scoop!" + err);
          setState(ApplicationStates.LOADED_QUOTES);
        });
    }
  };

  const filteredData = Object.entries(assetList).filter((entry) => {
    const nameSearch = entry[1].asset.token.symbol
      .toLowerCase()
      .includes(search.toLowerCase());
    const filterZeroBalance =
      !showZeroBalance ||
      Number(
        (
          Number(entry[1].asset?.balance) /
          10 ** entry[1].asset.token.decimals
        ).toLocaleString()
      ) === 0;
    const filterStrict = !showStrict || entry[1].asset.token.strict === true;

    return nameSearch && filterZeroBalance && filterStrict;
  });

  const sortedAssets = [...filteredData].sort((a, b) => {
    let comparison = 0;

    switch (sortOption) {
      case "symbol":
        comparison = a[1].asset.token.symbol.localeCompare(
          b[1].asset.token.symbol
        );
        break;
      case "balance":
        comparison =
          Number(a[1].asset.balance) / 10 ** a[1].asset.token.decimals -
          Number(b[1].asset.balance) / 10 ** b[1].asset.token.decimals;
        break;
      case "scoopValue":
        comparison =
          ((Number(a[1].quote?.outAmount) ?? 0) || 0) -
          ((Number(b[1].quote?.outAmount) ?? 0) || 0);
        break;
      default:
        break;
    }

    return ascending === true ? comparison : -comparison;
  });

  return (
    <>
      {/* Your component JSX here */}
    </>
  );
};

export default AssetList;
