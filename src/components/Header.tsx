import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const Header = () => {
  return (
    <header className="relative flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-0">
      <img src={`/images/solo_logo.png`} alt="solo logo" width={300} />

      <div className="flex items-center space-x-4">
       
        
        <div className="relative group">
          <a href="https://github.com/ilovespectra/solo-swap" target="_blank" rel="noopener noreferrer">
            <img
              src="/images/github.png"
              alt="github"
              width={40}
              height={40}
              className="transition-transform duration-200 transform group-hover:scale-110"
            />
          </a>
          <span className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-sm px-2 py-1 rounded">
            view on github
          </span>
        </div>
        <WalletMultiButton />
      </div>
    </header>
  );
};

export default Header;
