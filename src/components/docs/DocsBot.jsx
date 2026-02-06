import DocsLayout from "./DocsLayout";

const sections = [
  { label: "Buyer walkthrough", href: "#buyer-walkthrough" },
  { label: "Seller walkthrough", href: "#seller-walkthrough" },
  { label: "Known scams", href: "#known-scams" },
];

const buyerSteps = [
  "Open a ticket in Trade Hub and agree on the asset, amount, and price.",
  "Follow the bot prompts to confirm your role and the deal amount.",
  "Send fiat payment using the agreed method and share proof in the ticket.",
  "Wait for confirmation, then approve release once payment is verified.",
];

const sellerSteps = [
  "Create or accept a ticket and confirm your seller role with the bot.",
  "Deposit the crypto amount shown by the bot into escrow.",
  "Verify the buyer payment before confirming release.",
  "Approve release only after the payment is final and verified.",
];

const knownScams = [
  "Requests to move the trade off-platform or into private chats.",
  "Pressure to release before payment is final or fully verified.",
  "Fake payment screenshots or edited transfer confirmations.",
  "New wallet address requests after the bot already confirmed one.",
];

const DocsBot = () => {
  return (
    <DocsLayout
      pageTitle="Dealing with the Bot"
      pageIntro="The escrow bot keeps every trade structured. Use these walkthroughs to follow the right prompts and avoid common pitfalls."
      sections={sections}
    >
      <section id="buyer-walkthrough" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">Buyer walkthrough</h3>
        <div className="rounded-2xl border border-n-6 bg-n-7/60 p-6 md:p-8">
          <ol className="space-y-4">
            {buyerSteps.map((step, index) => (
              <li key={step} className="flex gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-n-6 bg-n-8 text-xs font-semibold text-[#10B981]">
                  {index + 1}
                </div>
                <p className="text-sm text-n-3">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="seller-walkthrough" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">Seller walkthrough</h3>
        <div className="rounded-2xl border border-n-6 bg-n-7/60 p-6 md:p-8">
          <ol className="space-y-4">
            {sellerSteps.map((step, index) => (
              <li key={step} className="flex gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-n-6 bg-n-8 text-xs font-semibold text-[#10B981]">
                  {index + 1}
                </div>
                <p className="text-sm text-n-3">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="known-scams" className="scroll-mt-[8rem]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="h4">Known scams to avoid</h3>
          <span className="text-xs text-n-4">If something feels off, pause and contact support.</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {knownScams.map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-n-6 bg-n-7/60 p-5 transition-all hover:border-[#10B981]/40"
            >
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#10B981]" />
                <p className="text-sm text-n-3">{item}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-n-6 bg-n-8/80 p-5">
          <p className="text-sm font-semibold text-n-1">Bot safety tip</p>
          <p className="text-sm text-n-4 mt-2">
            Only act on instructions posted by the bot inside the ticket. If you are unsure, ask
            support to review the ticket before releasing funds.
          </p>
        </div>
      </section>
    </DocsLayout>
  );
};

export default DocsBot;
