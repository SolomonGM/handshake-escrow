import { useLocation, useNavigate } from "react-router-dom";
import { disablePageScroll, enablePageScroll } from "scroll-lock";

import { handshake } from "../assets";
import { navigation } from "../constants";
import Button from "./Button";
import MenuSvg from "../assets/svg/MenuSvg";
import { HamburgerMenu } from "./design/Header";
import { useState } from "react";
import AuthModal from "./AuthModal";
import { useAuth } from "../context/AuthContext";
import UserProfileDropdown from "./UserProfileDropdown";

const Header = () => {
  const pathname = useLocation();
  const navigate = useNavigate();
  const [openNavigation, setOpenNavigation] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const { isAuthenticated, user, logout } = useAuth();

  const toggleNavigation = () => {
    if (openNavigation) {
      setOpenNavigation(false);
      enablePageScroll();
    } else {
      setOpenNavigation(true);
      disablePageScroll();
    }
  };

  const handleClick = () => {
    if (!openNavigation) return;

    enablePageScroll();
    setOpenNavigation(false);
  };

  const handleNavClick = (e, url) => {
    e.preventDefault();
    
    if (url === '#login' || url === '#signup') {
      const modalMode = url === '#signup' ? 'register' : 'login';
      setAuthMode(modalMode);
      setAuthModalOpen(true);
      if (openNavigation) {
        setOpenNavigation(false);
        enablePageScroll();
      }
      return;
    }

    // Close mobile nav if open
    if (openNavigation) {
      enablePageScroll();
      setOpenNavigation(false);
    }

    // Check if it's a route (starts with /) or a section anchor (starts with #)
    if (url.startsWith('/')) {
      // It's a route, navigate to it
      navigate(url);
    } else if (pathname.pathname !== '/') {
      // Navigate to homepage first, then scroll to section
      navigate('/');
      // Small delay to ensure page loads before scrolling
      setTimeout(() => {
        const element = document.querySelector(url);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      // Already on homepage, just scroll to section
      const element = document.querySelector(url);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const openAuthModal = (mode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
    if (openNavigation) {
      setOpenNavigation(false);
      enablePageScroll();
    }
  };

  const handleLogout = () => {
    logout();
    if (openNavigation) {
      setOpenNavigation(false);
      enablePageScroll();
    }
  };

  return (
    <div
      className={`fixed top-0 left-0 w-full z-50  border-b border-n-6 lg:bg-n-8/90 lg:backdrop-blur-sm ${
        openNavigation ? "bg-n-8" : "bg-n-8/90 backdrop-blur-sm"
      }`}
    >
      <div className="flex min-h-[4.75rem] items-center px-4 py-3 sm:px-5 lg:px-7.5 lg:py-0 xl:px-10">
        <a className="block w-[9.5rem] shrink-0 sm:w-[11rem] md:w-[12rem] xl:mr-8" href="/" onClick={(e) => handleNavClick(e, '#hero')}>
          <img src={handshake} width={190} height={40} alt="Handshake" className="h-auto w-full" />
        </a>

        <nav
          className={`${
            openNavigation ? "flex" : "hidden"
          } fixed bottom-0 left-0 right-0 top-[4.75rem] overflow-y-auto bg-n-8 lg:static lg:flex lg:mx-auto lg:overflow-visible lg:bg-transparent`}
        >
          <div className="relative z-2 m-auto flex min-h-full w-full flex-col items-center justify-start pt-6 pb-10 lg:min-h-0 lg:w-auto lg:flex-row lg:items-center lg:justify-center lg:pt-0 lg:pb-0">
            {navigation.map((item) => (
              <a
                key={item.id}
                href={item.url}
                onClick={(e) => handleNavClick(e, item.url)}
                className={`block relative font-code text-xl uppercase text-n-1 transition-colors hover:text-color-1 sm:text-2xl ${
                  item.onlyMobile ? "lg:hidden" : ""
                } px-6 py-4 sm:py-5 md:py-6 lg:-mr-0.25 lg:py-8 lg:text-xs lg:font-semibold ${
                  item.url === pathname.hash
                    ? "z-2 lg:text-n-1"
                    : "lg:text-n-1/50"
                } lg:leading-5 lg:hover:text-n-1 xl:px-12`}
              >
                {item.title}
              </a>
            ))}

            {/* Mobile Auth Buttons */}
            <div className="mt-6 mb-8 flex w-full max-w-sm flex-col gap-4 px-6 sm:px-8 lg:hidden">
              {!isAuthenticated ? (
                <>
                  <Button onClick={() => openAuthModal('login')} className="w-full">
                    Sign In
                  </Button>
                  <button
                    onClick={() => openAuthModal('register')}
                    className="w-full rounded-lg border border-n-1 bg-n-1 py-3 font-semibold text-n-8 transition-all duration-300 hover:border-[#10B981] hover:bg-[#10B981] hover:text-n-1"
                  >
                    New Account
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center mb-4">
                    <p className="text-sm text-n-3">Logged in as</p>
                    <p className="text-lg text-color-1 font-semibold">{user?.username}</p>
                  </div>
                  <a href="/settings" onClick={handleClick}>
                    <Button className="w-full">Settings</Button>
                  </a>
                  <button
                    onClick={handleLogout}
                    className="w-full py-3 text-n-1 border border-n-6 rounded-lg hover:bg-n-7 transition-all duration-300"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>

          <HamburgerMenu />
        </nav>

        {!isAuthenticated ? (
          <>
            <button
              onClick={() => openAuthModal('register')}
              className="button hidden mr-8 text-n-1 transition-colors hover:text-[#10B981] lg:block"
            >
              New account
            </button>
            <Button className="hidden lg:flex" onClick={() => openAuthModal('login')}>
              Sign in
            </Button>
          </>
        ) : (
          <div className="hidden lg:flex">
            <UserProfileDropdown />
          </div>
        )}

        <Button
          className="ml-auto lg:hidden"
          px="px-3"
          onClick={toggleNavigation}
        >
          <MenuSvg openNavigation={openNavigation} />
        </Button>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        mode={authMode}
      />
    </div>
  );
};

export default Header;
