import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { toast } from "../utils/toast";

const API_URL = 'http://localhost:5001/api';

const CreateTradeRequestModal = ({ isOpen, onClose, onSuccess }) => {
  const { token } = useAuth();
  
  const [formData, setFormData] = useState({
    type: 'selling',
    itemOffered: '',
    itemDescription: '',
    priceAmount: '',
    priceCurrency: 'USD',
    cryptoOffered: null,
    paymentMethods: [],
    warrantyAvailable: false,
    warrantyDuration: 'none',
    expiryHours: 24
  });

  const cryptoOptions = [
    { value: 'bitcoin', label: 'Bitcoin (BTC)', color: '#F7931A' },
    { value: 'ethereum', label: 'Ethereum (ETH)', color: '#627EEA' },
    { value: 'litecoin', label: 'Litecoin (LTC)', color: '#345D9D' },
    { value: 'solana', label: 'Solana (SOL)', color: '#14F195' },
    { value: 'usdt-erc20', label: 'USDT (ERC-20)', color: '#26A17B' },
    { value: 'usdc-erc20', label: 'USDC (ERC-20)', color: '#2775CA' },
  ];

  const currencyOptions = [
    { value: 'USD', label: 'USD ($)' },
    { value: 'EUR', label: 'EUR (€)' },
    { value: 'GBP', label: 'GBP (£)' },
    { value: 'bitcoin', label: 'Bitcoin (BTC)' },
    { value: 'ethereum', label: 'Ethereum (ETH)' },
    { value: 'litecoin', label: 'Litecoin (LTC)' },
    { value: 'solana', label: 'Solana (SOL)' },
    { value: 'usdt-erc20', label: 'USDT' },
    { value: 'usdc-erc20', label: 'USDC' },
  ];

  const paymentMethodOptions = [
    { value: 'bitcoin', label: 'Bitcoin', icon: '₿' },
    { value: 'ethereum', label: 'Ethereum', icon: 'Ξ' },
    { value: 'litecoin', label: 'Litecoin', icon: 'Ł' },
    { value: 'solana', label: 'Solana', icon: '◎' },
    { value: 'usdt-erc20', label: 'USDT', icon: '₮' },
    { value: 'usdc-erc20', label: 'USDC', icon: '$' },
    { value: 'bank-transfer', label: 'Bank Transfer', icon: '🏦' },
    { value: 'paypal', label: 'PayPal', icon: 'P' },
    { value: 'zelle', label: 'Zelle', icon: 'Z' },
    { value: 'wise', label: 'Wise', icon: 'W' },
  ];

  const warrantyOptions = [
    { value: 'none', label: 'No Warranty' },
    { value: '24h', label: '24 Hours' },
    { value: '48h', label: '48 Hours' },
    { value: '7days', label: '7 Days' },
    { value: '14days', label: '14 Days' },
    { value: '30days', label: '30 Days' },
  ];

  const handlePaymentMethodToggle = (method) => {
    setFormData(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter(m => m !== method)
        : [...prev.paymentMethods, method]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate
    if (!formData.itemOffered || !formData.priceAmount) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.paymentMethods.length === 0) {
      toast.error('Please select at least one payment method');
      return;
    }

    try {
      const response = await axios.post(
        `${API_URL}/trade-requests`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        toast.success('Trade request created successfully!');
        onSuccess();
        onClose();
        
        // Reset form
        setFormData({
          type: 'selling',
          itemOffered: '',
          itemDescription: '',
          priceAmount: '',
          priceCurrency: 'USD',
          cryptoOffered: null,
          paymentMethods: [],
          warrantyAvailable: false,
          warrantyDuration: 'none',
          expiryHours: 24
        });
      }
    } catch (err) {
      console.error('Error creating trade request:', err);
      toast.error(err.response?.data?.message || 'Failed to create trade request');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-n-8 border border-n-6 rounded-2xl shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-n-6 bg-n-8">
          <h2 className="text-2xl font-bold text-n-1">Create Trade Request</h2>
          <button
            onClick={onClose}
            className="p-2 text-n-4 hover:text-n-1 transition-colors rounded-lg hover:bg-n-7"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Type Selection */}
          <div>
            <label className="block mb-3 text-sm font-semibold text-n-3">I am</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'selling' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.type === 'selling'
                    ? 'border-red-500 bg-red-500/10 text-red-400'
                    : 'border-n-6 bg-n-7 text-n-3 hover:border-n-5'
                }`}
              >
                <div className="text-lg font-bold">SELLING</div>
                <div className="text-xs">I have something to sell</div>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'buying' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.type === 'buying'
                    ? 'border-[#10B981] bg-[#10B981]/10 text-[#10B981]'
                    : 'border-n-6 bg-n-7 text-n-3 hover:border-n-5'
                }`}
              >
                <div className="text-lg font-bold">BUYING</div>
                <div className="text-xs">I want to buy something</div>
              </button>
            </div>
          </div>

          {/* Item Being Sold/Bought */}
          <div>
            <label className="block mb-3 text-sm font-semibold text-n-3">
              {formData.type === 'selling' ? 'What are you selling?' : 'What are you buying?'}
            </label>
            <input
              type="text"
              value={formData.itemOffered}
              onChange={(e) => setFormData({ ...formData, itemOffered: e.target.value })}
              placeholder={
                formData.type === 'selling' 
                  ? 'e.g., Bitcoin, Game Currency, In-Game Items, Gift Cards...' 
                  : 'e.g., Bitcoin, Game Currency, In-Game Items, Gift Cards...'
              }
              className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:border-[#10B981] focus:outline-none"
              required
            />
          </div>

          {/* Item Description */}
          <div>
            <label className="block mb-3 text-sm font-semibold text-n-3">Description (optional)</label>
            <textarea
              value={formData.itemDescription}
              onChange={(e) => setFormData({ ...formData, itemDescription: e.target.value })}
              placeholder="Provide details about the item, quantity, condition, etc..."
              rows={3}
              className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:border-[#10B981] focus:outline-none resize-none"
            />
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-3 text-sm font-semibold text-n-3">Price</label>
              <input
                type="number"
                step="0.01"
                value={formData.priceAmount}
                onChange={(e) => setFormData({ ...formData, priceAmount: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 focus:border-[#10B981] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block mb-3 text-sm font-semibold text-n-3">Currency</label>
              <select
                value={formData.priceCurrency}
                onChange={(e) => setFormData({ ...formData, priceCurrency: e.target.value })}
                className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 focus:border-[#10B981] focus:outline-none"
              >
                {currencyOptions.map(currency => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <label className="block mb-3 text-sm font-semibold text-n-3">Payment Methods (select all that apply)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {paymentMethodOptions.map(method => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => handlePaymentMethodToggle(method.value)}
                  className={`px-3 py-2 rounded-lg border transition-all text-sm font-medium ${
                    formData.paymentMethods.includes(method.value)
                      ? 'border-[#10B981] bg-[#10B981]/10 text-[#10B981]'
                      : 'border-n-6 bg-n-7 text-n-3 hover:border-n-5'
                  }`}
                >
                  <span className="mr-2">{method.icon}</span>
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          {/* Warranty */}
          <div>
            <label className="flex items-center gap-3 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.warrantyAvailable}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  warrantyAvailable: e.target.checked,
                  warrantyDuration: e.target.checked ? '24h' : 'none'
                })}
                className="w-5 h-5 accent-[#10B981]"
              />
              <span className="text-sm font-semibold text-n-3">Offer Warranty Protection</span>
            </label>
            
            {formData.warrantyAvailable && (
              <select
                value={formData.warrantyDuration}
                onChange={(e) => setFormData({ ...formData, warrantyDuration: e.target.value })}
                className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 focus:border-[#10B981] focus:outline-none"
              >
                {warrantyOptions.filter(w => w.value !== 'none').map(warranty => (
                  <option key={warranty.value} value={warranty.value}>
                    {warranty.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Expiry */}
          <div>
            <label className="block mb-3 text-sm font-semibold text-n-3">Listing Duration</label>
            <select
              value={formData.expiryHours}
              onChange={(e) => setFormData({ ...formData, expiryHours: parseInt(e.target.value) })}
              className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 focus:border-[#10B981] focus:outline-none"
            >
              <option value={6}>6 Hours</option>
              <option value={12}>12 Hours</option>
              <option value={24}>24 Hours</option>
              <option value={48}>2 Days</option>
              <option value={72}>3 Days</option>
              <option value={168}>7 Days</option>
            </select>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-n-7 hover:bg-n-6 text-n-3 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all shadow-lg shadow-[#10B981]/20"
            >
              Create Listing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTradeRequestModal;
