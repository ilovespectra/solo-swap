import { QuoteResponse, SwapInstructionsResponse } from "@jup-ag/api";
import { TokenBalance } from "../../scooper";

export class AssetState {
  asset: TokenBalance;
  quote?: QuoteResponse;
  swap?: SwapInstructionsResponse;
  checked?: boolean;
  transactionState?: string;
  transactionId?: string;

  constructor(
    assetArg: TokenBalance,
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

export {};