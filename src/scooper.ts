import {
  Connection,
  GetProgramAccountsFilter,
  VersionedTransaction,
  sendAndConfirmRawTransaction,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  AddressLookupTableAccount,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  createHarvestWithheldTokensToMintInstruction,
  createBurnInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  transferChecked,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { Buffer } from "buffer";
import { SwapInstructionsResponse, DefaultApi, QuoteResponse } from "@jup-ag/api";

import { QuoteGetRequest, SwapPostRequest, createJupiterApiClient } from "@jup-ag/api";

interface TokenInfo {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string;
  tags: string[];
  strict?: boolean;
}

interface Asset {
  asset: TokenBalance;
  quote?: QuoteResponse;
  swap?: SwapInstructionsResponse;
  checked?: boolean;
}

interface TokenBalance {
  token: TokenInfo;
  balance: bigint;
  programId: PublicKey;
  ataId: PublicKey;
}

const USDC_TOKEN_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const liquidStableTokens = ["mSOL", "JitoSOL", "bSOL", "mrgnLST", "jSOL", "stSOL", "scnSOL", "LST"];
export const forbiddenTokens = ["USDC", "USDT"].concat(liquidStableTokens);

/**
 * Get the total fee amount
 */
function getTotalFee(): number {
  let totalFee = 0.0;
  return totalFee;
}

/**
 * Returns the expected outputs of burning an asset
 *
 * @param asset The asset to calculate returns for
 * @returns Object containing information about return/fees
 */
function getAssetBurnReturn(asset: Asset): {
  burnAmount: bigint;
  bonkAmount: bigint;
  lamportsAmount: bigint;
  feeAmount: bigint;
} {
  var burnAmount: bigint;
  var bonkAmount: bigint;
  var lamportsAmount: bigint;

  if (asset.quote) {
    burnAmount = asset.asset.balance - BigInt(asset.quote.inAmount);
    bonkAmount = BigInt(asset.quote.outAmount);
    if (asset.asset.programId == TOKEN_2022_PROGRAM_ID) {
      lamportsAmount = BigInt(0);
    } else {
      lamportsAmount = BigInt(2400000);
    }
  } else {
    burnAmount = asset.asset.balance;
    bonkAmount = BigInt(0);
    lamportsAmount = BigInt(2400000);
  }

  let feeAmount = BigInt(0);

  return {
    burnAmount: burnAmount,
    bonkAmount: bonkAmount,
    lamportsAmount: lamportsAmount,
    feeAmount: feeAmount,
  };
}

/**
 * Gets token accounts including standard and token22 accounts
 *
 * Returns a list of all token accounts which match a "known" token in tokenList
 *
 * @param wallet - The users public key as a string
 * @param connection - The connection to use
 * @param tokenList - List of all known tokens
 * @returns A List of TokenBalances containing information about tokens held by the user and their balances
 */
async function getTokenAccounts(
  wallet: string,
  connection: Connection,
  tokenList: { [id: string]: TokenInfo }
): Promise<TokenBalance[]> {
  const filters: GetProgramAccountsFilter[] = [
    {
      dataSize: 165,
    },
    {
      memcmp: {
        offset: 32,
        bytes: wallet,
      },
    },
  ];
  const accountsOld = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: filters,
  });
  const filtersNew: GetProgramAccountsFilter[] = [
    {
      dataSize: 182,
    },
    {
      memcmp: {
        offset: 32,
        bytes: wallet,
      },
    },
  ];
  const accountsNew = await connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    filters: filtersNew,
  });

  console.log(`Found ${accountsNew.length} token account(s) for wallet ${wallet}.`);
  var tokens: TokenBalance[] = [];

  accountsOld.forEach((account, i) => {
    console.log(account);
    const parsedAccountInfo: any = account.account.data;
    const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
    if (tokenList[mintAddress] && !forbiddenTokens.includes(tokenList[mintAddress].symbol)) {
      tokens.push({
        token: tokenList[mintAddress],
        balance: BigInt(parsedAccountInfo["parsed"]["info"]["tokenAmount"]["amount"]),
        programId: TOKEN_PROGRAM_ID,
        ataId: account.pubkey,
      });
    }
  });
  accountsNew.forEach((account, i) => {
    console.log(account);
    const parsedAccountInfo: any = account.account.data;
    const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
    if (tokenList[mintAddress]) {
      tokens.push({
        token: tokenList[mintAddress],
        balance: BigInt(parsedAccountInfo["parsed"]["info"]["tokenAmount"]["amount"]),
        programId: TOKEN_2022_PROGRAM_ID,
        ataId: account.pubkey,
      });
    }
  });

  return tokens;
}

const deserializeInstruction = (instruction: any) => {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key: any) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
};

async function getAddressLookupTableAccounts(
  connection: Connection,
  keys: string[]
): Promise<AddressLookupTableAccount[]> {
  const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
    keys.map((key) => new PublicKey(key))
  );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
}

/**
 * Builds a transaction which includes:
 *  Swap instruction + supporting instructions if a swap is present
 *  Burn Tokens/Harvest witheld to mint if a swap is using token 2022 standard
 *  Close account instruction
 *
 * Note that this function can be slow as it must `getAddressLookupTableAccounts` which involves fetching on chain data
 *
 * @param wallet - The users public key as a string
 * @param connection - The connection to use
 * @param blockhash - Recent blockhash to use in making transaction
 * @param asset - The asset to build a transaction for
 * @returns Transaction if there are any instructions to execute, else null
 */
async function buildBurnTransaction(
  wallet: WalletContextState,
  connection: Connection,
  blockhash: string,
  asset: Asset
): Promise<VersionedTransaction | null> {
  if (asset.checked && wallet.publicKey) {
    var instructions: TransactionInstruction[] = [];
    var lookup = undefined;
    if (asset.swap) {
      console.log(asset.swap);
      asset.swap.computeBudgetInstructions.forEach((computeIx) => {
        if (!asset.swap) {
          return;
        }
        instructions.push(deserializeInstruction(computeIx));
      });

      asset.swap.setupInstructions.forEach((setupIx) => {
        if (!asset.swap) {
          return;
        }
        instructions.push(deserializeInstruction(setupIx));
      });

      instructions.push(deserializeInstruction(asset.swap.swapInstruction));

      const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

      addressLookupTableAccounts.push(
        ...(await getAddressLookupTableAccounts(connection, asset.swap.addressLookupTableAddresses))
      );
      lookup = addressLookupTableAccounts;
    }

    // let burnAmount;

    console.log(instructions);
    if (instructions.length > 0) {
      const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: instructions,
      }).compileToV0Message(lookup);
      const tx = new VersionedTransaction(message);
      console.log("created transaction");
      console.log(tx);
      return tx;
    }
  }
  return null;
}

/**
 * Sweeps a set of assets, signing and executing a set of previously determined transactions to swap them into the target currency
 *
 * @param wallet - The users public key as a string
 * @param connection - The connection to use
 * @param assets - List of the assets to be swept
 * @param transactionStateCallback - Callback to notify as a transactions state updates
 * @param transactionIdCallback - Callback to notify when a transaction has an ID
 * @param transactionIdCallback - Callback to notify on errors
 * @returns void Promise, promise returns when all actions complete
 */
async function sweepTokens(
  wallet: WalletContextState,
  connection: Connection,
  assets: Asset[],
  quoteApi: DefaultApi,
  outputMint: string,
  percentage: number,
  transactionStateCallback: (id: string, state: string) => void,
  transactionIdCallback: (id: string, txid: string) => void,
  errorCallback: (id: string, error: any) => void
): Promise<void> {
  const transactions: [string, VersionedTransaction][] = [];
  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  await Promise.allSettled(
    assets.map(async (asset) => {
      if (!asset.checked) {
        return;
      }
      const quoteRequest: QuoteGetRequest = {
        inputMint: asset.asset.token.address,
        outputMint: outputMint,
        amount: Math.floor((Number(asset.asset.balance) / 100) * percentage), // Casting this to number can discard precision...
        slippageBps: 1500,
      };
      const quote = await quoteApi.quoteGet(quoteRequest);
      console.log("quote:", quote);

      const rq: SwapPostRequest = {
        swapRequest: {
          userPublicKey: wallet.publicKey!.toBase58(),
          quoteResponse: quote,
        },
      };

      // // On production, jupiter api will throw cors error when it's rate limited,
      // // where as on localhost, it will return rate limited.

      // // If you want to fix cors error, you have to use a proxy like heroku,
      // // but it will just change the error message to rate limited since you are using the free api.

      // // You can test it by using the cors proxy code below.

      // // uncomment this block if you want to use cors proxy.
      // // proxy to avoid cors issues temporarily on localhost.
      // // visit https://cors-anywhere.herokuapp.com/corsdemo to enable temporary access
      // const corsProxy = "https://cors-anywhere.herokuapp.com/";
      // const swapUrl = "https://quote-api.jup.ag/v6/swap";
      // const url = corsProxy + swapUrl;
      // const swapRes = await fetch(url, {
      //   method: "POST",
      //   cache: "reload",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify(rq.swapRequest),
      // });
      // const swap = await swapRes.json();

      // comment the line below if you want to use cors proxy.
      const swap = await quoteApi.swapInstructionsPost(rq);
      console.log("swap:", swap);

      const tx = await buildBurnTransaction(wallet, connection, blockhash, {
        ...asset,
        swap: swap,
      });
      if (tx) {
        transactions.push([asset.asset.token.address, tx]);
      }
    })
  );

  console.log("transactions");
  console.log(transactions);

  if (wallet.signAllTransactions) {
    const signedTransactions = await wallet.signAllTransactions(
      transactions.map(([id, transaction]) => transaction)
    );

    console.log("signed transactions:");
    console.log(signedTransactions);
    console.log(transactions);

    await Promise.all(
      signedTransactions.map(async (transaction, i) => {
        const assetId = transactions[i][0];
        transactionStateCallback(assetId, "swapping");

        try {
          const result = await sendAndConfirmRawTransaction(
            connection,
            Buffer.from(transaction.serialize()),
            {}
          );
          console.log("transaction success!");
          transactionStateCallback(assetId, "swapped");
          transactionIdCallback(assetId, result);
        } catch (err) {
          console.log("transaction failed!");
          console.log(err);
          transactionStateCallback(assetId, "error");
          errorCallback(assetId, err);
        }
      })
    );
  }
}

/**
 * Get quotes and transaction data to swap input currencies into output currency
 *
 * @param connection - The connection to use
 * @param tokens - The tokens to seek quotes for
 * @param outputMint - The Mint for the output currency
 * @param walletAddress - Callback to notify when a transaction has an ID
 * @param quoteApi - Users wallet address
 * @param foundAssetCallback - Callback to notify when an asset held by the user has been found
 * @param foundQuoteCallback - Callback to notify when a quote for the user asset has been found
 * @param foundSwapCallback - Callback to notify when the swap transaction details for the user asset has been found
 * @param errorCallback - Callback to notify on errors
 * @returns void Promise, promise returns when all actions complete
 */
async function findQuotes(
  connection: Connection,
  tokens: { [id: string]: TokenInfo },
  outputMint: string,
  walletAddress: string,
  quoteApi: DefaultApi,
  percentage: number,
  foundAssetCallback: (id: string, asset: TokenBalance) => void,
  foundQuoteCallback: (id: string, quote: QuoteResponse) => void,
  foundSwapCallback: (id: string, swap: SwapInstructionsResponse) => void,
  errorCallback: (id: string, err: string) => void
): Promise<void> {
  const assets = await getTokenAccounts(walletAddress, connection, tokens);

  await Promise.allSettled(
    assets.map(async (asset) => {
      // Skip assets with no balance
      if (asset.balance == 0n) {
        return;
      }
      console.log("found asset");
      console.log(asset);

      const quoteRequest: QuoteGetRequest = {
        inputMint: asset.token.address,
        outputMint: outputMint,
        amount: Math.floor(Number(asset.balance)), // Casting this to number can discard precision...
        slippageBps: 1500,
      };

      console.log(`quote request`, quoteRequest);

      try {
        const quote = await quoteApi.quoteGet(quoteRequest);
        // add asset to list of assets only if quote is found
        foundAssetCallback(asset.token.address, asset);
        foundQuoteCallback(asset.token.address, quote);

        // // disable swap api since it's not needed before scooping
        // const rq: SwapPostRequest = {
        //   swapRequest: {
        //     userPublicKey: walletAddress,
        //     quoteResponse: quote,
        //   },
        // };

        // try {
        //   const swap = await quoteApi.swapInstructionsPost(rq);
        //   foundSwapCallback(asset.token.address, swap);
        // } catch (swapErr) {
        //   console.log(`Failed to get swap for ${asset.token.symbol}`);
        //   console.log(swapErr);
        //   errorCallback(asset.token.address, "Couldn't get swap transaction");
        // }
      } catch (quoteErr) {
        console.log(`failed to get quote for ${asset.token.symbol}`);
        console.log(quoteErr);
        errorCallback(asset.token.address, "couldn't get quote");
      }
    })
  );
}

/**
 * Load Jupyter API and tokens
 *
 * @returns [instance of Jupiter API, map of known token types by mint address]
 */
async function loadJupyterApi(): Promise<
  [DefaultApi, { [id: string]: TokenInfo }, { [id: string]: TokenInfo }]
> {
  const ENDPOINT = process.env.NEXT_PUBLIC_QUICKNODE_API;
  const CONFIG = {
    basePath: ENDPOINT,
  };
  let quoteApi = createJupiterApiClient(CONFIG);

  // let quoteApi = createJupiterApiClient();
  const allTokens = await fetch("https://tokens.jup.ag/tokens");
  const allList = await allTokens.json();
  const tokenMap: { [id: string]: TokenInfo } = {};
  const verifiedTokenMap: { [id: string]: TokenInfo } = {};
  allList.forEach((token: TokenInfo) => {
    tokenMap[token.address] = token;
    if (tokenMap[token.address]?.tags.includes("verified")) {
      verifiedTokenMap[token.address] = token;
    }
  });

  // const strictTokens = await fetch("https://token.jup.ag/strict");
  // const strictList = await strictTokens.json();
  // strictList.forEach((token: TokenInfo) => {
  //   tokenMap[token.address].strict = true;
  // });

  return [quoteApi, tokenMap, verifiedTokenMap];
}

async function buildTransferTransaction(
  wallet: WalletContextState,
  blockhash: string,
  asset: Asset,
  amount: number,
  sendToWallet: string
): Promise<VersionedTransaction | null> {
  if (asset.checked && wallet.publicKey) {
    const tokenPubkey = new PublicKey(asset.asset.token.address);
    const fromPubkey = wallet.publicKey;
    const toPubkey = new PublicKey(sendToWallet);
    let instructions: TransactionInstruction[] = [];

    // get sender and recipient token account
    const fromATA = getAssociatedTokenAddressSync(
      tokenPubkey,
      wallet.publicKey,
      false,
      asset.asset.programId
    );
    console.log("fromATA:", fromATA.toBase58());

    const toATA = getAssociatedTokenAddressSync(
      tokenPubkey,
      toPubkey,
      false,
      asset.asset.programId
    );
    console.log("toATA:", toATA.toBase58());

    // add create token account instruction
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        toATA,
        toPubkey,
        tokenPubkey,
        asset.asset.programId
      )
    );

    // add spl transfer instruction
    instructions.push(
      createTransferCheckedInstruction(
        fromATA,
        tokenPubkey,
        toATA,
        fromPubkey,
        amount,
        asset.asset.token.decimals,
        [],
        asset.asset.programId
      )
    );

    console.log(instructions);
    if (instructions.length > 0) {
      const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: instructions,
      }).compileToV0Message();
      const tx = new VersionedTransaction(message);
      console.log("created transaction");
      console.log(tx);
      return tx;
    }
  }
  return null;
}

async function sendTokens(
  wallet: WalletContextState,
  sendToWallet: string,
  connection: Connection,
  assets: Asset[],
  percentage: number,
  transactionStateCallback: (id: string, state: string) => void,
  transactionIdCallback: (id: string, txid: string) => void,
  errorCallback: (id: string, error: any) => void
): Promise<void> {
  console.log("sendToWallet:", sendToWallet);
  const transactions: [string, VersionedTransaction][] = [];
  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  await Promise.allSettled(
    assets.map(async (asset) => {
      const amount = Math.floor((Number(asset.asset.balance) / 100) * percentage);
      const tx = await buildTransferTransaction(wallet, blockhash, asset, amount, sendToWallet);
      if (tx) {
        transactions.push([asset.asset.token.address, tx]);
      }
    })
  );

  console.log("transactions");
  console.log(transactions);

  if (wallet.signAllTransactions) {
    const signedTransactions = await wallet.signAllTransactions(
      transactions.map(([id, transaction]) => transaction)
    );

    console.log("signed transactions:");
    console.log(signedTransactions);
    console.log(transactions);

    await Promise.all(
      signedTransactions.map(async (transaction, i) => {
        const assetId = transactions[i][0];
        transactionStateCallback(assetId, "sending");

        try {
          const result = await sendAndConfirmRawTransaction(
            connection,
            Buffer.from(transaction.serialize()),
            {}
          );
          console.log("transaction success!");
          transactionStateCallback(assetId, "sent");
          transactionIdCallback(assetId, result);
        } catch (err) {
          console.log("transaction failed!");
          console.log(err);
          transactionStateCallback(assetId, "Error");
          errorCallback(assetId, err);
        }
      })
    );
  }
}

export {
  getTokenAccounts,
  getAssetBurnReturn,
  sweepTokens,
  findQuotes,
  loadJupyterApi,
  getTotalFee,
  sendTokens,
  USDC_TOKEN_MINT,
};
export type { TokenInfo, TokenBalance };
