import DocsLayout from "./DocsLayout";
import { passes } from "../../constants";

const sections = [
  { label: "Fee overview", href: "#fee-overview" },
  { label: "Fee credits", href: "#passes" },
  { label: "When fees apply", href: "#fee-application" },
];

const feeCards = [
  {
    title: "Platform fee",
    text: "$50-$999.99: 1.5% with a $1.50 minimum. $1,000-$9,999.99: 1% with a $15 minimum.",
  },
  {
    title: "Network fee",
    text: "Standard blockchain fees required to confirm on-chain transactions.",
  },
  {
    title: "High-value fee",
    text: "$10,000 and above: 0.65% with a $100 minimum. The minimum protected trade is $50.",
  },
];

const feeMoments = [
  "Before a ticket is confirmed, you will see any fee prompts in the bot message.",
  "Credits are applied after both parties agree the deal amount and before funds move into escrow.",
  "Network fees vary by chain and are outside platform control.",
];

const DocsFees = () => {
  return (
    <DocsLayout
      pageTitle="Fees and Handshake Credits"
      pageIntro="Understand value-based protection fees, what prepaid credits cover, and when costs appear during a trade."
      sections={sections}
    >
      <section id="fee-overview" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">Fee overview</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {feeCards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-n-6 bg-n-7/60 p-5 transition-all hover:-translate-y-1 hover:border-[#10B981]/40"
            >
              <p className="text-sm font-semibold text-n-1">{card.title}</p>
              <p className="text-sm text-n-4 mt-2">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="passes" className="scroll-mt-[8rem]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="h4">Handshake Credits</h3>
          <a
            href="/passes/purchase"
            className="rounded-full border border-n-6 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-n-1 transition-colors hover:border-[#10B981] hover:text-[#10B981]"
          >
            View credits
          </a>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {passes.map((pass) => (
            <div
              key={pass.id}
              className="group rounded-2xl bg-gradient-to-br from-[#10B981]/35 via-transparent to-color-1/30 p-[1px]"
            >
              <div className="h-full rounded-2xl border border-n-6 bg-n-8/90 p-6 transition-all group-hover:-translate-y-1">
                <p className="text-xs uppercase tracking-[0.25em] text-n-4">{pass.passCount}</p>
                <p className="text-xl font-semibold text-n-1 mt-2">{pass.title}</p>
                <p className="text-sm text-n-4 mt-1">{pass.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="fee-application" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">When fees apply</h3>
        <div className="rounded-2xl border border-n-6 bg-n-7/60 p-6 md:p-8">
          <ul className="space-y-3 text-sm text-n-3">
            {feeMoments.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#10B981]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </DocsLayout>
  );
};

export default DocsFees;
