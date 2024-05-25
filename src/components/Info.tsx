import { getTotalFee } from "../scooper";

const Info = () => {
  const steps = [
    {
      title: "Wait for assets to load",
      description:
        "Solo Swap will check your wallet for assets that can be swapped and accounts that can be closed and present them in a list below",
      image: `/images/1.png`,
    },
    {
      title: "Select assets for swapping pro rata",
      description:
        "Review the assets in the list and check any assets you would like to swap, then press swap. Or use swap all",
      image: `/images/2.png`,
    },
    {
      title: "Review summary",
      description:
        "Make sure only assets you want to swap are shown in the Summary. Press confirm and then sign the transaction if you are satisfied",
      image: `/images/3.png`,
    },
    {
      title: "Solo Swap swaps",
      description:
        "Solo Swap will now issue the transactions for each asset to be swapped and let you know when the process is complete.",
      image: `/images/4.png`,
    },
  ];

  return (
    <section className="bg-[#000000] text-white rounded-3xl relative px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16 mb-4 shadow-[-10px_10px_20px_5px_rgba(0,0,0,0.4)] z-20 border border-white">
      <div className="max-w-screen-xl">
        <div className="max-w-xl">
          <h2 className="lowercase text-3xl font-black sm:text-6xl uppercase">
            Solo Swap [coming soon]
          </h2>
          <p><i>don't use yet! it will swap 100% of your selected assets for usdc</i></p>
          <p className="lowercase mt-4 font-semibold tracking-wide">
            In a pro rata swap, each asset represents the same portion as in your portfolio.
            Swap selected assets into $USDC via
             <a href="https://jup.ag/"> <u>Jupiter swaps.</u></a> <br/>
             {/* <br/> */}
            {/* <i>A {getTotalFee().toLocaleString()}% fee is currently taken from all swaps.</i> */}
          </p>
        </div>

        <div className="lowercase mt-8 grid grid-cols-1 gap-4 md:mt-16 md:grid-cols-2 md:gap-12">
          {steps.map((step, index) => {
            const { title, description, image } = step;
            return (
              <div className="lowercase flex items-start gap-4">
                {/* <span className="shrink-0 rounded-lg bg-[#FC8E03] p-4 text-center">
                  <p className="h-5 w-5 font-black text-3xl">{index + 1}</p>
                </span> */}
                <img src={image} alt="" width={50} />

                <div>
                  <h2 className="lowercase text-xl sm:text-3xl font-black uppercase">
                    {title}
                  </h2>

                  <p className="lowercase mt-1 text-sm text-gray-600 font-semibold tracking-wide">
                    {description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Info;

