# solo swap

_this is a rewrap of the [bonk pooper scooper](https://github.com/BonkLabs/pooperscooper). WIP_

solo: swap is a pro-rata token swapper utilizing jupiter agrigators- allowing the user to swap from the total value of selected tokens without impacting allocation. this allows you to sell a bit of selected assets relative to the ratio of your holdings, keeping your portfolio percentages intact. 

- a basic user interface and usage is implemented in `AssetList.tsx`.
- core logic which performs the application action is in `scooper.ts`

## todo

- [x] remove fees</br>
- [x] remove burn account instruction</br>
- [x] change swapped token to USDC</br>
- [x] complete UI and pro-rata swap function
- [ ] create realms instruction for solo: swap 

### open beta - underway
- [x] go live with mvp
- [ ] implement `$` / `%` alternation in UI
- [ ] enable swapping to any token
- [ ] get feedback
- [ ] improve final iteration
- [ ] close beta

# usage

start the development server:
```
yarn start
```

build artifacts for production deployment:
```
yarn build
```
