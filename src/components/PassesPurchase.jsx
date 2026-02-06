import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Section from "./Section";
import Heading from "./Heading";
import Button from "./Button";
import { check, loading } from "../assets";
import { passes } from "../constants";
import axios from "axios";
import { toast } from "../utils/toast";
import { QRCodeSVG } from 'qrcode.react';
import socketService from "../services/socket";

const API_URL = 'http://localhost:5001/api';

const PassesPurchase = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedPass, setSelectedPass] = useState(null);
  const [selectedCrypto, setSelectedCrypto] = useState('litecoin');
  const [step, setStep] = useState('select'); // select, payment, processing, complete
  const [purchaseData, setPurchaseData] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [transactionStatus, setTransactionStatus] = useState({
    detected: false,
    confirmations: 0,
    required: 2,
    transactionHash: null,
    etherscanLink: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState({ address: false, amount: false });
  const copyTimers = useRef({});
  const [paymentIssue, setPaymentIssue] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const resumeToastRef = useRef(null);

  const cryptoOptions = [
    { value: 'litecoin', label: 'Litecoin (LTC)', symbol: 'LTC', color: '#345D9D' },
    { value: 'bitcoin', label: 'Bitcoin (BTC)', symbol: 'BTC', color: '#F7931A' },
    { value: 'ethereum', label: 'Ethereum (ETH)', symbol: 'ETH', color: '#627EEA' },
  ];

  useEffect(() => {
    return () => {
      Object.values(copyTimers.current).forEach((timer) => {
        clearTimeout(timer);
      });
    };
  }, []);

  useEffect(() => {
    if (step !== 'payment' && showExitConfirm) {
      setShowExitConfirm(false);
    }
  }, [step, showExitConfirm]);

  // Countdown timer for 10-minute timeout
  useEffect(() => {
    if (step !== 'payment' || !purchaseData) return;
    if (transactionStatus.detected) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      const created = new Date(purchaseData.createdAt || Date.now());
      const timeout = new Date(created.getTime() + 10 * 60 * 1000); // 10 minutes
      const diff = timeout - now;
      
      if (diff <= 0) {
        setTimeRemaining({ minutes: 0, seconds: 0, total: 0, expired: true });
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeRemaining({ minutes, seconds, total: diff, expired: false });
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [step, purchaseData, transactionStatus.detected]);

  // Get pass from URL or default to first pass
  useEffect(() => {
    const passId = searchParams.get('passId');
    if (passId) {
      const pass = passes.find(p => p.id === passId);
      setSelectedPass(pass || passes[0]);
    } else {
      setSelectedPass(passes[0]);
    }
  }, [searchParams]);

  // Check for active order on mount and restore payment state
  useEffect(() => {
    const checkActiveOrder = async () => {
      if (!user || !token) {
        toast.error('Please login to purchase passes');
        navigate('/');
        return;
      }

      try {
        // Check backend for any active orders for this user
        const ordersResponse = await axios.get(
          `${API_URL}/passes/my-orders`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (ordersResponse.data.success && ordersResponse.data.orders) {
          const orders = ordersResponse.data.orders;
          // Find any pending or confirmed order
          const activeOrder = ordersResponse.data.orders.find(
            order => (order.status === 'pending' || order.status === 'confirmed') && 
                     new Date(order.expiresAt) > new Date()
          );

          if (activeOrder) {
            // Restore the active order
            setPurchaseData(activeOrder);
            setSelectedCrypto(activeOrder.cryptocurrency);
            setStep('payment');
            setPaymentIssue(null);
            
            // Restore transaction status if payment detected
            if (activeOrder.transactionHash) {
              const required = getConfirmationsRequired(activeOrder.cryptocurrency);
              const explorerLink = getExplorerLink(activeOrder.transactionHash, activeOrder.cryptocurrency);

              setTransactionStatus({
                detected: true,
                confirmations: activeOrder.confirmations || 0,
                required,
                transactionHash: activeOrder.transactionHash,
                etherscanLink: explorerLink
              });
              setTimeRemaining(null);
            }
            
            console.log('✅ Restored active payment:', activeOrder.orderId);
            if (resumeToastRef.current !== activeOrder.orderId) {
              resumeToastRef.current = activeOrder.orderId;
            }
          } else {
            const latestOrder = orders[0];
            if (latestOrder?.status === 'completed' && latestOrder.transactionHash) {
              const receipt = buildReceiptFromOrder(latestOrder);
              setReceiptData(receipt);
              setStep('complete');
              setPaymentIssue(null);
              return;
            }

            if (latestOrder && ['failed', 'awaiting-staff', 'timedout', 'expired'].includes(latestOrder.status)) {
              const statusMessage = latestOrder.status === 'failed'
                ? 'Payment amount did not match. Please contact staff for manual review.'
                : (latestOrder.status === 'timedout' || latestOrder.status === 'expired')
                  ? 'Payment window expired. If you sent funds, please contact staff.'
                  : 'Payment requires manual review. Please contact staff.';

              setPurchaseData(latestOrder);
              setSelectedCrypto(latestOrder.cryptocurrency);
              setStep('payment');

              if (latestOrder.transactionHash) {
                setTransactionStatus({
                  detected: true,
                  confirmations: latestOrder.confirmations || 0,
                  required: getConfirmationsRequired(latestOrder.cryptocurrency),
                  transactionHash: latestOrder.transactionHash,
                  etherscanLink: getExplorerLink(latestOrder.transactionHash, latestOrder.cryptocurrency)
                });
                setPaymentIssue(null);
                setTimeRemaining(null);
              } else {
                setPaymentIssue({ status: latestOrder.status, message: statusMessage });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking active order:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkActiveOrder();
  }, [user, token, navigate]);

  // Socket.IO listener for real-time payment updates
  useEffect(() => {
    if (!purchaseData || !purchaseData.orderId) return;

    // Connect socket if not connected
    if (!socketService.isConnected()) {
      socketService.connect(token);
    }

    const eventName = `pass_order_update:${purchaseData.orderId}`;
    
    const handleOrderUpdate = (data) => {
      console.log('📡 Pass order update received:', data);
      
      switch(data.status) {
        case 'detected':
          // Transaction detected
          setPaymentIssue(null);
          setTimeRemaining(null);
          const detectedRequired = data.required ?? getConfirmationsRequired(purchaseData?.cryptocurrency || selectedCrypto);
          setTransactionStatus({
            detected: true,
            confirmations: data.confirmations || 0,
            required: detectedRequired,
            transactionHash: data.transactionHash,
            etherscanLink: data.etherscanLink || getExplorerLink(data.transactionHash, purchaseData?.cryptocurrency || selectedCrypto)
          });
          break;
          
        case 'confirming':
          // Confirmation progress
          setPaymentIssue(null);
          setTimeRemaining(null);
          setTransactionStatus(prev => ({
            ...prev,
            confirmations: data.confirmations,
            required: data.required ?? prev.required ?? getConfirmationsRequired(purchaseData?.cryptocurrency || selectedCrypto)
          }));
          console.log(`??? Confirmations: ${data.confirmations}/${data.required}`);
          break;
          
        case 'completed':
          // Order completed
          setPaymentIssue(null);
          setTimeRemaining(null);
          const receipt = {
            transactionHash: data.transactionHash,
            passType: selectedPass?.title || purchaseData.passType || 'Pass',
            passCount: data.passCount,
            newBalance: data.newBalance ?? user?.passes ?? null,
            amount: purchaseData.cryptoAmount,
            cryptocurrency: getCryptoInfo()?.symbol || purchaseData.cryptocurrency?.toUpperCase(),
            timestamp: new Date(data.completedAt).toLocaleString(),
            transactionDetails: data.transactionDetails,
            completedAt: data.completedAt,
            etherscanLink: data.etherscanLink || getExplorerLink(data.transactionHash, purchaseData?.cryptocurrency)
          };
          
          setReceiptData(receipt);
          setStep('complete');
          
          break;

        case 'failed':
          setPaymentIssue({
            status: 'failed',
            message: data.message || 'Payment amount did not match. Please contact staff for manual review.'
          });
          break;

        case 'awaiting-staff':
          setPaymentIssue({
            status: 'awaiting-staff',
            message: data.message || 'Payment requires manual review. Please contact staff.'
          });
          break;

        case 'expired':
        case 'timedout':
          setPaymentIssue({
            status: data.status,
            message: data.message || 'Payment window expired. If you sent funds, please contact staff.'
          });
          break;
      }
    };

    // Listen for updates
    socketService.on(eventName, handleOrderUpdate);

    // Cleanup
    return () => {
      if (socketService.socket) {
        socketService.socket.off(eventName, handleOrderUpdate);
      }
    };
  }, [purchaseData, token, selectedPass, user]);

  useEffect(() => {
    if (step !== 'payment' || !purchaseData?.orderId || !token) return;

    let isActive = true;

    const pollOrderStatus = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/passes/order/${purchaseData.orderId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!isActive || !response.data?.order) return;
        const order = response.data.order;
        if (order.cryptocurrency) {
          setSelectedCrypto(order.cryptocurrency);
        }

        if (order.status === 'completed' && order.transactionHash) {
          const receipt = buildReceiptFromOrder(order);
          setReceiptData(receipt);
          setStep('complete');
          setPaymentIssue(null);
          return;
        }

        const hasTransaction = Boolean(order.transactionHash);

        if (['failed', 'awaiting-staff'].includes(order.status)) {
          const statusMessage = order.status === 'failed'
            ? 'Payment amount did not match. Please contact staff for manual review.'
            : 'Payment requires manual review. Please contact staff.';

          setPaymentIssue({ status: order.status, message: statusMessage });
        } else if (['timedout', 'expired'].includes(order.status) && !hasTransaction) {
          setPaymentIssue({
            status: order.status,
            message: 'Payment window expired. If you sent funds, please contact staff.'
          });
        } else {
          setPaymentIssue(null);
        }

        if (hasTransaction) {
          const required = getConfirmationsRequired(order.cryptocurrency);
          setTimeRemaining(null);
          setTransactionStatus(prev => ({
            ...prev,
            detected: true,
            confirmations: order.confirmations || prev.confirmations,
            required,
            transactionHash: order.transactionHash,
            etherscanLink: prev.etherscanLink || getExplorerLink(order.transactionHash, order.cryptocurrency)
          }));
        }
      } catch (err) {
        console.error('Error polling pass order status:', err);
      }
    };

    pollOrderStatus();
    const interval = setInterval(pollOrderStatus, 5000);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [step, purchaseData, token, user]);

  const handleSelectPass = (pass) => {
    setSelectedPass(pass);
  };

  const handleProceedToPayment = async () => {
    if (!selectedPass) {
      toast.error('Please select a pass');
      return;
    }
    setPaymentIssue(null);

    try {
      // Create pass purchase order
      const response = await axios.post(
        `${API_URL}/passes/create-order`,
        {
          passId: selectedPass.id,
          cryptocurrency: selectedCrypto,
          passCount: parseInt(selectedPass.passCount.split(' ')[0])
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        const order = response.data.order;
        setPurchaseData(order);
        setStep('payment');
        
      }
    } catch (err) {
      console.error('Error creating pass order:', err);
      
      // If user already has active order, redirect to it
      if (err.response?.status === 400 && err.response?.data?.activeOrder) {
        const activeOrder = err.response.data.activeOrder;
        setPurchaseData(activeOrder);
        setSelectedCrypto(activeOrder.cryptocurrency);
        setStep('payment');
        
        // Restore transaction status if exists
        if (activeOrder.transactionHash) {
          const required = getConfirmationsRequired(activeOrder.cryptocurrency);
          const explorerLink = getExplorerLink(activeOrder.transactionHash, activeOrder.cryptocurrency);

          setTransactionStatus({
            detected: true,
            confirmations: activeOrder.confirmations || 0,
            required,
            transactionHash: activeOrder.transactionHash,
            etherscanLink: explorerLink
          });
          setTimeRemaining(null);
        }
        
      } else {
        toast.error(err.response?.data?.message || 'Failed to create order');
      }
    }
  };

  const getCryptoInfo = () => {
    return cryptoOptions.find(c => c.value === selectedCrypto);
  };

  const getConfirmationsRequired = (crypto) => {
    const confirmationRequirements = {
      bitcoin: 2,
      litecoin: 2,
      ethereum: 2
    };

    return confirmationRequirements[crypto] || 3;
  };

  const getExplorerLink = (hash, crypto) => {
    if (!hash || !crypto) return null;

    if (crypto === 'ethereum') {
      return process.env.NODE_ENV === 'production'
        ? `https://etherscan.io/tx/${hash}`
        : `https://sepolia.etherscan.io/tx/${hash}`;
    }

    if (crypto === 'litecoin') {
      return `https://live.blockcypher.com/ltc-testnet/tx/${hash}`;
    }

    if (crypto === 'bitcoin') {
      return `https://live.blockcypher.com/btc-testnet/tx/${hash}`;
    }

    return null;
  };

  const buildReceiptFromOrder = (order) => {
    const cryptoSymbol = cryptoOptions.find(c => c.value === order.cryptocurrency)?.symbol;

    return {
      transactionHash: order.transactionHash,
      passType: order.passType || purchaseData?.passType || selectedPass?.title || 'Pass',
      passCount: order.passCount,
      newBalance: order.transactionDetails?.balanceAfter ?? user?.passes ?? null,
      amount: order.cryptoAmount,
      cryptocurrency: cryptoSymbol || order.cryptocurrency?.toUpperCase(),
      timestamp: new Date(order.completedAt || Date.now()).toLocaleString(),
      transactionDetails: order.transactionDetails,
      completedAt: order.completedAt || order.updatedAt,
      etherscanLink: getExplorerLink(order.transactionHash, order.cryptocurrency)
    };
  };

  const triggerCopyAnimation = (key) => {
    setCopyFeedback((prev) => ({ ...prev, [key]: true }));
    if (copyTimers.current[key]) {
      clearTimeout(copyTimers.current[key]);
    }
    copyTimers.current[key] = setTimeout(() => {
      setCopyFeedback((prev) => ({ ...prev, [key]: false }));
    }, 900);
  };

  const handleExitToSelection = async () => {
    if (purchaseData?.orderId) {
      try {
        await axios.post(
          `${API_URL}/passes/cancel-order`,
          { orderId: purchaseData.orderId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err) {
        console.error('Error cancelling order:', err);
      }
    }
    setStep('select');
    setPurchaseData(null);
    setPaymentIssue(null);
    setShowExitConfirm(false);
  };

  const isExitConfirmRequired = !transactionStatus.detected && (
    timeRemaining?.expired || ['timedout', 'expired'].includes(paymentIssue?.status)
  );

  useEffect(() => {
    if (!isExitConfirmRequired && showExitConfirm) {
      setShowExitConfirm(false);
    }
  }, [isExitConfirmRequired, showExitConfirm]);

  // Show loading screen while checking for active orders
  if (isLoading) {
    return (
      <Section className="pt-[12rem] -mt-[5.25rem] flex-1" crosses crossesOffset="lg:translate-y-[5.25rem]">
        <div className="container relative z-2">
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-16 h-16 border-4 border-[#10B981] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-n-3">Checking for active payments...</p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section className="pt-[12rem] -mt-[5.25rem] flex-1" crosses crossesOffset="lg:translate-y-[5.25rem]">
      <div className="container relative z-2">
        <Heading
          className="md:max-w-md lg:max-w-2xl"
          title="Purchase Passes"
          text="Skip the fees and trade more freely. Passes never expire!"
        />

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <div className={`flex items-center gap-2 ${step === 'select' ? 'text-[#10B981]' : step !== 'select' ? 'text-n-4' : 'text-n-3'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step === 'select' ? 'bg-[#10B981] text-white' : step !== 'select' && step !== 'payment' && step !== 'processing' && step !== 'complete' ? 'bg-n-7 text-n-3' : 'bg-[#10B981] text-white'}`}>
              {step !== 'select' ? '✓' : '1'}
            </div>
            <span className="font-semibold">Select Pass</span>
          </div>
          <div className="h-0.5 w-12 bg-n-6"></div>
          <div className={`flex items-center gap-2 ${step === 'payment' ? 'text-[#10B981]' : step === 'processing' || step === 'complete' ? 'text-n-4' : 'text-n-3'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step === 'payment' ? 'bg-[#10B981] text-white' : step === 'processing' || step === 'complete' ? 'bg-[#10B981] text-white' : 'bg-n-7 text-n-3'}`}>
              {step === 'processing' || step === 'complete' ? '✓' : '2'}
            </div>
            <span className="font-semibold">Payment</span>
          </div>
          <div className="h-0.5 w-12 bg-n-6"></div>
          <div className={`flex items-center gap-2 ${step === 'complete' ? 'text-[#10B981]' : 'text-n-3'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step === 'complete' ? 'bg-[#10B981] text-white' : 'bg-n-7 text-n-3'}`}>
              {step === 'complete' ? '✓' : '3'}
            </div>
            <span className="font-semibold">Complete</span>
          </div>
        </div>

        {/* Step 1: Select Pass */}
        {step === 'select' && (
          <div>
            {/* Pass Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {passes.map((pass) => (
                <div
                  key={pass.id}
                  onClick={() => handleSelectPass(pass)}
                  className={`relative cursor-pointer transition-all ${
                    selectedPass?.id === pass.id
                      ? 'transform scale-105'
                      : 'hover:transform hover:scale-102'
                  }`}
                >
                  <div className={`p-6 bg-n-8 border-2 rounded-2xl ${
                    selectedPass?.id === pass.id
                      ? 'border-[#10B981] shadow-lg shadow-[#10B981]/20'
                      : 'border-n-6'
                  }`}>
                    {selectedPass?.id === pass.id && (
                      <div className="absolute -top-3 -right-3 w-10 h-10 bg-[#10B981] rounded-full flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    
                    <h4 className="h4 mb-4 text-center">{pass.title}</h4>
                    <p className="body-2 text-n-3 text-center mb-6">{pass.description}</p>
                    
                    <div className="flex items-center justify-center h-20 mb-6">
                      <div className="text-2xl text-n-1">$</div>
                      <div className="text-6xl font-bold text-n-1">{pass.price}</div>
                    </div>

                    <div className="text-center mb-6">
                      <span className="inline-block px-6 py-3 bg-n-7 border border-n-6 rounded-full text-n-1 font-bold">
                        {pass.passCount}
                      </span>
                    </div>

                    <ul className="space-y-3">
                      {pass.features.slice(0, 3).map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <img src={check} width={20} height={20} alt="Check" className="mt-1" />
                          <p className="text-sm text-n-3 ml-3">{feature}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            {/* Cryptocurrency Selection */}
            <div className="max-w-2xl mx-auto mb-12">
              <h3 className="text-xl font-bold text-n-1 mb-6 text-center">Select Payment Method</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cryptoOptions.map((crypto) => (
                  <button
                    key={crypto.value}
                    onClick={() => setSelectedCrypto(crypto.value)}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      selectedCrypto === crypto.value
                        ? 'border-[#10B981] bg-[#10B981]/10'
                        : 'border-n-6 bg-n-8 hover:border-n-5'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative w-16 h-16">
                        <div
                          className="absolute inset-0 rounded-full blur-md opacity-50"
                          style={{ backgroundColor: crypto.color }}
                        ></div>
                        <div
                          className="relative w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg"
                          style={{ 
                            backgroundColor: crypto.color,
                            boxShadow: `0 4px 14px 0 ${crypto.color}40`
                          }}
                        >
                          {crypto.symbol === 'BTC' && '₿'}
                          {crypto.symbol === 'ETH' && 'Ξ'}
                          {crypto.symbol === 'LTC' && 'Ł'}
                        </div>
                      </div>
                      <span className="font-semibold text-n-1">{crypto.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Order Summary */}
            {selectedPass && (
              <div className="max-w-2xl mx-auto mb-12 p-8 bg-n-8 border border-n-6 rounded-2xl">
                <h3 className="text-xl font-bold text-n-1 mb-6">Order Summary</h3>
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-n-3">
                    <span>Pass Type:</span>
                    <span className="text-n-1 font-semibold">{selectedPass.title}</span>
                  </div>
                  <div className="flex justify-between text-n-3">
                    <span>Quantity:</span>
                    <span className="text-n-1 font-semibold">{selectedPass.passCount}</span>
                  </div>
                  <div className="flex justify-between text-n-3">
                    <span>Payment Method:</span>
                    <span className="text-n-1 font-semibold">{getCryptoInfo().label}</span>
                  </div>
                  <div className="border-t border-n-6 pt-4 flex justify-between">
                    <span className="text-lg font-bold text-n-1">Total:</span>
                    <span className="text-2xl font-bold text-[N#10B981]">${selectedPass.price}</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleProceedToPayment}
                >
                  Proceed to Payment
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Payment */}
        {step === 'payment' && purchaseData && (
          <div className="max-w-2xl mx-auto">
            {/* 10-Minute Timeout Warning */}
            {timeRemaining && !transactionStatus.detected && timeRemaining.total > 0 && timeRemaining.total <= 120000 && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400 text-center">
                  ⚠️ Transaction detection timeout in {timeRemaining.minutes}:{timeRemaining.seconds.toString().padStart(2, '0')}
                </p>
              </div>
            )}
            
            {timeRemaining && !transactionStatus.detected && timeRemaining.total === 0 && (
              <div className="mb-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <p className="text-sm text-orange-400 text-center font-semibold">
                  ⏰ Detection timeout reached. If you sent payment, please contact staff for manual verification.
                </p>
              </div>
            )}
            
            <div className="p-8 bg-n-8 border border-n-6 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-n-1">Send Payment</h3>
                {timeRemaining && !transactionStatus.detected && (
                  <div className="text-sm">
                    <span className="text-n-4">Timeout in: </span>
                    <span className={`font-mono font-bold ${timeRemaining.expired ? 'text-red-500' : timeRemaining.total <= 120000 ? 'text-red-400' : 'text-[#10B981]'}`}>
                      {timeRemaining.minutes}:{timeRemaining.seconds.toString().padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
              
              {/* QR Code */}
              <div className="flex justify-center mb-8">
                <div className="p-4 bg-white rounded-xl">
                  <QRCodeSVG
                    value={purchaseData.paymentAddress}
                    size={256}
                    level="H"
                    includeMargin={true}
                  />
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm text-n-4 mb-2">Send To Address:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={purchaseData.paymentAddress}
                      readOnly
                      className="flex-1 px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 text-sm font-mono"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(purchaseData.paymentAddress);
                        triggerCopyAnimation('address');
                      }}
                      className={`copy-button min-w-[108px] px-4 py-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg transition-colors ${copyFeedback.address ? 'is-copied' : ''}`}
                    >
                      <span className="relative inline-flex items-center justify-center">
                        <span className={`transition-all duration-200 ${copyFeedback.address ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'}`}>
                          Copy
                        </span>
                        <span className={`absolute inset-0 inline-flex items-center justify-center gap-1 transition-all duration-200 ${copyFeedback.address ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Copied</span>
                        </span>
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-n-4 mb-2">Amount:</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 group">
                      <input
                        type="text"
                        value={`${purchaseData.cryptoAmount} ${getCryptoInfo().symbol}`}
                        readOnly
                        className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 font-semibold"
                      />
                      {/* USD Tooltip on Hover */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-n-7 border border-[#10B981] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                        <div className="text-sm text-[#10B981] font-semibold">
                          ≈ ${purchaseData.priceUSD} USD
                        </div>
                        <div className="text-xs text-n-4 mt-1">
                          ±2% tolerance accepted
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(purchaseData.cryptoAmount.toString());
                        triggerCopyAnimation('amount');
                      }}
                      className={`copy-button min-w-[108px] px-4 py-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg transition-colors ${copyFeedback.amount ? 'is-copied' : ''}`}
                    >
                      <span className="relative inline-flex items-center justify-center">
                        <span className={`transition-all duration-200 ${copyFeedback.amount ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'}`}>
                          Copy
                        </span>
                        <span className={`absolute inset-0 inline-flex items-center justify-center gap-1 transition-all duration-200 ${copyFeedback.amount ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Copied</span>
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="p-4 bg-n-7 border border-n-6 rounded-lg mb-6">
                <h4 className="font-semibold text-n-1 mb-3">Payment Instructions:</h4>
                <ol className="space-y-2 text-sm text-n-3">
                  <li>1. Send exactly <span className="text-[#10B981] font-semibold">{purchaseData.cryptoAmount} {getCryptoInfo().symbol}</span> to the address above</li>
                  <li>2. We're monitoring the blockchain and will detect your payment automatically</li>
                  <li>3. After {transactionStatus.required} confirmations, your passes will be added to your account</li>
                  <li>4. You'll receive a receipt and can start using your passes immediately</li>
                </ol>
              </div>

              {/* Transaction Status */}
              <div className="text-center">
                {paymentIssue ? (
                  <div className={`inline-flex items-center gap-3 px-6 py-4 border rounded-lg ${
                    paymentIssue.status === 'failed' ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'
                  }`}>
                    <svg className={`w-5 h-5 ${paymentIssue.status === 'failed' ? 'text-red-500' : 'text-orange-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.732-3l-7-12a2 2 0 00-3.464 0l-7 12A2 2 0 005 19z" />
                    </svg>
                    <span className={`${paymentIssue.status === 'failed' ? 'text-red-400' : 'text-orange-400'} font-semibold`}>
                      {paymentIssue.message}
                    </span>
                  </div>
                ) : transactionStatus.detected ? (
                  <div className="space-y-4">
                    {/* Transaction Detected */}
                    <div className="p-4 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-[#10B981]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-[#10B981] font-semibold">Payment Detected!</span>
                      </div>
                      <div className="text-xs text-n-3 font-mono">
                        TX: {transactionStatus.transactionHash?.slice(0, 16)}...
                      </div>
                    </div>

                    {/* Confirmation Progress */}
                    <div className="p-4 bg-n-7 border border-n-6 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-n-3">Confirmations</span>
                        <span className="text-sm font-bold text-[#10B981]">
                          {transactionStatus.confirmations} / {transactionStatus.required}
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full bg-n-6 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-[#10B981] h-full transition-all duration-500 ease-out"
                          style={{ width: `${(transactionStatus.confirmations / transactionStatus.required) * 100}%` }}
                        />
                      </div>
                      {transactionStatus.confirmations < transactionStatus.required && (
                        <div className="flex items-center justify-center gap-2 mt-3">
                          <div className="w-4 h-4 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs text-n-4">Waiting for confirmations...</span>
                        </div>
                      )}
                    </div>

                    {/* Explorer Link */}
                    {transactionStatus.etherscanLink && (
                      <a
                        href={transactionStatus.etherscanLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-[#10B981] hover:text-[#059669] transition-colors"
                      >
                        <span>View on Explorer</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                ) : timeRemaining && timeRemaining.expired ? (
                  <div className="inline-flex items-center gap-3 px-6 py-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-red-500 font-semibold">Payment cancelled - Detection timeout reached</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-3 px-6 py-4 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg">
                    <div className="w-5 h-5 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[#10B981] font-semibold">Waiting for payment...</span>
                  </div>
                )}
              </div>

              {/* Back Button - Disabled if payment detected */}
              <button
                onClick={async () => {
                  if (transactionStatus.detected) return;
                  if (isExitConfirmRequired) {
                    setShowExitConfirm(true);
                    return;
                  }
                  await handleExitToSelection();
                }}
                disabled={transactionStatus.detected}
                className={`w-full mt-6 px-6 py-3 rounded-lg transition-colors ${
                  transactionStatus.detected
                    ? 'bg-n-7 text-n-5 cursor-not-allowed opacity-50'
                    : 'bg-n-7 hover:bg-n-6 text-n-1'
                }`}
                title={transactionStatus.detected ? 'Cannot go back after payment detected' : ''}
              >
                ← Back to Selection
              </button>
              {transactionStatus.detected && (
                <p className="text-xs text-n-4 text-center mt-2">
                  ⚠️ Back button disabled - Payment detected
                </p>
              )}

              {isExitConfirmRequired && showExitConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={() => setShowExitConfirm(false)}
                  />
                  <div className="relative z-10 w-full max-w-md mx-4">
                    <div className="relative bg-n-8 border border-red-500/50 rounded-2xl p-8 shadow-2xl">
                      <div className="flex justify-center mb-4">
                        <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-red-400 text-center mb-3">
                        Exit payment?
                      </h3>
                      <p className="text-n-3 text-center mb-6">
                        If you have already sent funds, do not exit this page. Please contact staff and report this incident.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => setShowExitConfirm(false)}
                          className="flex-1 py-3 px-6 bg-n-7 hover:bg-n-6 text-n-1 rounded-lg font-semibold transition-colors"
                        >
                          Stay on Payment
                        </button>
                        <button
                          onClick={handleExitToSelection}
                          className="flex-1 py-3 px-6 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                        >
                          Exit to Selection
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 'complete' && receiptData && (
          <div className="max-w-2xl mx-auto">
            <div className="p-8 bg-n-8 border border-[#10B981] rounded-2xl">
              {/* Success Animation */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-24 h-24 bg-[#10B981] rounded-full mb-4">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-3xl font-bold text-n-1 mb-2">Payment Successful!</h3>
                <p className="text-n-3">Your passes have been added to your account</p>
              </div>

              {/* Receipt */}
              <div className="p-6 bg-n-7 border border-n-6 rounded-xl mb-6">
                <h4 className="font-bold text-n-1 mb-4 text-center">Transaction Receipt</h4>
                <div className="space-y-3 text-sm">
                  {/* Transaction Hash */}
                  <div>
                    <span className="block text-n-4 mb-1">Transaction Hash:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-n-1 font-mono text-xs flex-1 truncate">{receiptData.transactionHash}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(receiptData.transactionHash);
                          toast.success('Transaction hash copied!');
                        }}
                        className="px-2 py-1 bg-n-6 hover:bg-n-5 text-n-1 text-xs rounded transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    {receiptData.etherscanLink && (
                      <a
                        href={receiptData.etherscanLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#10B981] hover:text-[#059669] mt-1"
                      >
                        View on Explorer
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>

                  {/* Sender Address */}
                  {receiptData.transactionDetails?.fromAddress && (
                    <div>
                      <span className="block text-n-4 mb-1">From Address:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-n-1 font-mono text-xs flex-1 truncate">{receiptData.transactionDetails.fromAddress}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(receiptData.transactionDetails.fromAddress);
                            toast.success('Address copied!');
                          }}
                          className="px-2 py-1 bg-n-6 hover:bg-n-5 text-n-1 text-xs rounded transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-n-6 pt-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-n-4">Pass Type:</span>
                      <span className="text-n-1 font-semibold">{receiptData.passType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-n-4">Amount Paid:</span>
                      <span className="text-n-1 font-semibold">{receiptData.amount} {receiptData.cryptocurrency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-n-4">Passes Added:</span>
                      <span className="text-[#10B981] font-bold text-lg">+{receiptData.passCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-n-4">New Balance:</span>
                      <span className="text-n-1 font-bold">
                        {receiptData.newBalance ?? '--'}
                        {receiptData.newBalance != null ? ' passes' : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-n-4">Date:</span>
                      <span className="text-n-1">{new Date(receiptData.completedAt).toLocaleString()}</span>
                    </div>
                    {receiptData.transactionDetails?.networkFee && (
                      <div className="flex justify-between">
                        <span className="text-n-4">Network Fee:</span>
                        <span className="text-n-3 text-xs">{receiptData.transactionDetails.networkFee.toFixed(8)} {receiptData.cryptocurrency}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <Button className="w-full" onClick={() => {
                  navigate('/trade-hub');
                }}>
                  Start Trading
                </Button>
                <button
                  onClick={() => {
                    setReceiptData(null);
                    setStep('select');
                    setSelectedPass(passes[0]);
                    setPaymentIssue(null);
                  }}
                  className="w-full px-6 py-3 bg-n-7 hover:bg-n-6 text-n-1 rounded-lg transition-colors"
                >
                  Buy More Passes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
};

export default PassesPurchase;
