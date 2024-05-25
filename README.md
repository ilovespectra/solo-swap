# DONT USE YET!!!

it will swap 100% of your selected assets for usdc

# solo swap

this is a rewrap of the [bonk pooper scooper](https://github.com/BonkLabs/pooperscooper). WIP

end goal:

pro rata swapper- allowing the user to select tokens from their account they wish to include for a calculation where each token will represent the same allocation as within your portfolio. this allows you to sell a bit of everything, relative to the ratio of your holdings, keeping your portfolio percentages intact. solo explorer will impose a very small fee, however will remain open source. 

# Pooper Scooper

Solana web3 dapp that allows users to "clean" shit tokens out of their wallet and convert it all to bonk

A basic user interface and usage is implemented in `AssetList.tsx`.

The core logic which performs the application action is in `scooper.ts`

# Usage

Start the development server:
```
yarn start
```

Build artifacts for production deployment:
```
yarn build
```

# TODO

   1(Optional) Implement referrer mechanism _or_ add another instruction to take a referral fee
   2 _fix UI.........._