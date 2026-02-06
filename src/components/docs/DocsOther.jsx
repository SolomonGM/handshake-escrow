import DocsLayout from "./DocsLayout";

const sections = [
  { label: "Security and privacy", href: "#security" },
  { label: "Verification", href: "#verification" },
  { label: "Support", href: "#support" },
  { label: "Account safety", href: "#account-safety" },
];

const DocsOther = () => {
  return (
    <DocsLayout
      pageTitle="Other Information"
      pageIntro="Reference details for security, verification, and staying safe while you trade."
      sections={sections}
    >
      <section id="security" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">Security and privacy</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              title: "Escrow protections",
              text: "Funds move only through bot-verified steps, reducing off-platform risk.",
            },
            {
              title: "Ticket audit trail",
              text: "All confirmations and proof stay inside the ticket for transparency.",
            },
            {
              title: "Encrypted access",
              text: "Account sessions and token-based access protect your trade data.",
            },
            {
              title: "Private by design",
              text: "Only ticket participants and the bot can see trade details.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-n-6 bg-n-7/60 p-5 transition-all hover:-translate-y-1 hover:border-[#10B981]/40"
            >
              <p className="text-sm font-semibold text-n-1">{item.title}</p>
              <p className="text-sm text-n-4 mt-2">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="verification" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">Verification</h3>
        <div className="rounded-2xl border border-n-6 bg-n-7/60 p-6 md:p-8">
          <p className="text-sm text-n-3">
            Each ticket includes explorer references to confirm deposits and releases. Compare the
            address and amount in the ticket with the explorer before moving to the next step.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-n-4">
            <span className="rounded-full border border-n-6 bg-n-8/80 px-3 py-1">
              Etherscan
            </span>
            <span className="rounded-full border border-n-6 bg-n-8/80 px-3 py-1">
              Polygonscan
            </span>
            <span className="rounded-full border border-n-6 bg-n-8/80 px-3 py-1">
              Solscan
            </span>
            <span className="rounded-full border border-n-6 bg-n-8/80 px-3 py-1">
              XRPScan
            </span>
          </div>
        </div>
      </section>

      <section id="support" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">Support</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-n-6 bg-n-7/60 p-6">
            <p className="text-sm font-semibold text-n-1">Get help fast</p>
            <p className="text-sm text-n-4 mt-2">
              Use the support page for disputes, payment verification questions, or urgent
              ticket reviews.
            </p>
            <a
              href="/support"
              className="mt-4 inline-flex rounded-lg border border-n-6 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-n-1 transition-colors hover:border-[#10B981] hover:text-[#10B981]"
            >
              Visit support
            </a>
          </div>
          <div className="rounded-2xl border border-n-6 bg-n-8/80 p-6">
            <p className="text-sm font-semibold text-n-1">Community updates</p>
            <p className="text-sm text-n-4 mt-2">
              Join official community channels for announcements, maintenance notices, and
              feature updates.
            </p>
          </div>
        </div>
      </section>

      <section id="account-safety" className="scroll-mt-[8rem]">
        <h3 className="h4 mb-6">Account safety</h3>
        <div className="rounded-2xl border border-n-6 bg-n-7/60 p-6 md:p-8">
          <ul className="space-y-3 text-sm text-n-3">
            {[
              "Use unique passwords and keep your recovery details secure.",
              "Never share API keys or token links outside the platform.",
              "Confirm login alerts and review active sessions regularly.",
              "Report suspicious activity to support immediately.",
            ].map((item) => (
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

export default DocsOther;
