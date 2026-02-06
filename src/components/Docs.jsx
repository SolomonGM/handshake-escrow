import DocsLayout from "./docs/DocsLayout";
import { currencyFlags } from "../assets/currencies";

const sections = [
  { label: "What is Handshake?", href: "#what-is-handshake" },
  { label: "Core features", href: "#core-features" },
  { label: "Supported assets", href: "#supported-assets" },
];

const coreFeatures = [
  {
    title: "Live Trade Hub",
    text: "Browse requests, filter by asset, and open tickets directly from listings.",
  },
  {
    title: "Automated escrow bot",
    text: "The bot handles role selection, confirmations, and release prompts.",
  },
  {
    title: "Ticket-first communication",
    text: "Everything stays inside a ticket so the trade history is consistent.",
  },
  {
    title: "On-chain visibility",
    text: "Transactions are paired with explorer references and clear status updates.",
  },
];

const supportedAssets = [
  {
    name: "Bitcoin",
    symbol: "BTC",
    network: "Native",
    icon: currencyFlags.btc,
  },
  {
    name: "Ethereum",
    symbol: "ETH",
    network: "Native",
    icon: currencyFlags.eth,
  },
  {
    name: "Litecoin",
    symbol: "LTC",
    network: "Native",
    icon: currencyFlags.ltc,
  },
  {
    name: "Solana",
    symbol: "SOL",
    network: "Native",
    icon: currencyFlags.sol,
  },
  {
    name: "USDT",
    symbol: "USDT",
    network: "ERC-20",
    icon: currencyFlags.usdt,
  },
];

const Docs = () => {
  return (
    <DocsLayout
      pageTitle="Overview"
      pageIntro="Start here to understand Handshake, the core platform features, and the assets you can trade today."
      sections={sections}
    >
      <section id="what-is-handshake" className="scroll-mt-[8rem]">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="rounded-2xl border border-n-6 bg-n-7/60 p-6 md:p-8">
            <h3 className="h5 mb-3">What is Handshake?</h3>
            <p className="body-2 text-n-3">
              Handshake is a peer-to-peer crypto exchange powered by trade tickets and an
              automated escrow bot. Each ticket keeps both sides aligned on roles, amounts, and
              release steps so trades stay transparent and verifiable.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="rounded-full border border-n-6 bg-n-8/70 px-3 py-1 text-xs text-n-2">
                Escrow automation
              </span>
              <span className="rounded-full border border-n-6 bg-n-8/70 px-3 py-1 text-xs text-n-2">
                Real-time updates
              </span>
              <span className="rounded-full border border-n-6 bg-n-8/70 px-3 py-1 text-xs text-n-2">
                Secure chat
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-n-6 bg-n-8/80 p-6">
            <div className="absolute -top-16 -right-10 h-32 w-32 rounded-full bg-[#10B981]/20 blur-2xl" />
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-n-4">Core idea</p>
            <p className="mt-3 text-sm text-n-3">
              Tickets keep proof, confirmations, and status updates in one place, so every step is
              traceable.
            </p>
          </div>
        </div>
      </section>

      <section id="core-features" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">Core features</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {coreFeatures.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-n-6 bg-n-7/60 p-5 transition-all hover:-translate-y-1 hover:border-[#10B981]/40"
            >
              <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#10B981]/10 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
              <p className="text-sm font-semibold text-n-1">{feature.title}</p>
              <p className="text-sm text-n-4 mt-2">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="supported-assets" className="scroll-mt-[8rem]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="h4">Supported assets</h3>
          <span className="text-xs text-n-4">More assets roll out regularly.</span>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {supportedAssets.map((asset) => (
            <div
              key={asset.symbol}
              className="group rounded-2xl bg-gradient-to-br from-[#10B981]/30 via-transparent to-color-1/30 p-[1px]"
            >
              <div className="flex h-full items-center gap-4 rounded-2xl border border-n-6 bg-n-8/90 p-5 transition-all group-hover:-translate-y-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-n-6 bg-n-7/80">
                  <img src={asset.icon} alt={asset.name} className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-n-1">{asset.name}</p>
                  <p className="text-xs text-n-4">
                    {asset.symbol} - {asset.network}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </DocsLayout>
  );
};

export default Docs;

