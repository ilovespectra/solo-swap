import React, { useState, ChangeEvent, useEffect } from "react";
import { useConnection, useWallet, WalletContext } from "@solana/wallet-adapter-react";
import {
  sweepTokens,
  findQuotes,
  TokenInfo,
  TokenBalance,
  loadJupyterApi,
  USDC_TOKEN_MINT,
  getAssetBurnReturn,
  sendTokens,
  forbiddenTokens,
} from "../scooper";
import { DefaultApi, SwapInstructionsResponse, QuoteResponse } from "@jup-ag/api";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { track } from "@vercel/analytics";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoneyBillWave, faChartPie } from "@fortawesome/free-solid-svg-icons";
import { usePercentage, usePercentageValue, useBigIntPercentageValue } from "../PercentageContext";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { ApplicationStates } from "./util/applicationStates";

class AssetState {
  asset: TokenBalance;
  quote?: QuoteResponse;
  swap?: SwapInstructionsResponse;
  checked?: boolean;
  usdPrice?: number;
  transactionState?: string;
  transactionId?: string;

  constructor(
    assetArg: any,
    quoteArg?: QuoteResponse,
    swapArg?: SwapInstructionsResponse,
    checkedArg?: boolean,
    transactionStateArg?: string,
    transactionIdArg?: string
  ) {
    this.asset = assetArg;
    this.quote = quoteArg;
    this.swap = swapArg;
    this.checked = checkedArg;
    this.transactionState = transactionStateArg;
    this.transactionId = transactionIdArg;
  }
}

function trimAddress(address: string) {
  if (address.length <= 7) {
    return address; // If address is shorter than or equal to 7 characters, return it as is
  }
  const firstPart = address.slice(0, 4);
  const lastPart = address.slice(-3);
  return `${firstPart}...${lastPart}`;
}

const AssetList: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [assetList, setAssetList] = React.useState<{
    [id: string]: AssetState;
  }>({});
  const [walletAddress, setWalletAddress] = React.useState("");
  const [tokens, setTokens] = React.useState<{ [id: string]: TokenInfo }>({});
  const [verifiedtokens, setVerifiedTokens] = React.useState<{ [id: string]: TokenInfo }>({});
  const [state, setState] = React.useState<ApplicationStates>(ApplicationStates.LOADING);
  const [selectAll, setSelectAll] = useState(false);
  const [openModal, setOpenModal] = useState("");
  const [search, setSearch] = useState("");
  const [percentage, setPercentage] = useState(0);
  const [swapValue, setSwapValue] = useState(0);
  const [sendToWallet, setSendToWallet] = useState("");
  const [swapToToken, setSwapToToken] = useState<TokenInfo>();
  const [slippage, setSlippage] = useState("0.3");
  const [priorityFee, setPriorityFee] = useState("low");

  // Filters
  const [showZeroBalance, setShowZeroBalance] = useState(false);
  const [showStrict, setShowStrict] = useState(false);

  // Sort
  const [sortOption, setSortOption] = useState("value");
  const [ascending, setAscending] = useState(false);

  const isButtonDisabled = !Object.values(assetList).some((entry) => entry.checked);

  const selectedItems = Object.values(assetList).filter((entry) => entry.checked);

  const handleSelectAll = () => {
    setSelectAll(!selectAll);

    const updatedAssetListObject = Object.fromEntries(
      Object.entries(assetList).map(([key, asset]) => [
        key,
        {
          ...asset,
          checked:
            !selectAll && filteredData.some((entry) => entry[0] === key) && !cannotScoop(asset), // updated: only selects "all" from currently filtered data
        },
      ])
    );

    setAssetList(updatedAssetListObject);
    if (!selectAll) {
      setSwapValue((totalPossibleScoop / 100) * percentage);
    } else {
      setSwapValue(0);
    }
  };

  function updateAssetList(
    updater: (arg: { [id: string]: AssetState }) => { [id: string]: AssetState }
  ) {
    setAssetList((aL) => {
      let newState = updater({ ...aL });
      return newState;
    });
  }

  function reload() {
    setAssetList((al) => {
      const newList: { [id: string]: AssetState } = {};
      Object.entries(newList).forEach(([key, asset]) => {
        newList[key] = new AssetState(asset.asset);
      });
      return newList;
    });
    setState(ApplicationStates.LOADING);
  }

  /* Application startup */
  /* 1.a: Load the wallet address */
  if (wallet.connected && wallet.publicKey && connection) {
    if (walletAddress != wallet.publicKey.toString()) {
      setWalletAddress(wallet.publicKey.toString());
    }
  }

  /* 1.b: Load the Jupiter Quote API */
  const [jupiterQuoteApi, setQuoteApi] = React.useState<DefaultApi | null>();
  React.useEffect(() => {
    const savedSlippage = localStorage.getItem("slippage");
    if (savedSlippage !== null) {
      setSlippage(savedSlippage);
    }
    const savedPriorityFee = localStorage.getItem("priorityFee");
    if (savedPriorityFee !== null) {
      setPriorityFee(savedPriorityFee);
    }
    loadJupyterApi().then(([quoteApi, tokenMap, verifiedTokenMap]) => {
      setSwapToToken(tokenMap[USDC_TOKEN_MINT]);
      setVerifiedTokens(verifiedTokenMap);
      setTokens(tokenMap);
      setQuoteApi(quoteApi);
    });
  }, []);

  /* 2: Load information about users tokens, add any tokens to list */
  React.useEffect(() => {
    // Run only once
    if (walletAddress && jupiterQuoteApi && tokens && state == ApplicationStates.LOADING) {
      setState(ApplicationStates.LOADED_JUPYTER);
      setAssetList({});
      console.log("loading assets for wallet: " + walletAddress);
      findQuotes(
        connection,
        tokens,
        USDC_TOKEN_MINT,
        walletAddress,
        jupiterQuoteApi,
        percentage,
        (id, asset) => {
          updateAssetList((s) => ({ ...s, [id]: new AssetState(asset) }));
        },
        (id, quote) => {
          updateAssetList((aL) => {
            aL[id].quote = quote;
            return aL;
          });
        },
        (id, swap) => {
          updateAssetList((aL) => {
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
  /* End application startup */

  /* Scoop button callback, clean all the tokens! */
  const scoop = () => {
    // Run only once
    if (swapToToken && jupiterQuoteApi && state == ApplicationStates.LOADED_QUOTES) {
      setState(ApplicationStates.SCOOPING);
      sweepTokens(
        wallet,
        connection,
        Object.values(assetList),
        jupiterQuoteApi,
        swapToToken.address,
        percentage,
        slippage,
        priorityFee,
        (id: string, state: string) => {
          updateAssetList((aL) => {
            aL[id].transactionState = state;
            return aL;
          });
        },
        (id, txid) => {},
        (id, error) => {}
      )
        .then(() => {
          setState(ApplicationStates.SCOOPED);
          track("swapped");
        })
        .catch((err) => {
          const notify = () => toast.error("user rejected transaction!");
          notify();
          console.log("error signing for swap!" + err);
          setState(ApplicationStates.LOADED_QUOTES);
        });
    }
  };

  /* Send button callback */
  const send = () => {
    // Run only once
    if (state == ApplicationStates.LOADED_QUOTES) {
      setState(ApplicationStates.SENDING);
      sendTokens(
        wallet,
        sendToWallet,
        connection,
        Object.values(assetList),
        percentage,
        (id: string, state: string) => {
          updateAssetList((aL) => {
            aL[id].transactionState = state;
            return aL;
          });
        },
        (id, txid) => {},
        (id, error) => {}
      )
        .then(() => {
          setState(ApplicationStates.SENT);
          track("Sent");
        })
        .catch((err) => {
          const notify = () => toast.error("user rejected transaction!");
          notify();
          console.log("error signing for sending!" + err);
          setState(ApplicationStates.LOADED_QUOTES);
        });
    }
  };

  /* Maintain counters of the total possible yield and yield from selected swaps */
  var totalPossibleScoop = 0;
  var maxPossibleScoop = 0;
  // var totalScoop = 0;

  Object.entries(assetList).forEach(([key, asset]) => {
    if (asset.quote) {
      if (asset.checked) {
        maxPossibleScoop += Number(asset.quote.outAmount);
      }
      totalPossibleScoop += Number(asset.quote.outAmount);
    }
  });
  if (!jupiterQuoteApi || !walletAddress) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        className="animate-spin h-16 w-16 mx-auto mt-16"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    );
  }

  const filteredData = Object.entries(assetList).filter((entry) => {
    const nameSearch = entry[1].asset.token.symbol.toLowerCase().includes(search.toLowerCase());
    const filterZeroBalance =
      !showZeroBalance ||
      Number(
        (Number(entry[1].asset?.balance) / 10 ** entry[1].asset.token.decimals).toLocaleString()
      ) === 0;
    const filterStrict = !showStrict || entry[1].asset.token.strict === true;

    return nameSearch && filterZeroBalance && filterStrict;
  });

  const cannotScoop = (entry: any) => {
    return entry.asset.balance > 0 && !entry.swap && entry.usdPrice > 1;
  };

  const sortedAssets = [...filteredData].sort((a, b) => {
    let comparison = 0;

    switch (sortOption) {
      case "symbol":
        comparison = a[1].asset.token.symbol.localeCompare(b[1].asset.token.symbol);
        break;
      case "balance":
        comparison =
          Number(a[1].asset.balance) / 10 ** a[1].asset.token.decimals -
          Number(b[1].asset.balance) / 10 ** b[1].asset.token.decimals;
        break;
      case "value":
        comparison =
          ((Number(a[1].quote?.outAmount) ?? 0) || 0) - ((Number(b[1].quote?.outAmount) ?? 0) || 0);
        break;
      default:
        break;
    }

    return ascending === true ? comparison : -comparison; // Adjust comparison based on sortOrder
  });

  const handlePercentageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputPercentage = parseFloat(e.target.value);
    if (inputPercentage > 100) {
      setPercentage(100);
      setSwapValue(maxPossibleScoop);
    } else {
      setPercentage(inputPercentage);
      setSwapValue((maxPossibleScoop / 100) * inputPercentage);
    }
  };

  const handleSwapValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const swapValue = parseFloat(e.target.value) * 10 ** 6;
    if (swapValue > maxPossibleScoop) {
      setSwapValue(maxPossibleScoop);
      setPercentage(100);
    } else {
      setSwapValue(swapValue);
      setPercentage((100 / totalPossibleScoop) * swapValue);
    }
  };

  const handleCopyClick = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("text copied to clipboard!");
      })
      .catch((err) => {
        toast.error("failed to copy text!");
        console.error("failed to copy text: ", err);
      });
  };

  const SummaryModal = () => {
    return (
      <div
        className={`lowercase fixed inset-0 z-30 flex h-full w-full flex-col gap-4 bg-black bg-opacity-75 transition-all duration-1000 items-center justify-center ${
          openModal == "swap" ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div
          className="relative grid md:grid-cols-[2fr_1fr] w-screen max-w-5xl border border-gray-600 bg-black px-4 py-8 sm:px-6 lg:px-8 rounded max-h-[80vh] gap-8"
          role="dialog"
        >
          <button
            className="absolute end-4 top-4 text-white/60 transition hover:scale-110"
            onClick={() => setOpenModal("")}
          >
            <span className="sr-only">close cart</span>

            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="mt-4 space-y-6 overflow-hidden overflow-y-auto pr-8">
            <ul className="space-y-4">
              {selectedItems.map((entry, index) => {
                return (
                  <li key={entry.asset.token.address} className="flex items-center gap-4">
                    <img
                      src={entry.asset.token.logoURI}
                      alt="Logo"
                      className="h-16 w-16 rounded object-cover"
                    />

                    <div>
                      <h3 className="text-sm text-white">{entry.asset.token.name}</h3>

                      <dl className="mt-0.5 space-y-px text-[10px] text-white">
                        <div>
                          <dt className="inline">balance: </dt>
                          <dd className="inline">
                            {(
                              Number(entry.asset?.balance) /
                              10 ** entry.asset.token.decimals
                            ).toLocaleString()}
                          </dd>
                        </div>

                        <div>
                          <dt className="inline">swapping: </dt>
                          <dd className="inline">
                            {(
                              (Number(entry.asset?.balance) /
                                10 ** entry.asset.token.decimals /
                                100) *
                              percentage
                            ).toLocaleString()}
                          </dd>
                        </div>

                        <div>
                          <dt className="inline">swap value: </dt>
                          <dd className="inline">
                            {entry.quote?.outAmount
                              ? "$" +
                                (Number(entry.quote.outAmount) / 10 ** 6)
                                  .toFixed(2)
                                  .toLocaleString()
                              : "No quote"}
                          </dd>
                        </div>
                        {/* {entry.quote && !entry.swap && (
                          <div>
                            <dt className="inline">
                              <strong>!!! Swap can't be performed, burning instead !!!</strong>
                            </dt>
                          </div>
                        )} */}
                      </dl>
                    </div>

                    <div className="flex flex-1 items-center justify-end gap-2">
                      {state === ApplicationStates.LOADED_QUOTES ? (
                        <button
                          className="text-white/60 transition hover:text-white"
                          onClick={() => {
                            updateAssetList((aL) => {
                              aL[entry.asset?.token.address].checked = false;
                              if (selectedItems.length === 1) {
                                setOpenModal("");
                              }
                              return aL;
                            });
                          }}
                        >
                          <span className="sr-only">remove item</span>

                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M8 11C7.44772 11 7 11.4477 7 12C7 12.5523 7.44772 13 8 13H16C16.5523 13 17 12.5523 17 12C17 11.4477 16.5523 11 16 11H8Z"
                              fill="currentColor"
                            />
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12ZM21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      ) : state === ApplicationStates.SCOOPING ? (
                        // Loading
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="animate-spin"
                        >
                          <path
                            opacity="0.2"
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19ZM12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                            fill="currentColor"
                          />
                          <path
                            d="M2 12C2 6.47715 6.47715 2 12 2V5C8.13401 5 5 8.13401 5 12H2Z"
                            fill="currentColor"
                          />
                        </svg>
                      ) : entry.transactionState === "swapped" ? (
                        // Checkmark
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="text-bonk-green"
                        >
                          <path
                            d="M10.2426 16.3137L6 12.071L7.41421 10.6568L10.2426 13.4853L15.8995 7.8284L17.3137 9.24262L10.2426 16.3137Z"
                            fill="currentColor"
                          />
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M1 5C1 2.79086 2.79086 1 5 1H19C21.2091 1 23 2.79086 23 5V19C23 21.2091 21.2091 23 19 23H5C2.79086 23 1 21.2091 1 19V5ZM5 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3Z"
                            fill="currentColor"
                          />
                        </svg>
                      ) : (
                        // X
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="text-bonk-red-400"
                        >
                          <path
                            d="M16.3956 7.75734C16.7862 8.14786 16.7862 8.78103 16.3956 9.17155L13.4142 12.153L16.0896 14.8284C16.4802 15.2189 16.4802 15.8521 16.0896 16.2426C15.6991 16.6331 15.0659 16.6331 14.6754 16.2426L12 13.5672L9.32458 16.2426C8.93405 16.6331 8.30089 16.6331 7.91036 16.2426C7.51984 15.8521 7.51984 15.2189 7.91036 14.8284L10.5858 12.153L7.60436 9.17155C7.21383 8.78103 7.21383 8.14786 7.60436 7.75734C7.99488 7.36681 8.62805 7.36681 9.01857 7.75734L12 10.7388L14.9814 7.75734C15.372 7.36681 16.0051 7.36681 16.3956 7.75734Z"
                            fill="currentColor"
                          />
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M4 1C2.34315 1 1 2.34315 1 4V20C1 21.6569 2.34315 23 4 23H20C21.6569 23 23 21.6569 23 20V4C23 2.34315 21.6569 1 20 1H4ZM20 3H4C3.44772 3 3 3.44772 3 4V20C3 20.5523 3.44772 21 4 21H20C20.5523 21 21 20.5523 21 20V4C21 3.44772 20.5523 3 20 3Z"
                            fill="currentColor"
                          />
                        </svg>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-4 mt-4">
            <div className="border-t border-gray-100">
              <div className="space-y-4">
                <dl className="space-y-0.5 text-sm text-white">
                  <div className="flex justify-between">
                    <dt>no. of swapped tokens</dt>
                    <dd>{selectedItems.length}</dd>
                  </div>

                  <div className="flex justify-between">
                    <dt>total swap value</dt>
                    <dd>
                      $
                      {((maxPossibleScoop / 10 ** 6 / 100) * (percentage || 0))
                        .toFixed(2)
                        .toLocaleString()}
                    </dd>
                  </div>

                  <div className="flex justify-between">
                    <dt>swap to</dt>
                    <dd>{swapToToken?.symbol}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <button
              onClick={scoop}
              disabled={state === ApplicationStates.SCOOPED}
              className={`block rounded px-5 py-3 text-sm border border-gray-600 bg-black transition w-full ${
                state === ApplicationStates.SCOOPED
                  ? "hover:cursor-not-allowed"
                  : "hover:opacity-80"
              }`}
            >
              solo: swap
            </button>
            {state === ApplicationStates.SCOOPED && (
              <div className="italic text-sm text-center">
                transaction has been processed, please refresh assets
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const SendModal = () => {
    return (
      <div
        className={`lowercase fixed inset-0 z-30 flex h-full w-full flex-col gap-4 bg-black bg-opacity-75 transition-all duration-1000 items-center justify-center ${
          openModal == "send" ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div
          className="relative grid md:grid-cols-[2fr_1fr] w-screen max-w-5xl border border-gray-600 bg-black px-4 py-8 sm:px-6 lg:px-8 rounded max-h-[80vh] gap-8"
          role="dialog"
        >
          <button
            className="absolute end-4 top-4 text-white/60 transition hover:scale-110"
            onClick={() => setOpenModal("")}
          >
            <span className="sr-only">close cart</span>

            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="mt-4 space-y-6 overflow-hidden overflow-y-auto pr-8">
            <ul className="space-y-4">
              {selectedItems.map((entry, index) => {
                return (
                  <li key={entry.asset.token.address} className="flex items-center gap-4">
                    <img
                      src={entry.asset.token.logoURI}
                      alt="Logo"
                      className="h-16 w-16 rounded object-cover"
                    />

                    <div>
                      <h3 className="text-sm text-white">{entry.asset.token.name}</h3>

                      <dl className="mt-0.5 space-y-px text-[10px] text-white">
                        <div>
                          <dt className="inline">balance: </dt>
                          <dd className="inline">
                            {(
                              Number(entry.asset?.balance) /
                              10 ** entry.asset.token.decimals
                            ).toLocaleString()}
                          </dd>
                        </div>

                        <div>
                          <dt className="inline">sending: </dt>
                          <dd className="inline">
                            {(
                              (Number(entry.asset?.balance) /
                                10 ** entry.asset.token.decimals /
                                100) *
                              percentage
                            ).toLocaleString()}
                          </dd>
                        </div>

                        <div>
                          <dt className="inline">send value: </dt>
                          <dd className="inline">
                            {entry.quote?.outAmount
                              ? "$" +
                                (Number(entry.quote.outAmount) / 10 ** 6)
                                  .toFixed(2)
                                  .toLocaleString()
                              : "No quote"}
                          </dd>
                        </div>
                        {/* {entry.quote && !entry.swap && (
                          <div>
                            <dt className="inline">
                              <strong>!!! Swap can't be performed, burning instead !!!</strong>
                            </dt>
                          </div>
                        )} */}
                      </dl>
                    </div>

                    <div className="flex flex-1 items-center justify-end gap-2">
                      {state === ApplicationStates.LOADED_QUOTES ? (
                        <button
                          className="text-white/60 transition hover:text-white"
                          onClick={() => {
                            updateAssetList((aL) => {
                              aL[entry.asset?.token.address].checked = false;
                              if (selectedItems.length === 1) {
                                setOpenModal("false");
                              }
                              return aL;
                            });
                          }}
                        >
                          <span className="sr-only">remove item</span>

                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M8 11C7.44772 11 7 11.4477 7 12C7 12.5523 7.44772 13 8 13H16C16.5523 13 17 12.5523 17 12C17 11.4477 16.5523 11 16 11H8Z"
                              fill="currentColor"
                            />
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12ZM21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      ) : state === ApplicationStates.SENDING ? (
                        // Loading
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="animate-spin"
                        >
                          <path
                            opacity="0.2"
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19ZM12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                            fill="currentColor"
                          />
                          <path
                            d="M2 12C2 6.47715 6.47715 2 12 2V5C8.13401 5 5 8.13401 5 12H2Z"
                            fill="currentColor"
                          />
                        </svg>
                      ) : entry.transactionState === "sent" ? (
                        // Checkmark
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="text-bonk-green"
                        >
                          <path
                            d="M10.2426 16.3137L6 12.071L7.41421 10.6568L10.2426 13.4853L15.8995 7.8284L17.3137 9.24262L10.2426 16.3137Z"
                            fill="currentColor"
                          />
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M1 5C1 2.79086 2.79086 1 5 1H19C21.2091 1 23 2.79086 23 5V19C23 21.2091 21.2091 23 19 23H5C2.79086 23 1 21.2091 1 19V5ZM5 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3Z"
                            fill="currentColor"
                          />
                        </svg>
                      ) : (
                        // X
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="text-bonk-red-400"
                        >
                          <path
                            d="M16.3956 7.75734C16.7862 8.14786 16.7862 8.78103 16.3956 9.17155L13.4142 12.153L16.0896 14.8284C16.4802 15.2189 16.4802 15.8521 16.0896 16.2426C15.6991 16.6331 15.0659 16.6331 14.6754 16.2426L12 13.5672L9.32458 16.2426C8.93405 16.6331 8.30089 16.6331 7.91036 16.2426C7.51984 15.8521 7.51984 15.2189 7.91036 14.8284L10.5858 12.153L7.60436 9.17155C7.21383 8.78103 7.21383 8.14786 7.60436 7.75734C7.99488 7.36681 8.62805 7.36681 9.01857 7.75734L12 10.7388L14.9814 7.75734C15.372 7.36681 16.0051 7.36681 16.3956 7.75734Z"
                            fill="currentColor"
                          />
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M4 1C2.34315 1 1 2.34315 1 4V20C1 21.6569 2.34315 23 4 23H20C21.6569 23 23 21.6569 23 20V4C23 2.34315 21.6569 1 20 1H4ZM20 3H4C3.44772 3 3 3.44772 3 4V20C3 20.5523 3.44772 21 4 21H20C20.5523 21 21 20.5523 21 20V4C21 3.44772 20.5523 3 20 3Z"
                            fill="currentColor"
                          />
                        </svg>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-4 mt-4">
            <div className="border-t border-gray-100">
              <div className="space-y-4">
                <dl className="space-y-0.5 text-sm text-white">
                  <div className="flex justify-between">
                    <dt>no. of tokens</dt>
                    <dd>{selectedItems.length}</dd>
                  </div>

                  <div className="flex justify-between">
                    <dt>total send value</dt>
                    <dd>
                      $
                      {((maxPossibleScoop / 10 ** 6 / 100) * (percentage || 0))
                        .toFixed(2)
                        .toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>send to wallet</dt>
                    <dd className="truncate flex gap-1 items-center">
                      {trimAddress(sendToWallet)}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-3 cursor-pointer"
                        onClick={() => handleCopyClick(sendToWallet)}
                      >
                        <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      </svg>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <button
              onClick={send}
              disabled={state === ApplicationStates.SENDING}
              className={`block rounded px-5 py-3 text-sm border border-gray-600 bg-black transition w-full ${
                state === ApplicationStates.SENT ? "hover:cursor-not-allowed" : "hover:opacity-80"
              }`}
            >
              solo: send
            </button>
            {state === ApplicationStates.SENT && (
              <div className="italic text-sm text-center">
                transaction has been processed, please refresh assets
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ScoopList = () => {
    return (
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        <div className={`overflow-x-auto rounded-4xl self-start`}>
          <table className="min-w-full divide-y-2 divide-gray-200 bg-black text-sm">
            <thead className="ltr:text-left rtl:text-right">
              <tr>
                <th className="sticky inset-y-0 start-0 bg-black text-white p-4">
                  <label className="sr-only">select all</label>

                  <input
                    type="checkbox"
                    id="SelectAll"
                    checked={selectAll}
                    className="h-4 w-4 text-white rounded border-gray-300"
                    onClick={() => handleSelectAll()}
                    disabled={state !== ApplicationStates.LOADED_QUOTES}
                  />
                </th>
                <th className="lowercase whitespace-nowrap p-4 font-medium text-white text-lg text-left">
                  symbol
                </th>
                <th className="lowercase whitespace-nowrap p-4 font-medium text-white text-lg text-right">
                  balance
                </th>
                <th className="lowercase whitespace-nowrap p-4 font-medium text-white text-lg text-right">
                  value
                </th>
                {/* <th className="lowercase whitespace-nowrap p-4 font-medium text-white text-lg text-right">
                  Sol
                </th> */}
                {/* <th className="lowercase whitespace-nowrap p-4 font-medium text-white text-lg text-right flex gap-4 justify-end">
                  Token List
                  <div className="lowercase group relative hover:cursor-help max-w-max">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M11 10.9794C11 10.4271 11.4477 9.97937 12 9.97937C12.5523 9.97937 13 10.4271 13 10.9794V16.9794C13 17.5317 12.5523 17.9794 12 17.9794C11.4477 17.9794 11 17.5317 11 16.9794V10.9794Z"
                        fill="currentColor"
                      />
                      <path
                        d="M12 6.05115C11.4477 6.05115 11 6.49886 11 7.05115C11 7.60343 11.4477 8.05115 12 8.05115C12.5523 8.05115 13 7.60343 13 7.05115C13 6.49886 12.5523 6.05115 12 6.05115Z"
                        fill="currentColor"
                      />
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12Z"
                        fill="currentColor"
                      />
                    </svg>
                    <div className="lowercase hidden bg-black text-white text-center text-xs rounded-lg py-2 absolute z-10 group-hover:block top-6 px-3 -right-6 w-64 md:w-96 hover:cursor-auto text-wrap">
                      <a
                          className="lowercase flex gap-4 items-right hover:font-bold"
                          href={`https://station.jup.ag/docs/token-list/token-list-api#strict-and-all-lists`}
                          target="_blank"
                      >jupiter token list</a>
                    </div>
                  </div>
                </th>
                {/* <th className="whitespace-nowrap p-4 font-medium text-gray-900 text-lg">
                    Status
                  </th> */}
              </tr>
            </thead>
            <tbody className="lowercase divide-y divide-gray-200 relative">
              {state !== ApplicationStates.LOADED_QUOTES &&
                state !== ApplicationStates.SCOOPED &&
                state !== ApplicationStates.SCOOPING &&
                state !== ApplicationStates.SENDING &&
                state !== ApplicationStates.SENT && (
                  <tr>
                    <td className="lowercase table-cell" colSpan={100}>
                      <div className="lowercase text-center text-white text-lg lg:text-4xl bg-black flex items-center gap-2 min-h-48 h-full w-full justify-center animate-pulse">
                        fetching data...{" "}
                        <svg
                          width="72"
                          height="72"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="lowercase animate-spin w-12 h-12 lg:w-auto lg:h-auto"
                        >
                          <path
                            opacity="0.2"
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19ZM12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                            fill="black"
                          />
                          <path
                            d="M12 22C17.5228 22 22 17.5228 22 12H19C19 15.866 15.866 19 12 19V22Z"
                            fill="black"
                          />
                          <path
                            d="M2 12C2 6.47715 6.47715 2 12 2V5C8.13401 5 5 8.13401 5 12H2Z"
                            fill="black"
                          />
                        </svg>
                      </div>
                    </td>
                  </tr>
                )}
              {state === ApplicationStates.LOADED_QUOTES && filteredData.length === 0 && (
                <tr>
                  <td className="table-cell" colSpan={5}>
                    <div className="text-center font-black lowercase text-lg lg:text-4xl bg-white/70 flex items-center gap-2 min-h-48 h-full w-full justify-center">
                      no data
                    </div>
                  </td>
                </tr>
              )}
              {sortedAssets.map(([key, entry]) => {
                let burnReturn = getAssetBurnReturn(entry);
                return (
                  <tr
                    key={key}
                    className={`group !border-l-8 ${
                      entry.checked
                        ? "!border-l-8 !border-l-pink-500 bg-black"
                        : "hover:bg-gray-800 hover:!border-l-pink-500 hover:text-white"
                    }`}
                  >
                    <td
                      className={`p-4 bg-black group-hover:bg-black text-center ${
                        entry.checked ? "!bg-black" : ""
                      }`}
                    >
                      {forbiddenTokens.includes(entry.asset.token.symbol) || (
                        <input
                          className="h-4 w-4 rounded border-gray-800"
                          checked={!!entry.checked}
                          onChange={(change) => {
                            updateAssetList((aL) => {
                              aL[entry.asset?.token.address].checked = change.target.checked;
                              return aL;
                            });
                            setSwapValue((v) => {
                              if (change.target.checked) {
                                return v + (Number(entry.quote?.outAmount || 0) / 100) * percentage;
                              } else {
                                return v - (Number(entry.quote?.outAmount || 0) / 100) * percentage;
                              }
                            });
                          }}
                          type="checkbox"
                          disabled={state !== ApplicationStates.LOADED_QUOTES}
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap p-4 text-gray-200 text-left">
                      <a
                        className="flex gap-4 items-center hover:font-bold"
                        href={`https://birdeye.so/token/${entry.asset.token.address}?chain=solana`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {entry.asset.token.logoURI ? (
                          <img
                            src={entry.asset.token.logoURI}
                            alt={`${entry.asset.token.symbol} Logo`}
                            className="h-8 w-8 rounded-full border border-[#091e05]"
                          />
                        ) : (
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-8 w-8 rounded-full border border-[#091e05]"
                          >
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M17 5V4C17 2.89543 16.1046 2 15 2H9C7.89543 2 7 2.89543 7 4V5H4C3.44772 5 3 5.44772 3 6C3 6.55228 3.44772 7 4 7H5V18C5 19.6569 6.34315 21 8 21H16C17.6569 21 19 19.6569 19 18V7H20C20.5523 7 21 6.55228 21 6C21 5.44772 20.5523 5 20 5H17ZM15 4H9V5H15V4ZM17 7H7V18C7 18.5523 7.44772 19 8 19H16C16.5523 19 17 18.5523 17 18V7Z"
                              fill="currentColor"
                            />
                            <path d="M9 9H11V17H9V9Z" fill="currentColor" />
                            <path d="M13 9H15V17H13V9Z" fill="currentColor" />
                          </svg>
                        )}
                        <p>{entry.asset.token.symbol}</p>
                      </a>
                    </td>
                    <td className="whitespace-nowrap p-4 text-blue-300 text-right font-mono hover:font-bold">
                      {(Number(entry.asset?.balance) / 10 ** entry.asset.token.decimals)
                        .toFixed(2)
                        .replace(/\d(?=(\d{3})+\.)/g, "$&,")}
                    </td>
                    <td className="whitespace-nowrap p-4 text-green-300 text-right font-mono hover:font-bold">
                      $
                      {entry.quote?.outAmount
                        ? (Number(burnReturn.bonkAmount) / 10 ** 6)
                            .toFixed(2)
                            .replace(/\d(?=(\d{3})+\.)/g, "$&,")
                        : "No quote"}
                    </td>
                    {/* <td className="whitespace-nowrap p-4 text-white text-right font-mono">
                      {(
                        Number(burnReturn.lamportsAmount) / LAMPORTS_PER_SOL
                      ).toLocaleString()}
                    </td> */}
                    {/* <td className="whitespace-nowrap p-4 text-white text-right font-mono">
                      {(
                        Number(burnReturn.feeAmount) /
                        10 ** 5
                      ).toLocaleString()}
                    </td> */}
                    {/* <td className="whitespace-nowrap p-4 bg-black text-white text-right">
                      {entry.asset?.token.strict && <p>Strict</p>}
                    </td> */}
                    <td className="whitespace-nowrap p-4 bg-black text-white text-right">
                      {entry.transactionState && <p>{entry.transactionState}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="lg:sticky order-first lg:order-last top-12 mb-auto grid gap-4">
          <div className="flex flex-col gap-4 bg-black text-white rounded-3xl p-4">
            <article className="flex items-center gap-4 rounded-lg border border-gray-300 bg-black text-white py-6 px-4 sm:justify-between">
              {/* <span className="rounded-full bg-black text-white p-3 text-pink-500 sm:order-last">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M17 5V4C17 2.89543 16.1046 2 15 2H9C7.89543 2 7 2.89543 7 4V5H4C3.44772 5 3 5.44772 3 6C3 6.55228 3.44772 7 4 7H5V18C5 19.6569 6.34315 21 8 21H16C17.6569 21 19 19.6569 19 18V7H20C20.5523 7 21 6.55228 21 6C21 5.44772 20.5523 5 20 5H17ZM15 4H9V5H15V4ZM17 7H7V18C7 18.5523 7.44772 19 8 19H16C16.5523 19 17 18.5523 17 18V7Z"
                    fill="currentColor"
                  />
                  <path d="M9 9H11V17H9V9Z" fill="currentColor" />
                  <path d="M13 9H15V17H13V9Z" fill="currentColor" />
                </svg>
              </span> */}
              <span className="rounded-full bg-black text-white p-3 sm:order-last">
                <FontAwesomeIcon icon={faMoneyBillWave} size="1x" className="text-green-300" />
              </span>
              <div>
                <p className="text-2xl bg-black text-white font-medium">
                  ${(totalPossibleScoop / 10 ** 6).toFixed(2).toLocaleString()}
                </p>

                <p className="text-sm text-white lowercase">portfolio value</p>
              </div>
            </article>
            <article className="flex items-center gap-4 rounded-lg border border-gray-300 bg-black text-white py-6 px-4 sm:justify-between">
              <span className="rounded-full bg-black text-white sm:order-last">
                {/* <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M22.775 8C22.9242 8.65461 23 9.32542 23 10H14V1C14.6746 1 15.3454 1.07584 16 1.22504C16.4923 1.33724 16.9754 1.49094 17.4442 1.68508C18.5361 2.13738 19.5282 2.80031 20.364 3.63604C21.1997 4.47177 21.8626 5.46392 22.3149 6.55585C22.5091 7.02455 22.6628 7.5077 22.775 8ZM20.7082 8C20.6397 7.77018 20.5593 7.54361 20.4672 7.32122C20.1154 6.47194 19.5998 5.70026 18.9497 5.05025C18.2997 4.40024 17.5281 3.88463 16.6788 3.53284C16.4564 3.44073 16.2298 3.36031 16 3.2918V8H20.7082Z"
                    fill="currentColor"
                  />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M1 14C1 9.02944 5.02944 5 10 5C10.6746 5 11.3454 5.07584 12 5.22504V12H18.775C18.9242 12.6546 19 13.3254 19 14C19 18.9706 14.9706 23 10 23C5.02944 23 1 18.9706 1 14ZM16.8035 14H10V7.19648C6.24252 7.19648 3.19648 10.2425 3.19648 14C3.19648 17.7575 6.24252 20.8035 10 20.8035C13.7575 20.8035 16.8035 17.7575 16.8035 14Z"
                    fill="currentColor"
                  />
                </svg> */}
                <span className="rounded-full bg-black text-white p-3 sm:order-last">
                  <FontAwesomeIcon icon={faChartPie} size="1x" className="text-pink-500" />
                </span>
              </span>

              <div>
                <p>max swap value ${(maxPossibleScoop / 10 ** 6).toFixed(2).toString()}</p>
                <div className="mt-2">
                  <span className="pr-2 text-xl">$</span>
                  <input
                    type="number"
                    min="0"
                    max={totalPossibleScoop}
                    value={swapValue / 10 ** 6}
                    onChange={handleSwapValueChange}
                    className="lowercase border border-gray-300 bg-black w-40 text-white rounded-md p-2"
                  />
                </div>
                <div className="mt-2">
                  <span className="pr-2 text-xl">%</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={percentage}
                    onChange={handlePercentageChange}
                    className="lowercase border border-gray-300 bg-black w-40 text-white rounded-md p-2"
                  />
                </div>
                <p className="lowercase text-2xl mt-2 font-medium bg-black text-white">
                  {/* ${(valueToSwap / 10 ** 6).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, "$&,")} */}
                </p>
                <div className="lowercase text-sm bg-black text-white flex items-center gap-2">
                  to swap to{" "}
                  <button
                    onClick={() => setOpenModal("token")}
                    className="lowercase border border-white py-1 px-2 rounded-md flex gap-1 items-center"
                  >
                    {swapToToken?.symbol || "-"}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3"
                    >
                      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                      <path d="m15 5 4 4" />
                    </svg>
                  </button>
                </div>
                <div className="lowercase text-sm mt-2 bg-black text-white flex items-center gap-2">
                  slippage
                  <button
                    onClick={() => setOpenModal("settings")}
                    className="border border-white py-1 px-2 rounded-md flex gap-1 items-center"
                  >
                    {slippage}%
                  </button>
                </div>
                <div className="lowercase text-sm mt-2 bg-black text-white flex items-center gap-2">
                  priority fee
                  <button
                    onClick={() => setOpenModal("settings")}
                    className="border border-white py-1 px-2 rounded-md flex gap-1 items-center"
                  >
                    {priorityFee}
                  </button>
                </div>
              </div>
            </article>

            <button
              className={`inline-block grow rounded bg-black border border-white text-white lowercase py-3 font-medium transition focus:outline-none focus:ring text-xl ${
                isButtonDisabled
                  ? "hover:cursor-not-allowed opacity-10"
                  : "hover:shadow-xl hover:opacity-60"
              }`}
              disabled={isButtonDisabled}
              onClick={() => {
                if (!percentage || percentage < 0 || percentage > 100) {
                  toast.error("Invalid percentage value");
                } else {
                  setOpenModal("swap");
                }
              }}
            >
              swap
            </button>

            <div className="flex items-center gap-2">
              <div className="h-[1px] bg-white/60 flex-1" />
              <p className="opacity-60 text-center text-xs">or</p>
              <div className="h-[1px] bg-white/60 flex-1" />
            </div>
            <div className="grid  gap-2">
              <input
                value={sendToWallet}
                onChange={(e) => {
                  console.log(e.target.value);
                  setSendToWallet(e.target.value);
                }}
                disabled={isButtonDisabled}
                placeholder="wallet address..."
                className={`block rounded px-5 py-3 border border-white bg-black transition w-full ${
                  isButtonDisabled ? "hover:cursor-not-allowed opacity-10" : "hover:opacity-80"
                }`}
              />
              <button
                className={`inline-block rounded bg-black border border-white text-white lowercase py-3 font-medium transition focus:outline-none focus:ring text-xl ${
                  isButtonDisabled
                    ? "hover:cursor-not-allowed opacity-10"
                    : "hover:shadow-xl hover:opacity-60"
                }`}
                disabled={isButtonDisabled}
                onClick={() => {
                  if (!percentage || percentage < 0 || percentage > 100) {
                    toast.error("Invalid percentage value");
                  } else {
                    try {
                      new PublicKey(sendToWallet);
                      setOpenModal("send");
                    } catch (error) {
                      toast.error("Invalid wallet address");
                    }
                  }
                }}
              >
                send
              </button>
            </div>
          </div>
          <div
            className={`lowercase grid gap-2 bg-black rounded-3xl p-4 ${
              state !== ApplicationStates.LOADED_QUOTES &&
              state !== ApplicationStates.SCOOPED &&
              state !== ApplicationStates.SCOOPING &&
              state !== ApplicationStates.SENDING &&
              state !== ApplicationStates.SENT &&
              "hover:cursor-not-allowed"
            }`}
          >
            <div
              className={`relative lowercase ${
                state !== ApplicationStates.LOADED_QUOTES &&
                state !== ApplicationStates.SCOOPED &&
                state !== ApplicationStates.SCOOPING &&
                state !== ApplicationStates.SENDING &&
                state !== ApplicationStates.SENT &&
                "pointer-events-none"
              }`}
            >
              <label className="lowercase bg-black text-white sr-only"> search </label>

              <input
                type="text"
                placeholder="search asset"
                className="w-full rounded border bg-black border-gray-600 py-2.5 px-4 pe-10 shadow-sm sm:text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <span className="lowercase absolute text-white inset-y-0 end-0 grid w-10 place-content-center">
                <button type="button" className="text-white hover:text-white">
                  <span className="lowercase sr-only">Search</span>

                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </button>
              </span>
            </div>
            <div
              className={`space-y-2 ${
                state !== ApplicationStates.LOADED_QUOTES &&
                state !== ApplicationStates.SCOOPED &&
                state !== ApplicationStates.SCOOPING &&
                state !== ApplicationStates.SENDING &&
                state !== ApplicationStates.SENT &&
                "pointer-events-none"
              }`}
            >
              {/* <details className="lowercase overflow-hidden rounded border border-gray-300 [&_summary::-webkit-details-marker]:hidden">
                <summary className="lowercase flex cursor-pointer items-center justify-between gap-2 text-white bg-black p-4 transition">
                  <span className="lowercase text-sm font-medium"> Filter </span>

                  <span className="lowercase transition group-open:-rotate-180">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      className="h-4 w-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </span>
                </summary>

                <div className="lowercase border-t border-gray-200 bg-black">
                  <ul className="lowercase space-y-1 border-t bg-black border-gray-200 p-4">
                    <li>
                      <label className="lowercase inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="lowercase h-5 w-5 bg-black rounded border-gray-300"
                          onClick={() => setShowZeroBalance(!showZeroBalance)}
                        />

                        <span className="lowercase text-sm font-medium text-white bg-black">
                          0 Balance
                        </span>
                      </label>
                    </li>

                    <li>
                      <label className="lowercase inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="lowercase h-5 w-5 bg-black rounded border-gray-300"
                          onClick={() => setShowStrict(!showStrict)}
                        />

                        <span className="lowercase text-sm font-medium text-white bg-black">
                          Strict
                        </span>
                      </label>
                    </li>
                  </ul>
                </div>
              </details> */}

              <details className="lowercase overflow-hidden rounded border border-gray-300 [&_summary::-webkit-details-marker]:hidden">
                <summary className="lowercase lex cursor-pointer items-center justify-between gap-2 text-white bg-black p-4 transition">
                  <span className="lowercase text-sm font-medium text-white bg-black"> sort </span>

                  {/* <span className="lowercase transition group-open:-rotate-180 text-white bg-black">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      className="h-4 w-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </span> */}
                </summary>

                <div className="lowercase border-t border-gray-200 text-white bg-black">
                  <header className="lowercase flex items-center justify-between p-4">
                    <span className="lowercase text-sm text-white bg-black flex items-center gap-2">
                      ascending
                      <label className="lowercase relative h-8 w-12 cursor-pointer [-webkit-tap-highlight-color:_transparent]">
                        <input
                          type="checkbox"
                          id="AcceptConditions"
                          className="lowercase peer sr-only"
                          checked={!ascending}
                          onClick={() => setAscending(!ascending)}
                        />

                        <span className="lowercase absolute inset-0 m-auto h-2 rounded-full bg-gray-600"></span>

                        <span className="lowercase absolute inset-y-0 start-0 m-auto h-6 w-6 rounded-full bg-gray-500 transition-all peer-checked:start-6 peer-checked:[&_>_*]:scale-0">
                          <span className="lowercase absolute inset-0 m-auto h-4 w-4 rounded-full text-white bg-black transition">
                            {" "}
                          </span>
                        </span>
                      </label>
                      descending
                    </span>
                  </header>

                  <ul className="lowercase space-y-1 text-white bg-black border-t border-gray-200 p-4">
                    <li>
                      <label className="lowercase text-white bg-black inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="sort"
                          value="symbol"
                          checked={sortOption === "symbol"}
                          onChange={(e) => setSortOption("symbol")}
                          className="lowercase text-white bg-black h-5 w-5 rounded border-gray-300"
                        />

                        <span className="lowercase text-sm font-medium text-white bg-black">
                          symbol
                        </span>
                      </label>
                    </li>

                    <li>
                      <label className="lowercase inline-flex items-center text-white bg-black gap-2">
                        <input
                          type="radio"
                          name="sort"
                          value="balance"
                          checked={sortOption === "balance"}
                          onClick={(e) => setSortOption("balance")}
                          className="text-white bg-black lowercase h-5 w-5 rounded border-gray-300"
                        />

                        <span className="lowercase text-sm font-medium text-white bg-black">
                          balance
                        </span>
                      </label>
                    </li>

                    <li>
                      <label className="text-white bg-black lowercase inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="sort"
                          value="value"
                          checked={sortOption === "value"}
                          onClick={(e) => setSortOption("value")}
                          className="h-5 w-5 text-white bg-black rounded border-gray-300"
                        />

                        <span className="lowercase text-sm font-medium text-white bg-black">
                          swap value
                        </span>
                      </label>
                    </li>
                  </ul>
                </div>
              </details>
            </div>
            <div
              className={`flex justify-end w-full ${
                state !== ApplicationStates.LOADED_QUOTES &&
                state !== ApplicationStates.SCOOPED &&
                state !== ApplicationStates.SCOOPING &&
                state !== ApplicationStates.SENDING &&
                state !== ApplicationStates.SENT &&
                "pointer-events-none"
              }`}
            >
              <div
                className="bg-[#000000] border border-white text-white text-center py-2 rounded hover:opacity-60 hover:cursor-pointer max-w-max px-8 flex items-center gap-2"
                onClick={(x) => {
                  reload();
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M13.1459 11.0499L12.9716 9.05752L15.3462 8.84977C14.4471 7.98322 13.2242 7.4503 11.8769 7.4503C9.11547 7.4503 6.87689 9.68888 6.87689 12.4503C6.87689 15.2117 9.11547 17.4503 11.8769 17.4503C13.6977 17.4503 15.2911 16.4771 16.1654 15.0224L18.1682 15.5231C17.0301 17.8487 14.6405 19.4503 11.8769 19.4503C8.0109 19.4503 4.87689 16.3163 4.87689 12.4503C4.87689 8.58431 8.0109 5.4503 11.8769 5.4503C13.8233 5.4503 15.5842 6.24474 16.853 7.52706L16.6078 4.72412L18.6002 4.5498L19.1231 10.527L13.1459 11.0499Z"
                    fill="currentColor"
                  />
                </svg>
                refresh assets
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-4 z-30 relative">
        <ToastContainer />
        <SummaryModal />
        {openModal === "token" && (
          <TokenModal onClose={setOpenModal} onSelect={setSwapToToken} tokenList={verifiedtokens} />
        )}
        {openModal === "settings" && (
          <SettingsModal
            onClose={setOpenModal}
            initialSlippage={slippage}
            updateSlippage={setSlippage}
            initialPriorityFee={priorityFee}
            updatePriorityFee={setPriorityFee}
          />
        )}
        <SendModal />
        {ScoopList()}
      </div>
    </>
  );
};

const TokenModal = ({
  onClose,
  onSelect,
  tokenList,
}: {
  onClose: React.Dispatch<React.SetStateAction<string>>;
  onSelect: React.Dispatch<React.SetStateAction<TokenInfo | undefined>>;
  tokenList: { [id: string]: TokenInfo };
}) => {
  const [inputToken, setInputToken] = useState("");

  const filteredTokenList = Object.values(tokenList).filter((token) => {
    return (
      token.name.toLowerCase().includes(inputToken.toLowerCase()) ||
      token.symbol.toLowerCase().includes(inputToken.toLowerCase()) ||
      token.address.toLowerCase().includes(inputToken.toLowerCase())
    );
  });

  return (
    <div
      className={`lowercase fixed inset-0 z-30 flex h-full w-full flex-col gap-4 bg-black bg-opacity-75 transition-all duration-1000 items-center justify-center`}
    >
      <div
        className="relative grid w-screen max-w-xl border border-gray-600 bg-black px-4 py-8 sm:px-6 lg:px-8 rounded max-h-[80vh] gap-8"
        role="dialog"
      >
        <button
          className="absolute end-4 top-4 text-white/60 transition hover:scale-110"
          onClick={() => onClose("")}
        >
          <span className="sr-only">close cart</span>

          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <input
          placeholder="Search by token or paste address"
          className={`block rounded px-5 py-3 border border-white bg-black transition w-full`}
          value={inputToken}
          onChange={(e) => setInputToken(e.target.value)}
        />
        <div className="overflow-auto flex flex-col">
          {filteredTokenList.map((token) => (
            <button
              onClick={() => {
                onSelect(token);
                onClose("");
              }}
              key={token.address + "modal"}
              className={`flex gap-2 items-start p-2 hover:bg-white/10 rounded-md ${
                forbiddenTokens.includes(token.symbol) ? "-order-1" : ""
              }`}
            >
              <img src={token.logoURI} className="rounded-full h-10 w-10" />
              <div className="text-left">
                <p>{token.symbol}</p>
                <p className="opacity-60">{trimAddress(token.address)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const SettingsModal = ({
  onClose,
  updateSlippage,
  updatePriorityFee,
  initialSlippage,
  initialPriorityFee,
}: {
  onClose: React.Dispatch<React.SetStateAction<string>>;
  updateSlippage: React.Dispatch<React.SetStateAction<string>>;
  updatePriorityFee: React.Dispatch<React.SetStateAction<string>>;
  initialSlippage: string;
  initialPriorityFee: string;
}) => {
  const [slippage, setSlippage] = useState(initialSlippage);
  const [priorityFee, setPriorityFee] = useState(initialPriorityFee);

  const handleOnSave = () => {
    updateSlippage(slippage);
    localStorage.setItem("slippage", slippage);
    updatePriorityFee(priorityFee);
    localStorage.setItem("priorityFee", priorityFee);
    onClose("");
  };

  return (
    <div
      className={`lowercase fixed inset-0 z-30 flex h-full w-full flex-col gap-4 bg-black bg-opacity-75 transition-all duration-1000 items-center justify-center`}
    >
      <div
        className="relative grid w-screen max-w-xl border border-gray-600 bg-black overflow-auto px-4 py-8 sm:px-6 lg:px-8 rounded max-h-[80vh] gap-8"
        role="dialog"
      >
        <button
          className="absolute end-4 top-4 text-white/60 transition hover:scale-110"
          onClick={() => onClose("")}
        >
          <span className="sr-only">Close cart</span>

          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <p className="text-2xl font-semibold">settings</p>

        <div className="flex flex-col">
          <p>priority fee</p>
          <div className="grid grid-cols-4 gap-2 mt-2">
            <button
              onClick={() => setPriorityFee("low")}
              className={`block rounded px-4 py-2 border border-white hover:opacity-60 bg-black transition w-full ${
                priorityFee == "low" ? "bg-white text-black" : ""
              }`}
            >
              low
            </button>
            <button
              onClick={() => setPriorityFee("med")}
              className={`block rounded px-4 py-2 border border-white hover:opacity-60 bg-black transition w-full ${
                priorityFee == "med" ? "bg-white text-black" : ""
              }`}
            >
              med
            </button>
            <button
              onClick={() => setPriorityFee("high")}
              className={`block rounded px-4 py-2 border border-white hover:opacity-60 bg-black transition w-full ${
                priorityFee == "high" ? "bg-white text-black" : ""
              }`}
            >
              high
            </button>
            <button
              onClick={() => setPriorityFee("turbo")}
              className={`block rounded px-4 py-2 border border-white hover:opacity-60 bg-black transition w-full ${
                priorityFee == "turbo" ? "bg-white text-black" : ""
              }`}
            >
              turbo
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <p>slippage</p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button
              onClick={() => setSlippage("0.3")}
              className={`block rounded px-4 py-2 border border-white hover:opacity-60 bg-black transition w-full ${
                slippage == "0.3" ? "bg-white text-black" : ""
              }`}
            >
              0.3%
            </button>
            <button
              onClick={() => setSlippage("0.5")}
              className={`block rounded px-4 py-2 border border-white hover:opacity-60 bg-black transition w-full ${
                slippage == "0.5" ? "bg-white text-black" : ""
              }`}
            >
              0.5%
            </button>
            <button
              onClick={() => setSlippage("1")}
              className={`block rounded px-4 py-2 border border-white hover:opacity-60 bg-black transition w-full ${
                slippage == "1" ? "bg-white text-black" : ""
              }`}
            >
              1%
            </button>
          </div>

          <div className="h-[1px] bg-white/40 w-full my-4" />

          <div className="flex border-white border rounded items-center ml-auto w-56">
            <span className="px-2 text-white/60">custom</span>
            <input
              placeholder="0.00"
              min="0.01"
              max="100"
              step="0.01"
              className="rounded py-2 w-full text-right bg-black focus:outline-0"
              value={slippage}
              onChange={(e) => {
                let value = e.target.value;

                // Allow empty input to enable deletion
                if (value === "") {
                  setSlippage("");
                  return;
                }

                // Remove any non-numeric characters except for the decimal point
                value = value.replace(/[^0-9.]/g, "");

                // Limit to 2 decimal places
                if (value.includes(".")) {
                  const parts = value.split(".");
                  if (parts[1].length > 2) {
                    value = `${parts[0]}.${parts[1].slice(0, 2)}`;
                  }
                }

                // Convert value to a number and apply constraints
                let numericValue = parseFloat(value);

                if (numericValue > 100) {
                  value = "100";
                }

                setSlippage(value);
              }}
            />
            <span className="px-2 text-white/60">%</span>
          </div>
        </div>

        <button
          onClick={handleOnSave}
          className={`block rounded px-5 py-3 border border-white hover:opacity-60 bg-black transition w-full`}
        >
          save settings
        </button>
      </div>
    </div>
  );
};

export default AssetList;
