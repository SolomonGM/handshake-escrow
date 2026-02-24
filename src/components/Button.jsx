import ButtonSvg from "../assets/svg/ButtonSvg";
import { Link } from "react-router-dom";

const Button = ({ className, href, onClick, children, px, white, ...props }) => {
  const isDisabled = Boolean(props.disabled);
  const classes = `button relative inline-flex items-center justify-center h-11 transition-colors hover:text-[#10B981] ${
    px || "px-10"
  } ${white ? "text-n-8" : "text-n-1"} ${isDisabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""} ${className || ""}`;
  const spanClasses = "relative z-10";

  const renderButton = () => (
    <button className={classes} onClick={onClick} {...props}>
      <span className={spanClasses}>{children}</span>
      {ButtonSvg(white)}
    </button>
  );

  const renderLink = () => (
    href?.startsWith("/") ? (
      <Link to={href} className={classes}>
        <span className={spanClasses}>{children}</span>
        {ButtonSvg(white)}
      </Link>
    ) : (
      <a href={href} className={classes}>
        <span className={spanClasses}>{children}</span>
        {ButtonSvg(white)}
      </a>
    )
  );

  return href ? renderLink() : renderButton();
};

export default Button;
