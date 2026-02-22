import { companyLogos } from "../constants";

const TermsAndLogos = ({ className }) => {
  return (
    <div className={className}>
      <h5 className="tagline mb-6 text-center text-n-1/50">
        By using the site and creating an exchange, you agree to the Handshake&apos;s{" "}
        <a
          href="/docs/terms#user-responsibility"
          className="text-blue-500 hover:text-blue-400 underline"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="/docs/other#security"
          className="text-blue-500 hover:text-blue-400 underline"
        >
          Privacy Policy
        </a>
      </h5>
      <ul className="flex">
        {companyLogos.map((logo, index) => (
          <li
            className="flex items-center justify-center flex-1 h-[8.5rem]"
            key={index}
          >
            <img src={logo} width={134} height={28} alt={logo} />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TermsAndLogos;
