import Section from "./Section";
import { passes, cryptocoins } from "../assets";
import Heading from "./Heading";
import PassesList from "./PassesList";
import { LeftLine, RightLine } from "./design/Passes";

const Passes = () => {
  return (
    <Section className="overflow-hidden" id="passes">
      <div className="container relative z-2">
        <div className="hidden relative justify-center mb-[6.5rem] lg:flex">
          <img
            src={passes}
            className="relative z-1"
            width={510}
            height={510}
            alt="Passes"
          />
          <div className="absolute top-1/2 left-1/2 w-[60rem] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <img
              src={cryptocoins}
              className="w-full"
              width={950}
              height={400}
              alt="Coins"
            />
          </div>
        </div>

        <Heading
          tag="Skip the fees, trade more freely"
          title="Passes"
        />

        <div className="relative">
          <PassesList />
          <LeftLine />
          <RightLine />
        </div>

        <div className="flex justify-center mt-10">
          <a
            className="text-xs font-code font-bold tracking-wider uppercase border-b"
            href="/passes"
          >
            See the full details
          </a>
        </div>
      </div>
    </Section>
  );
};

export default Passes;
