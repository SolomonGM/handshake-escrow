import { useLocation } from "react-router-dom";
import Section from "../Section";
import { grid, gradient, handshakeSymbol, searchMd } from "../../assets";

const docsNav = [
  {
    id: "overview",
    title: "Overview",
    description: "What Handshake is, core features, supported assets.",
    href: "/docs",
  },
  {
    id: "bot",
    title: "Dealing with Bot",
    description: "Buyer and seller walkthroughs plus scam alerts.",
    href: "/docs/bot",
  },
  {
    id: "fees",
    title: "Fees and Passes",
    description: "Platform fees, passes, and when they apply.",
    href: "/docs/fees",
  },
  {
    id: "other",
    title: "Other Information",
    description: "Security, verification, and support references.",
    href: "/docs/other",
  },
  {
    id: "terms",
    title: "Terms and Supported Coins",
    description: "Policies plus a visual list of supported coins.",
    href: "/docs/terms",
  },
];

const DocsLayout = ({
  pageTitle,
  pageIntro,
  pageLabel = "Docs section",
  sections = [],
  children,
}) => {
  const { pathname } = useLocation();

  const isActive = (href) => {
    if (href === "/docs") {
      return pathname === "/docs";
    }
    return pathname === href;
  };

  return (
    <Section
      className="pt-[12rem] -mt-[5.25rem] pb-12 flex-1"
      crosses
      crossesOffset="lg:translate-y-[5.25rem]"
      customPaddings
      id="docs"
    >
      <div className="container relative z-2">
        <div className="relative overflow-hidden rounded-[2rem] border border-n-6 bg-n-7/70 px-6 py-8 md:px-10 md:py-10">
          <img
            src={grid}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-soft-light"
          />
          <img
            src={gradient}
            alt=""
            className="absolute -top-40 right-0 h-[30rem] w-[30rem] opacity-20"
          />
          <div className="absolute -top-20 -left-12 h-48 w-48 rounded-full bg-[#10B981]/30 blur-3xl" />
          <div className="absolute -bottom-24 right-20 h-56 w-56 rounded-full bg-color-1/30 blur-3xl" />

          <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="tagline text-color-4">Documentation</p>
              <h1 className="h1 mt-3">Handshake Docs</h1>
              <p className="body-2 text-n-3 mt-4">
                Everything you need to understand the platform, the escrow bot, and how trade
                tickets keep every exchange transparent and safe.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  "Escrow-first",
                  "Ticket-based",
                  "Bot-guided",
                  "On-chain proof",
                ].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-n-6 bg-n-8/70 px-3 py-1 text-xs text-n-2"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-conic-gradient opacity-30 blur-2xl" />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-2xl border border-n-6 bg-n-8/80 md:h-36 md:w-36">
                <div className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.35),transparent_70%)]" />
                <img
                  src={handshakeSymbol}
                  alt="Handshake bot"
                  className="relative h-14 w-14 md:h-16 md:w-16"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-n-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-n-6 bg-n-7/70 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
              <span className="sr-only">Live docs draft</span>
            </span>
            <span className="hidden sm:inline">Last updated: February 2026</span>
          </div>
          <div className="relative w-full md:max-w-md">
            <img
              src={searchMd}
              alt="Search"
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
            />
            <input
              className="w-full rounded-xl border border-n-6 bg-n-7 py-3 pl-11 pr-4 text-n-1 placeholder-n-4 focus:border-[#10B981] focus:outline-none transition-colors"
              placeholder="Search docs (coming soon)"
              readOnly
            />
          </div>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)_240px]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-4">
              {docsNav.map((item) => {
                const active = isActive(item.href);
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    className={`group flex gap-3 rounded-2xl border px-4 py-4 transition-all ${
                      active
                        ? "border-[#10B981]/60 bg-[#10B981]/10"
                        : "border-n-6 bg-n-7/40 hover:border-[#10B981]/40"
                    }`}
                  >
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        active ? "bg-[#10B981]" : "bg-n-5"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-semibold text-n-1">{item.title}</p>
                      <p className="text-xs text-n-4 mt-1">{item.description}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </aside>

          <main className="space-y-12">
            <div className="relative overflow-hidden rounded-2xl border border-n-6 bg-n-7/60 p-6 md:p-8">
              <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-[#10B981]/15 blur-3xl" />
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-n-4">
                {pageLabel}
              </p>
              <h2 className="h3 mt-3">{pageTitle}</h2>
              <p className="body-2 text-n-3 mt-3 max-w-2xl">{pageIntro}</p>
            </div>

            {sections.length > 0 && (
              <div className="lg:hidden">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-n-4">
                  On this page
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {sections.map((link) => (
                    <a
                      key={link.href}
                      className="rounded-full border border-n-6 px-3 py-1.5 text-xs text-n-2 transition-colors hover:border-[#10B981] hover:text-[#10B981]"
                      href={link.href}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {children}
          </main>

          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-6">
              {sections.length > 0 && (
                <div className="rounded-2xl border border-n-6 bg-n-7/70 p-5">
                  <p className="text-sm font-semibold text-n-1">Quick links</p>
                  <ul className="mt-4 space-y-3 text-sm">
                    {sections.map((link) => (
                      <li key={link.href}>
                        <a
                          className="text-n-3 transition-colors hover:text-[#10B981]"
                          href={link.href}
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-2xl border border-n-6 bg-n-7/70 p-5">
                <p className="text-sm font-semibold text-n-1">Need help?</p>
                <p className="text-xs text-n-4 mt-2">
                  For account issues, disputes, or urgent reviews, head to support.
                </p>
                <a
                  className="mt-4 inline-flex rounded-lg border border-n-6 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-n-1 transition-colors hover:border-[#10B981] hover:text-[#10B981]"
                  href="/support"
                >
                  Go to support
                </a>
              </div>

            </div>
          </aside>
        </div>
      </div>
    </Section>
  );
};

export default DocsLayout;
