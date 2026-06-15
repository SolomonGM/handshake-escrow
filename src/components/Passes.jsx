import Section from "./Section";
import { passes, cryptocoins } from "../assets";
import Heading from "./Heading";
import PassesList from "./PassesList";
import { LeftLine, RightLine } from "./design/Passes";

const Passes = () => {
  return (
    <Section className="overflow-hidden" id="passes">
      <div className="container relative z-2">
        <div className="pointer-events-none absolute left-1/2 top-20 h-[34rem] w-[48rem] -translate-x-1/2 rounded-full bg-radial-gradient from-[#10B981]/10 to-transparent blur-2xl" />

        <div className="hidden relative justify-center mb-[5rem] lg:flex">
          <img
            src={passes}
            className="relative z-1 drop-shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
            width={510}
            height={510}
            alt="Passes"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute top-1/2 left-1/2 w-[60rem] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <img
              src={cryptocoins}
              className="w-full opacity-90"
              width={950}
              height={400}
              alt="Coins"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>

        <Heading
          className="relative z-2"
          tag="Skip the fees, trade more freely"
          title="Fee passes for active traders"
        />

        <div className="relative">
          <PassesList />
          <LeftLine />
          <RightLine />
        </div>

        <div className="flex justify-center mt-10">
          <a
            className="text-xs font-code font-bold tracking-wider uppercase border-b"
            href="/docs/fees#passes"
          >
            See the full details
          </a>
        </div>
      </div>
    </Section>
  );
};

export default Passes;
