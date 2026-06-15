import { check } from "../assets";
import { passes } from "../constants";
import Button from "./Button";

const PassesList = () => {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {passes.map((item, index) => (
        <div
          key={item.id}
          className={`group relative h-full overflow-hidden rounded-2xl border border-n-1/10 bg-n-8/80 px-6 py-8 shadow-[0_18px_70px_rgba(0,0,0,0.25)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-[#10B981]/35 ${
            index === 1 ? "lg:-mt-6 lg:mb-6 lg:border-[#10B981]/35" : ""
          } [&>h4]:first:text-color-2 [&>h4]:even:text-color-1 [&>h4]:last:text-color-3`}
        >
          <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-radial-gradient from-[#10B981]/18 to-transparent blur-xl" />
          {index === 1 && (
            <div className="absolute right-5 top-5 rounded-full bg-[#10B981]/15 px-3 py-1 text-[0.65rem] font-code font-bold uppercase tracking-wider text-[#6EE7B7]">
              Popular
            </div>
          )}

          <h4 className="h4 mb-4">{item.title}</h4>

          <p className="body-2 min-h-[4rem] mb-3 text-n-1/50">
            {item.description}
          </p>

          <div className="flex items-center h-[5.5rem] mb-6">
            {item.price && (
              <>
                <div className="h3">$</div>
                <div className="text-[5.5rem] leading-none font-bold">
                  {item.price}
                </div>
              </>
            )}
          </div>

          {item.passCount && (
            <div className="mb-6 text-center">
              <span className="inline-block px-4 py-2 bg-n-7/70 border border-n-1/10 rounded-full text-n-1 font-code font-bold text-sm">
                {item.passCount}
              </span>
            </div>
          )}

          <Button
            className="w-full mb-6"
            href={item.price ? `/passes/purchase?passId=${item.id}` : "mailto:contact@handshake.trade"}
            white={!!item.price}
          >
            {item.price ? "Purchase now" : "Contact us"}
          </Button>

          <ul>
            {item.features.map((feature, index) => (
              <li
                key={index}
                className="flex items-start py-5 border-t border-n-1/10"
              >
                <img src={check} width={24} height={24} alt="Check" />
                <p className="body-2 ml-4">{feature}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default PassesList;
