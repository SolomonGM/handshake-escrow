import { lazy, Suspense, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ButtonGradient from "./assets/svg/ButtonGradient";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Hero from "./components/Hero";
import ProtectedRoute from "./components/ProtectedRoute";
import StaffRoute from "./components/StaffRoute";
import BanLockOverlay from "./components/BanLockOverlay";

const About = lazy(() => import("./components/About"));
const BlockchainVerification = lazy(() => import("./components/BlockchainVerification"));
const Passes = lazy(() => import("./components/Passes"));
const Leaderboard = lazy(() => import("./components/Leaderboard"));
const RecentTransactions = lazy(() => import("./components/RecentTransactions"));
const Settings = lazy(() => import("./components/Settings"));
const Support = lazy(() => import("./components/Support"));
const LiveChat = lazy(() => import("./components/LiveChat"));
const TradeHub = lazy(() => import("./components/TradeHub"));
const TradeTicket = lazy(() => import("./components/TradeTicket"));
const MyRequests = lazy(() => import("./components/MyRequests"));
const PassesPurchase = lazy(() => import("./components/PassesPurchase"));
const Docs = lazy(() => import("./components/Docs"));
const DocsBot = lazy(() => import("./components/docs/DocsBot"));
const DocsFees = lazy(() => import("./components/docs/DocsFees"));
const DocsOther = lazy(() => import("./components/docs/DocsOther"));
const DocsTerms = lazy(() => import("./components/docs/DocsTerms"));
const AllTransactions = lazy(() => import("./components/AllTransactions"));
const AdminPanel = lazy(() => import("./components/AdminPanel"));
const ModeratorPanel = lazy(() => import("./components/ModeratorPanel"));

const PageLayout = ({ children }) => (
  <div className="min-h-[calc(100vh-4.75rem)] lg:min-h-[calc(100vh-5.25rem)] flex flex-col">
    {children}
  </div>
);

const PageFallback = () => (
  <div className="flex min-h-[45vh] items-center justify-center px-6 text-center text-sm font-code uppercase tracking-wider text-n-4">
    Loading
  </div>
);

const SectionFallback = ({ className = "" }) => (
  <div className={`container py-16 ${className}`}>
    <div className="h-40 animate-pulse rounded-3xl border border-n-1/10 bg-n-7/30" />
  </div>
);

// Home Page Component
const HomePage = () => (
  <PageLayout>
    <Header />
    <main className="relative flex-1 flex flex-col overflow-hidden bg-[linear-gradient(180deg,#0E0C15_0%,#11101A_42%,#0E0C15_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />
      <Hero />
      <Suspense fallback={<SectionFallback />}>
        <About />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <RecentTransactions />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <BlockchainVerification />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <Passes />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <Leaderboard />
      </Suspense>
    </main>
    <Footer />
  </PageLayout>
);

// Trade Hub Page Component
const TradeHubPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <TradeHub />
    </main>
    <Footer />
  </PageLayout>
);

// Trade Ticket Page Component
const TradeTicketPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <TradeTicket />
    </main>
    <Footer />
  </PageLayout>
);

// My Requests Page Component
const MyRequestsPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <MyRequests />
    </main>
    <Footer />
  </PageLayout>
);

// Passes Purchase Page Component
const PassesPurchasePage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <PassesPurchase />
    </main>
    <Footer />
  </PageLayout>
);

// Docs Page Component
const DocsPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <Docs />
    </main>
    <Footer />
  </PageLayout>
);

const DocsBotPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <DocsBot />
    </main>
    <Footer />
  </PageLayout>
);

const DocsFeesPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <DocsFees />
    </main>
    <Footer />
  </PageLayout>
);

const DocsOtherPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <DocsOther />
    </main>
    <Footer />
  </PageLayout>
);

const DocsTermsPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1">
      <DocsTerms />
    </main>
    <Footer />
  </PageLayout>
);

const AllTransactionsPage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 overflow-hidden pt-4 sm:pt-5 md:pt-6">
      <AllTransactions />
    </main>
  </PageLayout>
);

const AdminConsolePage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 bg-n-8">
      <AdminPanel />
    </main>
  </PageLayout>
);

const ModeratorConsolePage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 bg-n-8">
      <ModeratorPanel />
    </main>
  </PageLayout>
);

const AppShell = () => {
  const { user } = useAuth();

  // Persist chat state in localStorage
  const [isChatOpen, setIsChatOpen] = useState(() => {
    const saved = localStorage.getItem('chatOpen');
    return saved ? JSON.parse(saved) : false;
  });

  // This updates localStorage when chat state changes.
  const toggleChat = () => {
    setIsChatOpen(prev => {
      const newState = !prev;
      localStorage.setItem('chatOpen', JSON.stringify(newState));
      return newState;
    });
  };

  const activeBan = user?.siteModeration?.activeBan ? user.siteModeration.ban : null;

  return (
    <>
      <div className={`pt-[4.75rem] lg:pt-[5.25rem] overflow-x-clip transition-[margin] duration-300 ${
        isChatOpen ? 'ml-0 lg:ml-80' : 'ml-0'
      }`}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/trade-hub" element={<TradeHubPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/bot" element={<DocsBotPage />} />
            <Route path="/docs/fees" element={<DocsFeesPage />} />
            <Route path="/docs/other" element={<DocsOtherPage />} />
            <Route path="/docs/terms" element={<DocsTermsPage />} />
            <Route path="/transactions" element={<AllTransactionsPage />} />
            <Route
              path="/admin"
              element={
                <StaffRoute requireDeveloper>
                  <AdminConsolePage />
                </StaffRoute>
              }
            />
            <Route
              path="/moderator"
              element={
                <StaffRoute>
                  <ModeratorConsolePage />
                </StaffRoute>
              }
            />
            <Route path="/trade-ticket" element={<TradeTicketPage />} />
            <Route
              path="/my-requests"
              element={
                <ProtectedRoute>
                  <MyRequestsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/passes/purchase"
              element={
                <ProtectedRoute>
                  <PassesPurchasePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route path="/support" element={<Support />} />
            <Route path="/login" element={<HomePage />} />
            <Route path="/register" element={<HomePage />} />
          </Routes>
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <LiveChat isOpen={isChatOpen} onClose={toggleChat} />
      </Suspense>
      <ButtonGradient />
      <BanLockOverlay banDetails={activeBan} />
    </>
  );
};

const App = () => (
  <AuthProvider>
    <AppShell />
  </AuthProvider>
);

export default App;
