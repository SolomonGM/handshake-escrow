import DocsLayout from "./DocsLayout";
import { currencyFlags } from "../../assets/currencies";

const termsSections = [
  {
    id: "user-responsibility",
    number: "1",
    title: "User Responsibility",
    lead: "While using this service, it is your responsibility to:",
    bullets: [
      "Carefully read and acknowledge all prompts provided by the bot.",
      "Ensure transaction details (network, address, and amounts) are correct.",
      "Maintain the security of your account and devices.",
    ],
    footer:
      "We are not liable for losses caused by user error or compromised accounts. Mistakes can result in permanent loss of digital assets.",
  },
  {
    id: "service-safety",
    number: "2",
    title: "Service Safety",
    lead:
      "We reserve the right to decline any request that appears suspicious or violates our policies.",
    bullets: [
      "High-risk activity may trigger additional verification steps.",
      "Support can pause a ticket to protect both parties.",
    ],
    footer:
      "Keeping all communication inside the ticket helps the bot keep trades safe.",
  },
  {
    id: "transaction-accuracy",
    number: "3",
    title: "Transaction Accuracy",
    lead:
      "Users must ensure the payment address and network match the bot invoice. Any transaction sent:",
    bullets: [
      "On the wrong network.",
      "After a deal is marked complete.",
      "In multiple parts to a single address.",
    ],
    footer:
      "Only one transaction is allowed per address. Errors may result in permanent loss of funds.",
  },
  {
    id: "fee-bypassing",
    number: "4",
    title: "Fee Bypassing",
    lead: "Splitting transactions to avoid fees is strictly prohibited.",
    bullets: [
      "Violations may result in immediate bans or penalties.",
      "Service fees keep escrow, support, and monitoring operational.",
    ],
  },
  {
    id: "user-guarantee",
    number: "5",
    title: "User Guarantee",
    lead: "Handshake does not guarantee profits or the outcome of a trade.",
    bullets: [
      "We do not insure off-platform transfers or external wallets.",
      "You are responsible for verifying the counterparty before release.",
    ],
    footer: "Use the ticket history as the single source of truth.",
  },
  {
    id: "dispute-resolution",
    number: "6",
    title: "Dispute Resolution",
    lead:
      "If a dispute occurs, stop the release and document evidence inside the ticket.",
    bullets: [
      "Attach payment proof and relevant screenshots.",
      "Contact support with the ticket ID and a short summary.",
      "Follow the resolution steps provided by the support team.",
    ],
    footer:
      "Dispute outcomes are based on ticket evidence and on-chain confirmations.",
  },
  {
    id: "deal-cancellations",
    number: "7",
    title: "Deal Cancellations",
    lead: "Tickets can be cancelled before funds move into escrow.",
    bullets: [
      "After a deposit, both parties must agree to cancel.",
      "Repeated cancellations may be reviewed for abuse.",
    ],
    footer: "Do not create duplicate tickets for the same trade.",
  },
  {
    id: "warranties",
    number: "8",
    title: "Warranties",
    lead: "The service is provided as-is and as-available.",
    bullets: [
      "We do not guarantee uninterrupted access.",
      "Market conditions can impact transaction timing.",
    ],
    footer: "Using the platform implies acceptance of these limitations.",
  },
];

const sections = [
  { label: "1. User Responsibility", href: "#user-responsibility" },
  { label: "2. Service Safety", href: "#service-safety" },
  { label: "3. Transaction Accuracy", href: "#transaction-accuracy" },
  { label: "4. Fee Bypassing", href: "#fee-bypassing" },
  { label: "5. User Guarantee", href: "#user-guarantee" },
  { label: "6. Dispute Resolution", href: "#dispute-resolution" },
  { label: "7. Deal Cancellations", href: "#deal-cancellations" },
  { label: "8. Warranties", href: "#warranties" },
  { label: "Supported coins", href: "#supported-coins" },
];

const supportedCoins = [
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

const DocsTerms = () => {
  return (
    <DocsLayout
      pageLabel="Overview"
      pageTitle="Terms of Service"
      pageIntro="Read through each section carefully. This summary highlights the core responsibilities and safety rules for trading on Handshake."
      sections={sections}
    >
      <div className="rounded-2xl border border-n-6 bg-n-8/80 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-color-2/20 text-color-2 font-semibold">
            !
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-n-1">Review</p>
            <p className="text-sm text-n-4 mt-1">
              To ensure your safety while using Handshake, read and follow the terms below. This
              is a summary only. Full terms live in the app.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 space-y-10">
        {termsSections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-[8rem]">
            <div className="group rounded-3xl bg-gradient-to-br from-[#10B981]/30 via-transparent to-color-1/25 p-[1px]">
              <div className="relative rounded-3xl border border-n-6 bg-n-8/90 p-6 md:p-8">
                <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-[#10B981]/15 blur-3xl opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-[#10B981]">{section.number}.</span>
                  <h3 className="h4">{section.title}</h3>
                </div>
                {section.lead && (
                  <p className="body-2 text-n-3 mt-4">{section.lead}</p>
                )}
                {section.bullets && (
                  <ul className="mt-4 space-y-2 text-sm text-n-3">
                    {section.bullets.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#10B981]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {section.footer && (
                  <p className="text-sm text-n-4 mt-4">{section.footer}</p>
                )}
              </div>
            </div>
            {index < termsSections.length - 1 && (
              <div className="mt-10 h-px bg-n-6/60" />
            )}
          </section>
        ))}
      </div>

      <section id="supported-coins" className="scroll-mt-[8rem] pt-6">
        <div className="rounded-3xl border border-n-6 bg-n-7/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="h4">Supported coins</h3>
              <p className="text-sm text-n-4 mt-2">
                Each asset is monitored by the escrow bot and verified on-chain.
              </p>
            </div>
            <span className="text-xs text-n-4">New coins roll out as liquidity grows.</span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {supportedCoins.map((coin) => (
              <div
                key={coin.symbol}
                className="group rounded-2xl bg-gradient-to-br from-[#10B981]/35 via-transparent to-color-1/30 p-[1px]"
              >
                <div className="flex h-full items-center gap-4 rounded-2xl border border-n-6 bg-n-8/90 p-5 transition-all group-hover:-translate-y-1">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-n-6 bg-n-7/80">
                    <img src={coin.icon} alt={coin.name} className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-n-1">{coin.name}</p>
                    <p className="text-xs text-n-4">
                      {coin.symbol} - {coin.network}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </DocsLayout>
  );
};

export default DocsTerms;
