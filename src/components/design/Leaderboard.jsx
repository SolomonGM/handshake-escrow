import { gradient } from "../../assets";

export const Gradient = () => {
  return (
    <>
      {/* Left gradient */}
      <div className="absolute top-[10rem] -left-[20rem] w-[40rem] h-[40rem] opacity-20 pointer-events-none">
        <div 
          className="w-full h-full rounded-full blur-[150px]"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(16, 185, 129, 0.2) 50%, transparent 100%)'
          }}
        ></div>
      </div>
      
      {/* Right gradient */}
      <div className="absolute top-[15rem] -right-[20rem] w-[40rem] h-[40rem] opacity-15 pointer-events-none">
        <div 
          className="w-full h-full rounded-full blur-[150px]"
          style={{
            background: 'radial-gradient(circle, rgba(14, 165, 233, 0.3) 0%, rgba(16, 185, 129, 0.2) 50%, transparent 100%)'
          }}
        ></div>
      </div>
      
      {/* Center bottom glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60rem] h-[30rem] opacity-10 pointer-events-none">
        <div 
          className="w-full h-full rounded-full blur-[180px]"
          style={{
            background: 'radial-gradient(ellipse, rgba(16, 185, 129, 0.3) 0%, transparent 70%)'
          }}
        ></div>
      </div>
    </>
  );
};
