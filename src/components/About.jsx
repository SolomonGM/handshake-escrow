import { benefits } from "../constants";
import Heading from "./Heading";
import Section from "./Section";

const About = () => {
  return (
    <Section className="overflow-hidden" id="about">
      <div className="container relative z-2">
        <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-radial-gradient from-[#0D5C3D]/20 to-transparent blur-2xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-radial-gradient from-[#4A9EFF]/10 to-transparent blur-2xl" />

        <div className="mb-10 flex flex-col gap-6 md:mb-14 lg:flex-row lg:items-end lg:justify-between">
          <Heading
            className="mb-0 max-w-[42rem] text-center lg:text-left"
            tag="Built for private high-trust exchange"
            title="A complete trading desk for secure P2P crypto"
          />

          <p className="body-2 mx-auto max-w-[31rem] text-center text-n-3 lg:mx-0 lg:text-left">
            From the first offer to on-chain settlement, Handshake keeps the
            moving parts visible: escrow, buyer and seller flows, supported
            coins, fee passes, and live help.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
          {benefits.map((item, index) => (
            <article
              className={`group relative min-h-[19rem] overflow-hidden rounded-2xl border border-n-1/10 bg-n-8/75 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.28)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-[#10B981]/35 ${
                index === 0 ? "lg:col-span-2" : ""
              }`}
              key={item.id}
            >
              <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-[0.08]"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#10B981]/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-radial-gradient from-[#10B981]/20 to-transparent blur-xl" />

              <div className="relative z-2 flex h-full flex-col">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-n-1/10 bg-n-7/70">
                    <img
                      src={item.iconUrl}
                      width={34}
                      height={34}
                      alt=""
                      className="h-8 w-8 object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <span className="font-code text-xs font-bold uppercase tracking-wider text-n-4">
                    0{index + 1}
                  </span>
                </div>

                <h3 className="mb-4 text-2xl font-semibold text-n-1">
                  {item.title}
                </h3>
                <p className="body-2 mb-8 text-n-3">{item.text}</p>

                <a
                  href="/docs"
                  className="button mt-auto inline-flex w-fit items-center gap-2 rounded-full border border-n-1/10 bg-n-7/50 px-5 py-3 text-n-1 transition-all hover:border-[#10B981]/40 hover:bg-[#10B981]/10 hover:text-[#6EE7B7]"
                >
                  Docs
                  <span aria-hidden="true">-&gt;</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
};

export default About;
