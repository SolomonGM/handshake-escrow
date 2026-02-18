import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ButtonGradient from "./assets/svg/ButtonGradient";
import About from "./components/About";
import BlockchainVerification from "./components/BlockchainVerification";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Passes from "./components/Passes";
import Leaderboard from "./components/Leaderboard";
import RecentTransactions from "./components/RecentTransactions";
import Settings from "./components/Settings";
import Support from "./components/Support";
import ProtectedRoute from "./components/ProtectedRoute";
import LiveChat from "./components/LiveChat";
import TradeHub from "./components/TradeHub";
import TradeTicket from "./components/TradeTicket";
import MyRequests from "./components/MyRequests";
import PassesPurchase from "./components/PassesPurchase";
import Docs from "./components/Docs";
import DocsBot from "./components/docs/DocsBot";
import DocsFees from "./components/docs/DocsFees";
import DocsOther from "./components/docs/DocsOther";
import DocsTerms from "./components/docs/DocsTerms";
import AllTransactions from "./components/AllTransactions";

const PageLayout = ({ children }) => (
  <div className="min-h-[calc(100vh-4.75rem)] lg:min-h-[calc(100vh-5.25rem)] flex flex-col">
    {children}
  </div>
);

// Home Page Component
const HomePage = () => (
  <PageLayout>
    <Header />
    <main className="flex-1 flex flex-col">
      <Hero />
      <About />
      <RecentTransactions />
      <BlockchainVerification />
      <Passes />
      <Leaderboard />
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

const App = () => {
  // Persist chat state in localStorage
  const [isChatOpen, setIsChatOpen] = useState(() => {
    const saved = localStorage.getItem('chatOpen');
    return saved ? JSON.parse(saved) : false;
  });

  // Update localStorage when chat state changes
  const toggleChat = () => {
    setIsChatOpen(prev => {
      const newState = !prev;
      localStorage.setItem('chatOpen', JSON.stringify(newState));
      return newState;
    });
  };

  return (
    <AuthProvider>
      <div className={`pt-[4.75rem] lg:pt-[5.25rem] overflow-x-hidden transition-[margin] duration-300 ${
        isChatOpen ? 'ml-0 lg:ml-80' : 'ml-0'
      }`}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/trade-hub" element={<TradeHubPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/bot" element={<DocsBotPage />} />
          <Route path="/docs/fees" element={<DocsFeesPage />} />
          <Route path="/docs/other" element={<DocsOtherPage />} />
          <Route path="/docs/terms" element={<DocsTermsPage />} />
          <Route path="/transactions" element={<AllTransactionsPage />} />
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
          {/* Redirect /login to home (we use modal-based auth) */}
          <Route path="/login" element={<HomePage />} />
          <Route path="/register" element={<HomePage />} />
        </Routes>
      </div>
      <LiveChat isOpen={isChatOpen} onClose={toggleChat} />
      <ButtonGradient />
    </AuthProvider>
  );
};

export default App;
