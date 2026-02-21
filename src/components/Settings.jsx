import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from './Header';
import Button from './Button';
import AdminPanel from './AdminPanel';
import ModeratorPanel from './ModeratorPanel';
import VerificationCodeInput from './VerificationCodeInput';
import { passAPI } from '../services/api';
import { getRankGradientClass, getRankLabel } from '../utils/rankDisplay';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;
const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;
const SECURITY_CODE_LENGTH = 5;

const Settings = () => {
  const {
    user,
    logout,
    updateProfile,
    requestTwoFactorCode,
    verifyTwoFactorCode,
    disableTwoFactor,
    requestEmailChangeCurrentCode,
    resendEmailChangeCurrentCode,
    verifyEmailChangeCurrentCode,
    resendEmailChangeNewCode,
    verifyEmailChangeNewCode
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    avatar: user?.avatar || ''
  });
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [copiedTxnId, setCopiedTxnId] = useState(null);
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [isSecuritySubmitting, setIsSecuritySubmitting] = useState(false);
  const [isTwoFactorModalOpen, setIsTwoFactorModalOpen] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorCooldown, setTwoFactorCooldown] = useState(0);
  const [disableTwoFactorPassword, setDisableTwoFactorPassword] = useState('');
  const [isEmailChangeModalOpen, setIsEmailChangeModalOpen] = useState(false);
  const [isEmailChangeSubmitting, setIsEmailChangeSubmitting] = useState(false);
  const [emailChangeStep, setEmailChangeStep] = useState('current');
  const [emailChangeSessionToken, setEmailChangeSessionToken] = useState('');
  const [emailChangeTargetEmail, setEmailChangeTargetEmail] = useState('');
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [emailChangeCurrentCooldown, setEmailChangeCurrentCooldown] = useState(0);
  const [emailChangeNewCooldown, setEmailChangeNewCooldown] = useState(0);
  const [emailChangeMessage, setEmailChangeMessage] = useState('');
  const [emailChangeError, setEmailChangeError] = useState('');
  const fileInputRef = useRef(null);
  const hasAutoOpenedTwoFactorRef = useRef(false);
  const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
  const MAX_AVATAR_SIZE_MB = 5;
  const rankLabel = getRankLabel(user?.rank);
  const rankGradientClass = getRankGradientClass(user?.rank);

  const formatFileSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)}MB`;

  const getFriendlyProfileError = (errorMessage) => {
    if (!errorMessage) {
      return 'Something went wrong updating your profile. Please try again.';
    }

    const message = String(errorMessage);
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('413') ||
      lowerMessage.includes('payload too large') ||
      lowerMessage.includes('request entity too large') ||
      lowerMessage.includes('file too large') ||
      lowerMessage.includes('size limit')
    ) {
      return `That image is too large. Please keep avatars under ${MAX_AVATAR_SIZE_MB}MB and try again.`;
    }

    if (
      lowerMessage.includes('unsupported media type') ||
      lowerMessage.includes('invalid file type') ||
      lowerMessage.includes('file type')
    ) {
      return `That file type isn't supported. Please use JPG, PNG, GIF, WEBP, or SVG under ${MAX_AVATAR_SIZE_MB}MB.`;
    }

    if (
      lowerMessage.includes('network error') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('failed to fetch')
    ) {
      return 'We could not reach the server. Check your connection and try again.';
    }

    return message;
  };

  // Handle tab query parameter
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'transactions') {
      setActiveTab('transactions');
    } else if (tab === 'security') {
      setActiveTab('security');
    } else if (tab === 'admin' && user?.rank === 'developer') {
      setActiveTab('admin');
    } else if (tab === 'moderator' && user?.role === 'moderator') {
      setActiveTab('moderator');
    }
  }, [searchParams, user]);

  useEffect(() => {
    const shouldOpenTwoFactorOnboarding = searchParams.get('setup2fa') === '1';
    if (!shouldOpenTwoFactorOnboarding || !user || hasAutoOpenedTwoFactorRef.current) {
      return;
    }

    hasAutoOpenedTwoFactorRef.current = true;
    setActiveTab('security');
    setSecurityError('');
    setSecurityMessage('');
    setIsTwoFactorModalOpen(true);
    navigate('/settings?tab=security', { replace: true });
  }, [searchParams, user, navigate]);

  useEffect(() => {
    if (activeTab !== 'transactions' || !user) return;

    let isMounted = true;
    const fetchTransactionHistory = async () => {
      setIsHistoryLoading(true);
      setHistoryError('');
      try {
        const response = await passAPI.getTransactionHistory();
        if (isMounted) {
          setTransactionHistory(response.transactions || []);
        }
      } catch (error) {
        console.error('Error loading transaction history:', error);
        if (isMounted) {
          setHistoryError('Unable to load transaction history.');
          setTransactionHistory([]);
        }
      } finally {
        if (isMounted) {
          setIsHistoryLoading(false);
        }
      }
    };

    fetchTransactionHistory();
    return () => {
      isMounted = false;
    };
  }, [activeTab, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      username: user.username || '',
      email: user.email || '',
      avatar: user.avatar || ''
    }));
  }, [user?.username, user?.email, user?.avatar]);

  useEffect(() => {
    if (twoFactorCooldown <= 0) return;
    const timer = setInterval(() => {
      setTwoFactorCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [twoFactorCooldown]);

  useEffect(() => {
    if (emailChangeCurrentCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailChangeCurrentCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailChangeCurrentCooldown]);

  useEffect(() => {
    if (emailChangeNewCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailChangeNewCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailChangeNewCooldown]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    if (name === 'username') {
      nextValue = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, USERNAME_MAX_LENGTH);
    }

    setFormData({
      ...formData,
      [name]: nextValue
    });
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    const normalizedUsername = formData.username.trim();
    if (!normalizedUsername) {
      setMessage('Username is required.');
      return;
    }

    const normalizedEmail = formData.email.trim().toLowerCase();
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      setMessage('Please enter a valid email address.');
      return;
    }

    const currentEmail = String(user?.email || '').trim().toLowerCase();
    const currentUsername = String(user?.username || '').trim();
    const currentAvatar = String(user?.avatar || '');
    const usernameChanged = normalizedUsername !== currentUsername;
    const emailChanged = normalizedEmail !== currentEmail;
    const profileChanged =
      usernameChanged ||
      String(formData.avatar || '') !== currentAvatar;

    if (
      usernameChanged &&
      (
        normalizedUsername.length < USERNAME_MIN_LENGTH ||
        normalizedUsername.length > USERNAME_MAX_LENGTH ||
        !USERNAME_REGEX.test(normalizedUsername)
      )
    ) {
      setMessage(`Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and contain letters and numbers only.`);
      return;
    }

    if (!profileChanged && !emailChanged) {
      setMessage('No profile changes to save.');
      return;
    }

    if (profileChanged) {
      const profileResult = await updateProfile({
        ...formData,
        username: normalizedUsername,
        email: currentEmail
      });

      if (!profileResult.success) {
        setMessage(getFriendlyProfileError(profileResult.error));
        return;
      }
    }

    if (emailChanged) {
      const emailFlow = await startEmailChangeFlow(normalizedEmail);
      if (!emailFlow.success) {
        setMessage(
          profileChanged
            ? `Profile updated successfully, but email change could not start: ${emailFlow.error || 'Please try again.'}`
            : (emailFlow.error || 'Failed to start secure email change.')
        );
        return;
      }

      setMessage(
        profileChanged
          ? 'Profile updated successfully. Complete email verification to finish your email change.'
          : 'Verification started successfully. Complete email verification to finish your email change.'
      );
      setIsEditing(false);
      return;
    }

    setMessage('Profile updated successfully!');
    setIsEditing(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const resetSecurityFeedback = () => {
    setSecurityError('');
    setSecurityMessage('');
  };

  const openTwoFactorModal = () => {
    resetSecurityFeedback();
    setIsTwoFactorModalOpen(true);
  };

  const closeTwoFactorModal = () => {
    if (isSecuritySubmitting) {
      return;
    }
    setIsTwoFactorModalOpen(false);
  };

  const handleRequestTwoFactorCode = async () => {
    if (isSecuritySubmitting) {
      return;
    }

    setIsSecuritySubmitting(true);
    resetSecurityFeedback();

    const result = await requestTwoFactorCode();
    if (result.success) {
      setSecurityMessage(result.message || 'Verification code sent.');
      setTwoFactorCooldown(result.cooldownSeconds || 30);
    } else {
      setSecurityError(result.error || 'Failed to send verification code.');
      if (result.cooldownSeconds) {
        setTwoFactorCooldown(result.cooldownSeconds);
      }
    }

    setIsSecuritySubmitting(false);
  };

  const handleVerifyTwoFactorCode = async () => {
    if (isSecuritySubmitting) {
      return;
    }

    const code = twoFactorCode.replace(/\D/g, '').slice(0, SECURITY_CODE_LENGTH);
    if (code.length !== SECURITY_CODE_LENGTH) {
      setSecurityError(`Please enter the ${SECURITY_CODE_LENGTH}-digit code.`);
      setSecurityMessage('');
      return;
    }

    setIsSecuritySubmitting(true);
    resetSecurityFeedback();

    const result = await verifyTwoFactorCode(code);
    if (result.success) {
      setSecurityMessage(result.message || 'Two-factor code verified.');
      setTwoFactorCode('');
    } else {
      setSecurityError(result.error || 'Failed to verify code.');
    }

    setIsSecuritySubmitting(false);
  };

  const handleDisableTwoFactor = async () => {
    if (isSecuritySubmitting) {
      return;
    }

    if (!disableTwoFactorPassword) {
      setSecurityError('Enter your current password to disable two-factor authentication.');
      setSecurityMessage('');
      return;
    }

    setIsSecuritySubmitting(true);
    resetSecurityFeedback();

    const result = await disableTwoFactor(disableTwoFactorPassword);
    if (result.success) {
      setSecurityMessage(result.message || 'Two-factor authentication disabled.');
      setDisableTwoFactorPassword('');
      setTwoFactorCode('');
      setTwoFactorCooldown(0);
    } else {
      setSecurityError(result.error || 'Failed to disable two-factor authentication.');
    }

    setIsSecuritySubmitting(false);
  };

  const resetEmailChangeFeedback = () => {
    setEmailChangeError('');
    setEmailChangeMessage('');
  };

  const resetEmailChangeFlow = () => {
    setEmailChangeStep('current');
    setEmailChangeSessionToken('');
    setEmailChangeTargetEmail('');
    setEmailChangeCode('');
    setEmailChangeCurrentCooldown(0);
    setEmailChangeNewCooldown(0);
    setEmailChangeError('');
    setEmailChangeMessage('');
    setIsEmailChangeSubmitting(false);
  };

  const closeEmailChangeModal = () => {
    if (isEmailChangeSubmitting) {
      return;
    }

    setIsEmailChangeModalOpen(false);
    resetEmailChangeFlow();
  };

  const startEmailChangeFlow = async (nextEmail) => {
    if (isEmailChangeSubmitting) {
      return { success: false };
    }

    setIsEmailChangeSubmitting(true);
    resetEmailChangeFeedback();

    const result = await requestEmailChangeCurrentCode(nextEmail);
    if (!result.success) {
      const nextError = result.error || 'Failed to start email verification.';
      setEmailChangeError(nextError);
      if (result.cooldownSeconds) {
        setEmailChangeCurrentCooldown(result.cooldownSeconds);
      }
      setIsEmailChangeSubmitting(false);
      return { success: false, error: nextError };
    }

    setEmailChangeStep('current');
    setEmailChangeSessionToken(result.verificationSessionToken || '');
    setEmailChangeTargetEmail(nextEmail);
    setEmailChangeCode('');
    setEmailChangeCurrentCooldown(result.cooldownSeconds || 30);
    setEmailChangeNewCooldown(0);
    setEmailChangeMessage(result.message || 'Verification code sent to your current email.');
    setEmailChangeError('');
    setIsEmailChangeModalOpen(true);
    setIsEmailChangeSubmitting(false);
    return { success: true };
  };

  const handleResendEmailChangeCode = async () => {
    if (isEmailChangeSubmitting || !emailChangeSessionToken) {
      return;
    }

    const isCurrentStep = emailChangeStep === 'current';
    if (isCurrentStep && emailChangeCurrentCooldown > 0) {
      return;
    }
    if (!isCurrentStep && emailChangeNewCooldown > 0) {
      return;
    }

    setIsEmailChangeSubmitting(true);
    resetEmailChangeFeedback();

    const result = isCurrentStep
      ? await resendEmailChangeCurrentCode(emailChangeSessionToken)
      : await resendEmailChangeNewCode(emailChangeSessionToken);

    if (!result.success) {
      setEmailChangeError(result.error || 'Failed to resend verification code.');
      if (result.cooldownSeconds) {
        if (isCurrentStep) {
          setEmailChangeCurrentCooldown(result.cooldownSeconds);
        } else {
          setEmailChangeNewCooldown(result.cooldownSeconds);
        }
      }
      setIsEmailChangeSubmitting(false);
      return;
    }

    setEmailChangeMessage(result.message || 'Verification code resent.');
    if (isCurrentStep) {
      setEmailChangeCurrentCooldown(result.cooldownSeconds || 30);
    } else {
      setEmailChangeNewCooldown(result.cooldownSeconds || 30);
    }
    setIsEmailChangeSubmitting(false);
  };

  const handleSubmitEmailChangeCode = async () => {
    if (isEmailChangeSubmitting) {
      return;
    }

    const code = emailChangeCode.replace(/\D/g, '').slice(0, SECURITY_CODE_LENGTH);
    if (code.length !== SECURITY_CODE_LENGTH) {
      setEmailChangeError(`Please enter the ${SECURITY_CODE_LENGTH}-digit code.`);
      setEmailChangeMessage('');
      return;
    }

    if (!emailChangeSessionToken) {
      setEmailChangeError('Email verification session expired. Start again.');
      setEmailChangeMessage('');
      return;
    }

    setIsEmailChangeSubmitting(true);
    resetEmailChangeFeedback();

    if (emailChangeStep === 'current') {
      const result = await verifyEmailChangeCurrentCode({
        verificationSessionToken: emailChangeSessionToken,
        code
      });

      if (!result.success) {
        setEmailChangeError(result.error || 'Failed to verify current email code.');
        setIsEmailChangeSubmitting(false);
        return;
      }

      setEmailChangeStep('new');
      setEmailChangeCode('');
      setEmailChangeMessage(result.message || 'Current email verified. Check your new email for the next code.');
      setEmailChangeNewCooldown(result.cooldownSeconds || 30);
      setIsEmailChangeSubmitting(false);
      return;
    }

    const result = await verifyEmailChangeNewCode({
      verificationSessionToken: emailChangeSessionToken,
      code
    });

    if (!result.success) {
      setEmailChangeError(result.error || 'Failed to verify new email code.');
      setIsEmailChangeSubmitting(false);
      return;
    }

    setEmailChangeMessage(result.message || 'Email updated successfully.');
    setMessage('Email updated successfully!');
    setFormData((prev) => ({
      ...prev,
      email: emailChangeTargetEmail
    }));
    setIsEditing(false);

    setTimeout(() => {
      setIsEmailChangeModalOpen(false);
      resetEmailChangeFlow();
    }, 900);

    setIsEmailChangeSubmitting(false);
  };

  // Handle file upload
  const handleFileUpload = (file) => {
    setUploadError('');
    setMessage('');

    if (!file) {
      setUploadError('No file selected. Please choose an image to upload.');
      return;
    }
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      setUploadError(`That file type isn't supported. Please upload JPG, PNG, GIF, WEBP, or SVG under ${MAX_AVATAR_SIZE_MB}MB.`);
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      const readableSize = formatFileSize(file.size);
      setUploadError(`That image is ${readableSize} and exceeds the ${MAX_AVATAR_SIZE_MB}MB limit. Please choose a smaller image or resize it and try again.`);
      return;
    }

    // Create a preview URL
    const reader = new FileReader();
    reader.onerror = () => {
      setUploadError('We could not read that image. Please try a different file.');
    };
    reader.onloadend = () => {
      setFormData({
        ...formData,
        avatar: reader.result
      });
      setMessage('Avatar preview loaded. Click "Update Avatar" to save.');
    };
    reader.readAsDataURL(file);
  };

  // Handle drag and drop
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // Trigger file input click
  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  // Function to copy to clipboard
  const copyToClipboard = (text, txnId) => {
    navigator.clipboard.writeText(text);
    setCopiedTxnId(txnId);
    setMessage('Transaction ID copied to clipboard!');
    setTimeout(() => {
      setMessage('');
      setCopiedTxnId(null);
    }, 2000);
  };

  const totalDeals = 0;
  const totalUsdValue = 0;
  const totalPassesUsed = 0;

  // Calculate total passes used (1 per transaction)

  return (
    <div className="pt-[4.75rem] lg:pt-[5.25rem] overflow-hidden">
      <Header />
      
      <div className="container mx-auto px-4 py-12">
        <h1 className="h1 mb-8 text-n-1">Settings</h1>
        
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="bg-n-7 border border-n-6 rounded-xl p-4">
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'profile' ? 'bg-n-6 text-n-1' : 'text-n-3 hover:bg-n-6/50 hover:text-n-1'
                  }`}
                >
                  Profile
                </button>
                <button
                  onClick={() => setActiveTab('avatar')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'avatar' ? 'bg-n-6 text-n-1' : 'text-n-3 hover:bg-n-6/50 hover:text-n-1'
                  }`}
                >
                  Avatar
                </button>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'transactions' ? 'bg-n-6 text-n-1' : 'text-n-3 hover:bg-n-6/50 hover:text-n-1'
                  }`}
                >
                  Transaction History
                </button>
                <button
                  onClick={() => setActiveTab('security')}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'security' ? 'bg-n-6 text-n-1' : 'text-n-3 hover:bg-n-6/50 hover:text-n-1'
                  }`}
                >
                  Security
                </button>

                {/* Admin Panel - Only for developers */}
                {user?.rank === 'developer' && (
                  <>
                    <div className="border-t border-n-6 my-2"></div>
                    <button
                      onClick={() => setActiveTab('admin')}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                        activeTab === 'admin' ? 'bg-[#ef4444]/20 text-[#ef4444]' : 'text-[#ef4444]/70 hover:bg-[#ef4444]/10 hover:text-[#ef4444]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>Admin Panel</span>
                      </div>
                    </button>
                  </>
                )}

                {/* Moderator Panel */}
                {user?.role === 'moderator' && (
                  <>
                    <div className="border-t border-n-6 my-2"></div>
                    <button
                      onClick={() => setActiveTab('moderator')}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                        activeTab === 'moderator' ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-[#10B981]/70 hover:bg-[#10B981]/10 hover:text-[#10B981]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>Moderator Panel</span>
                      </div>
                    </button>
                  </>
                )}
              </nav>
              
              <div className="mt-6 pt-6 border-t border-n-6">
                <Button onClick={handleLogout} className="w-full" white>
                  Logout
                </Button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-n-7 border border-n-6 rounded-xl p-6">
              
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="h3 text-n-1">Profile Information</h2>
                    {!isEditing && (
                      <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
                    )}
                  </div>

                  {message && (
                    <div className={`mb-6 p-4 rounded-lg ${message.includes('success') ? 'bg-color-4/10 border border-color-4/50 text-color-4' : 'bg-color-3/10 border border-color-3/50 text-color-3'}`}>
                      {message}
                    </div>
                  )}

                  {isEditing ? (
                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                      <div>
                        <label className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                          Username
                        </label>
                        <input
                          type="text"
                          name="username"
                          value={formData.username}
                          onChange={handleChange}
                          className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                          maxLength={USERNAME_MAX_LENGTH}
                          pattern="[A-Za-z0-9]+"
                          autoCapitalize="none"
                          autoCorrect="off"
                        />
                        <p className="text-xs text-n-4 mt-2">
                          {USERNAME_MIN_LENGTH}-{USERNAME_MAX_LENGTH} characters, letters and numbers only.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                          Email
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          disabled={user?.rank === 'developer'}
                          className={`w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all ${
                            user?.rank === 'developer' ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        />
                        {user?.rank === 'developer' && (
                          <p className="text-xs text-n-4 mt-1">Email cannot be changed for developer accounts</p>
                        )}
                        {user?.rank !== 'developer' && (
                          <p className="text-xs text-n-4 mt-1">
                            Changing email requires two verification codes: one to your current email, then one to the new email.
                          </p>
                        )}
                      </div>
                      <div className="flex gap-4 pt-4">
                        <Button type="submit">Save Changes</Button>
                        <Button type="button" onClick={() => setIsEditing(false)} white>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-n-4 mb-1">Username</p>
                          <p className="text-n-1 text-lg">{user?.username}</p>
                        </div>
                        <div>
                          <p className="text-sm text-n-4 mb-1">Email</p>
                          <p className="text-n-1 text-lg">{user?.email}</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-n-4 mb-1">Rank</p>
                          {rankGradientClass ? (
                            <p className={`text-lg font-bold ${rankGradientClass}`}>{rankLabel}</p>
                          ) : (
                            <p className="text-n-1 text-lg">{rankLabel}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-n-4 mb-1">Member Since</p>
                          <p className="text-n-1 text-lg">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Avatar Tab */}
              {activeTab === 'avatar' && (
                <div>
                  <h2 className="h3 text-n-1 mb-6">Change Avatar</h2>
                  
                  {message && (
                    <div className={`mb-6 p-4 rounded-lg ${message.includes('success') || message.includes('preview') ? 'bg-color-4/10 border border-color-4/50 text-color-4' : 'bg-color-3/10 border border-color-3/50 text-color-3'}`}>
                      {message}
                    </div>
                  )}

                  {uploadError && (
                    <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400">
                      {uploadError}
                    </div>
                  )}

                  <div className="flex flex-col items-center gap-6">
                    {/* Avatar Preview */}
                    <div className="w-32 h-32 rounded-full bg-n-6 border-4 border-n-5 flex items-center justify-center text-4xl text-n-1 overflow-hidden">
                      {formData.avatar ? (
                        <img 
                          src={formData.avatar} 
                          alt="Avatar" 
                          className="w-full h-full object-cover"
                          style={{ imageRendering: formData.avatar.endsWith('.gif') ? 'auto' : 'auto' }}
                        />
                      ) : (
                        user?.username?.charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* Drag and Drop Zone */}
                    <div
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`w-full max-w-md p-8 border-2 border-dashed rounded-xl transition-all duration-300 ${
                        isDragging 
                          ? 'border-color-4 bg-color-4/10' 
                          : 'border-n-6 bg-n-6/30 hover:border-n-5'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-4">
                        <svg 
                          className={`w-16 h-16 transition-colors ${isDragging ? 'text-color-4' : 'text-n-4'}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                          />
                        </svg>
                        
                        <div className="text-center">
                          <p className="text-n-1 mb-1">
                            {isDragging ? 'Drop your image here' : 'Drag & drop your image here'}
                          </p>
                          <p className="text-sm text-n-4">or</p>
                        </div>

                        <Button onClick={handleSelectFile} className="px-6">
                          Select from Computer
                        </Button>

                        <p className="text-xs text-n-4 text-center">
                          Supported formats: JPG, PNG, GIF, WEBP, SVG<br />
                          Maximum size: 5MB
                        </p>
                      </div>

                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                    </div>

                    {/* URL Input Option */}
                    <div className="w-full max-w-md">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-n-6"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                          <span className="px-2 bg-n-7 text-n-4">Or use URL</span>
                        </div>
                      </div>

                      <div className="mt-6">
                        <label className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                          Avatar URL
                        </label>
                        <input
                          type="text"
                          name="avatar"
                          value={formData.avatar}
                          onChange={handleChange}
                          placeholder="https://example.com/avatar.jpg"
                          className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                        />
                        <p className="text-xs text-n-4 mt-2">Enter an image URL for your profile picture</p>
                      </div>

                      <Button onClick={handleUpdateProfile} className="mt-6 w-full">
                        Update Avatar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Transaction History Tab */}
              {activeTab === 'transactions' && (
                <div>
                  <div className="mb-6">
                    <h2 className="h3 text-n-1 mb-2">Transaction History</h2>
                    <p className="text-n-3">Orders history</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-n-6 p-4 rounded-lg">
                      <p className="text-n-4 text-sm mb-1">Total Deals</p>
                      <p className="text-2xl font-bold text-n-1">{totalDeals}</p>
                    </div>
                    <div className="bg-n-6 p-4 rounded-lg">
                      <p className="text-n-4 text-sm mb-1">Total USD Value</p>
                      <p className="text-2xl font-bold text-n-1">
                        ${totalUsdValue.toFixed(2)} USD
                      </p>
                    </div>
                    <div className="bg-n-6 p-4 rounded-lg">
                      <p className="text-n-4 text-sm mb-1">Total Passes Used</p>
                      <p className="text-2xl font-bold text-color-4">{totalPassesUsed}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-n-6">
                          <th className="text-left py-3 px-4 text-n-3 text-sm font-code">Incoming TXN</th>
                          <th className="text-left py-3 px-4 text-n-3 text-sm font-code">Outgoing TXN</th>
                          <th className="text-left py-3 px-4 text-n-3 text-sm font-code">Counterparty</th>
                          <th className="text-left py-3 px-4 text-n-3 text-sm font-code">Crypto</th>
                          <th className="text-left py-3 px-4 text-n-3 text-sm font-code">Amount</th>
                          <th className="text-left py-3 px-4 text-n-3 text-sm font-code">Date</th>
                          <th className="text-left py-3 px-4 text-n-3 text-sm font-code">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isHistoryLoading ? (
                          <tr>
                            <td colSpan="7" className="py-6 text-center text-n-4 text-sm">
                              Loading transaction history...
                            </td>
                          </tr>
                        ) : historyError ? (
                          <tr>
                            <td colSpan="7" className="py-6 text-center text-red-400 text-sm">
                              {historyError}
                            </td>
                          </tr>
                        ) : transactionHistory.length > 0 ? (
                          transactionHistory.map((tx) => {
                            const incomingTxnId = tx.incomingTxnId || 'NaN';
                            const outgoingTxnId = tx.outgoingTxnId || '';
                            const hasIncoming = incomingTxnId !== 'NaN';
                            const hasOutgoing = Boolean(outgoingTxnId) && outgoingTxnId !== 'NaN';
                            const amountUSD = Number(tx.amountUSD);
                            const amountDisplay = Number.isFinite(amountUSD) ? `$${amountUSD.toFixed(2)}` : '--';
                            const dateDisplay = tx.purchasedAt
                              ? new Date(tx.purchasedAt).toLocaleDateString()
                              : '--';
                            const rowKey = tx.orderId || tx.id;

                            return (
                              <tr key={rowKey} className="border-b border-n-6 hover:bg-n-6/30 transition-colors">
                                {/* Incoming Transaction (Sender → Bot) */}
                                <td className="py-3 px-4">
                                  {hasIncoming ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-n-1 text-sm font-mono">{incomingTxnId.substring(0, 12)}...</span>
                                      <button
                                        onClick={() => copyToClipboard(incomingTxnId, `${rowKey}-in`)}
                                        className={`transition-colors ${
                                          copiedTxnId === `${rowKey}-in` ? 'text-color-4' : 'text-n-4 hover:text-color-4'
                                        }`}
                                        title={copiedTxnId === `${rowKey}-in` ? 'Copied!' : 'Copy incoming TXN'}
                                      >
                                        {copiedTxnId === `${rowKey}-in` ? (
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                        ) : (
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-n-4 text-sm italic">NaN</span>
                                  )}
                                </td>
                                {/* Outgoing Transaction (Bot → Receiver) */}
                                <td className="py-3 px-4">
                                  {hasOutgoing ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-n-1 text-sm font-mono">{outgoingTxnId.substring(0, 12)}...</span>
                                      <button
                                        onClick={() => copyToClipboard(outgoingTxnId, `${rowKey}-out`)}
                                        className={`transition-colors ${
                                          copiedTxnId === `${rowKey}-out` ? 'text-color-4' : 'text-n-4 hover:text-color-4'
                                        }`}
                                        title={copiedTxnId === `${rowKey}-out` ? 'Copied!' : 'Copy outgoing TXN'}
                                      >
                                        {copiedTxnId === `${rowKey}-out` ? (
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                        ) : (
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-n-4 text-sm italic">Pending...</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-color-4 text-sm font-semibold">{tx.counterparty}</td>
                                <td className="py-3 px-4">
                                  <span className="px-2 py-1 bg-n-5/50 text-n-1 text-xs font-mono rounded font-bold">
                                    {tx.cryptocurrency}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-n-1 text-sm font-semibold">{amountDisplay}</td>
                                <td className="py-3 px-4 text-n-3 text-sm">{dateDisplay}</td>
                                <td className="py-3 px-4">
                                  <span className={`px-3 py-1 text-xs rounded font-semibold capitalize ${
                                    tx.status === 'completed' ? 'bg-color-4/20 text-color-4' :
                                    tx.status === 'pending' ? 'bg-n-5/50 text-n-1' :
                                    tx.status === 'refunded' ? 'bg-purple-500/20 text-purple-400' :
                                    tx.status === 'inactive' ? 'bg-red-500/20 text-red-400' :
                                    'bg-n-5/20 text-n-3'
                                  }`}>
                                    {tx.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="7" className="py-6 text-center text-n-4 text-sm">
                              No pass transactions yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div>
                  <h2 className="h3 text-n-1 mb-6">Security Settings</h2>
                  <div className="space-y-6">
                    {(securityMessage || securityError) && (
                      <div
                        className={`p-4 rounded-lg ${
                          securityError
                            ? 'bg-color-3/10 border border-color-3/50 text-color-3'
                            : 'bg-color-4/10 border border-color-4/50 text-color-4'
                        }`}
                      >
                        {securityError || securityMessage}
                      </div>
                    )}
                    <div className="p-4 bg-n-6 rounded-lg">
                      <h3 className="text-n-1 font-semibold mb-2">Change Password</h3>
                      <p className="text-n-3 text-sm">Use the &quot;Forgot Password?&quot; flow on sign-in to securely reset your password.</p>
                    </div>
                    <div className="p-4 bg-n-6 rounded-lg">
                      <h3 className="text-n-1 font-semibold mb-2">Two-Factor Authentication</h3>
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <p className="text-n-3 text-sm">Protect your account with a verification code sent to your email at login.</p>
                        <span className={`px-3 py-1 text-xs rounded-full font-semibold ${
                          user?.twoFactorEnabled
                            ? 'bg-color-4/20 text-color-4'
                            : 'bg-color-3/20 text-color-3'
                        }`}>
                          {user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <Button onClick={openTwoFactorModal} className="min-w-[220px]">
                        Manage 2FA
                      </Button>
                    </div>
                    <div className="p-4 bg-n-6 rounded-lg">
                      <h3 className="text-n-1 font-semibold mb-2">Active Sessions</h3>
                      <p className="text-n-3 text-sm mb-2">Last login: {user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'N/A'}</p>
                      <p className="text-n-4 text-xs">Manage your active sessions across devices</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Panel Tab - Only for developers */}
              {activeTab === 'admin' && user?.rank === 'developer' && (
                <AdminPanel />
              )}

              {/* Moderator Panel Tab */}
              {activeTab === 'moderator' && user?.role === 'moderator' && (
                <ModeratorPanel />
              )}

            </div>
          </div>
        </div>
      </div>

      {isTwoFactorModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-n-8 border border-n-6 rounded-2xl shadow-2xl">
            <div className="px-5 sm:px-6 py-4 border-b border-n-6 flex items-center justify-between">
              <div>
                <h3 className="text-n-1 text-lg font-semibold">Two-Factor Authentication</h3>
                <p className="text-xs text-n-4 mt-1">Secure login with a 5-digit email verification code.</p>
              </div>
              <button
                type="button"
                onClick={closeTwoFactorModal}
                disabled={isSecuritySubmitting}
                className="text-n-4 hover:text-n-1 transition-colors disabled:opacity-50"
                aria-label="Close two-factor modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 sm:px-6 py-5 space-y-5">
              {(securityMessage || securityError) && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    securityError
                      ? 'bg-color-3/10 border border-color-3/50 text-color-3'
                      : 'bg-color-4/10 border border-color-4/50 text-color-4'
                  }`}
                >
                  {securityError || securityMessage}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-n-3">Status</span>
                <span className={`px-3 py-1 text-xs rounded-full font-semibold ${
                  user?.twoFactorEnabled
                    ? 'bg-color-4/20 text-color-4'
                    : 'bg-color-3/20 text-color-3'
                }`}>
                  {user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-n-4">Step 1: Send code</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={handleRequestTwoFactorCode}
                    disabled={isSecuritySubmitting || twoFactorCooldown > 0}
                    className="min-w-[180px]"
                  >
                    {twoFactorCooldown > 0 ? `Resend in ${twoFactorCooldown}s` : 'Send code'}
                  </Button>
                  <span className="text-xs text-n-4">Code expires in 10 minutes.</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-n-4">Step 2: Verify code</p>
                <VerificationCodeInput
                  value={twoFactorCode}
                  onChange={(nextCode) => {
                    setTwoFactorCode(nextCode.replace(/\D/g, '').slice(0, SECURITY_CODE_LENGTH));
                    setSecurityError('');
                    setSecurityMessage('');
                  }}
                  length={SECURITY_CODE_LENGTH}
                  disabled={isSecuritySubmitting}
                  autoFocus
                />
                <div className="flex justify-center">
                  <Button
                    onClick={handleVerifyTwoFactorCode}
                    disabled={isSecuritySubmitting}
                    className="min-w-[200px]"
                  >
                    {user?.twoFactorEnabled ? 'Verify code' : 'Enable 2FA'}
                  </Button>
                </div>
              </div>

              {user?.twoFactorEnabled && (
                <div className="pt-4 border-t border-n-6 space-y-2">
                  <p className="text-xs uppercase tracking-wider text-n-4">Disable 2FA (password required)</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="password"
                      value={disableTwoFactorPassword}
                      onChange={(event) => {
                        setDisableTwoFactorPassword(event.target.value);
                        setSecurityError('');
                        setSecurityMessage('');
                      }}
                      placeholder="Current password"
                      autoComplete="current-password"
                      className="w-full px-4 py-3 bg-n-7 border border-n-5 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                    />
                    <Button
                      onClick={handleDisableTwoFactor}
                      disabled={isSecuritySubmitting}
                      white
                      className="min-w-[170px]"
                    >
                      Disable 2FA
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isEmailChangeModalOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-n-8 border border-n-6 rounded-2xl shadow-2xl">
            <div className="px-5 sm:px-6 py-4 border-b border-n-6 flex items-center justify-between">
              <div>
                <h3 className="text-n-1 text-lg font-semibold">Verify Email Change</h3>
                <p className="text-xs text-n-4 mt-1">Step 1 verifies your current email. Step 2 verifies your new email.</p>
              </div>
              <button
                type="button"
                onClick={closeEmailChangeModal}
                disabled={isEmailChangeSubmitting}
                className="text-n-4 hover:text-n-1 transition-colors disabled:opacity-50"
                aria-label="Close email verification modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 sm:px-6 py-5 space-y-5">
              {(emailChangeMessage || emailChangeError) && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    emailChangeError
                      ? 'bg-color-3/10 border border-color-3/50 text-color-3'
                      : 'bg-color-4/10 border border-color-4/50 text-color-4'
                  }`}
                >
                  {emailChangeError || emailChangeMessage}
                </div>
              )}

              <div className="p-3 bg-n-7/80 border border-n-6 rounded-lg space-y-2 text-sm">
                <p className="text-n-3">
                  <span className="text-n-1 font-semibold">Current email:</span> {user?.email}
                </p>
                <p className="text-n-3 break-all">
                  <span className="text-n-1 font-semibold">New email:</span> {emailChangeTargetEmail}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-n-4">
                  {emailChangeStep === 'current'
                    ? 'Step 1: Code sent to current email'
                    : 'Step 2: Code sent to new email'}
                </p>
                <VerificationCodeInput
                  value={emailChangeCode}
                  onChange={(nextCode) => {
                    setEmailChangeCode(nextCode.replace(/\D/g, '').slice(0, SECURITY_CODE_LENGTH));
                    setEmailChangeError('');
                    setEmailChangeMessage('');
                  }}
                  length={SECURITY_CODE_LENGTH}
                  disabled={isEmailChangeSubmitting}
                  autoFocus
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <button
                  type="button"
                  onClick={handleResendEmailChangeCode}
                  disabled={
                    isEmailChangeSubmitting ||
                    (emailChangeStep === 'current'
                      ? emailChangeCurrentCooldown > 0
                      : emailChangeNewCooldown > 0)
                  }
                  className="text-sm text-[#10B981] hover:text-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                >
                  {emailChangeStep === 'current'
                    ? emailChangeCurrentCooldown > 0
                      ? `Resend in ${emailChangeCurrentCooldown}s`
                      : 'Resend current-email code'
                    : emailChangeNewCooldown > 0
                      ? `Resend in ${emailChangeNewCooldown}s`
                      : 'Resend new-email code'}
                </button>

                <Button
                  onClick={handleSubmitEmailChangeCode}
                  disabled={isEmailChangeSubmitting}
                  className="min-w-[220px]"
                >
                  {emailChangeStep === 'current' ? 'Verify current email' : 'Verify new email'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
