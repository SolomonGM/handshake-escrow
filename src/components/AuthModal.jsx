import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import ButtonSvg from '../assets/svg/ButtonSvg';
import { handshakeSymbol } from '../assets';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

const AuthModal = ({ isOpen, onClose, mode: initialMode }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode || 'login'); // 'login' | 'register' | 'forgot'
  const { login, register, verifyLoginTwoFactorCode, error, loading } = useAuth();
  const [loginStep, setLoginStep] = useState('credentials'); // 'credentials' | 'twoFactor'
  const [loginTwoFactorData, setLoginTwoFactorData] = useState({
    email: '',
    code: '',
    loginSessionToken: ''
  });
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false,
  });
  const [resetStep, setResetStep] = useState('email'); // 'email' | 'code' | 'password'
  const [resetData, setResetData] = useState({
    email: '',
    code: '',
    resetToken: '',
    password: '',
    confirmPassword: ''
  });
  const [localError, setLocalError] = useState('');
  const [localSuccess, setLocalSuccess] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [showShootingStar, setShowShootingStar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loginTwoFactorCooldown, setLoginTwoFactorCooldown] = useState(0);
  const prefillEmailRef = useRef('');
  const prefillResetEmailRef = useRef('');
  const [stars] = useState(() => 
    // Generate stars once and keep them consistent
    [...Array(50)].map(() => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: Math.random() > 0.5 ? 2 : 1,
      animationDelay: Math.random() * 3,
      animationDuration: 2 + Math.random() * 2,
      opacity: Math.random() * 0.7 + 0.3
    }))
  );

  // Shooting star effect every 10 seconds
  useEffect(() => {
    if (!isOpen) return;
    
    const shootingStarInterval = setInterval(() => {
      setShowShootingStar(true);
      setTimeout(() => setShowShootingStar(false), 2000);
    }, 10000);

    return () => clearInterval(shootingStarInterval);
  }, [isOpen]);

  // Reset form when mode changes
  useEffect(() => {
    setLoginStep('credentials');
    setLoginTwoFactorData({
      email: '',
      code: '',
      loginSessionToken: ''
    });
    setLoginTwoFactorCooldown(0);
    setFormData({
      username: '',
      email: prefillEmailRef.current || '',
      password: '',
      confirmPassword: '',
      acceptedTerms: false,
    });
    prefillEmailRef.current = '';
    setLocalError('');
    setLocalSuccess('');
    setResetStep('email');
    setResetData({
      email: prefillResetEmailRef.current || '',
      code: '',
      resetToken: '',
      password: '',
      confirmPassword: ''
    });
    prefillResetEmailRef.current = '';
    setResendCooldown(0);
    setIsSubmitting(false);
  }, [mode]);

  // Update mode when prop changes
  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (loginTwoFactorCooldown <= 0) return;
    const timer = setInterval(() => {
      setLoginTwoFactorCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [loginTwoFactorCooldown]);

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }

    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let nextValue = value;

    if (name === 'username') {
      nextValue = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, USERNAME_MAX_LENGTH).toLowerCase();
    }

    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : nextValue,
    });
    setLocalError('');
    setLocalSuccess('');
  };

  const openTermsAndConditions = (event) => {
    event.preventDefault();
    navigate('/docs/terms#user-responsibility');
  };

  const handleResetChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    if (name === 'code') {
      nextValue = value.replace(/\D/g, '').slice(0, 5);
    }

    setResetData((prev) => ({
      ...prev,
      [name]: nextValue
    }));
    setLocalError('');
    setLocalSuccess('');
  };

  const handleLoginTwoFactorCodeChange = (event) => {
    const code = event.target.value.replace(/\D/g, '').slice(0, 5);
    setLoginTwoFactorData((prev) => ({
      ...prev,
      code
    }));
    setLocalError('');
    setLocalSuccess('');
  };

  const handleResendLoginTwoFactorCode = async () => {
    if (isSubmitting || loginTwoFactorCooldown > 0) {
      return;
    }

    if (!loginTwoFactorData.email || !loginTwoFactorData.loginSessionToken) {
      setLocalError('Your verification session expired. Please sign in again.');
      setLoginStep('credentials');
      return;
    }

    setIsSubmitting(true);
    setLocalError('');
    setLocalSuccess('');

    try {
      const response = await authAPI.resendLoginTwoFactorCode({
        email: loginTwoFactorData.email,
        loginSessionToken: loginTwoFactorData.loginSessionToken
      });

      setLoginTwoFactorCooldown(response.cooldownSeconds || 30);
      setLocalSuccess('A new verification code has been sent to your email.');
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to resend verification code';
      const cooldownSeconds = error.response?.data?.cooldownSeconds;
      if (cooldownSeconds) {
        setLoginTwoFactorCooldown(cooldownSeconds);
      }
      setLocalError(errorMessage);

      if (error.response?.status === 410) {
        setLoginStep('credentials');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startForgotPassword = () => {
    prefillResetEmailRef.current = formData.email || '';
    setMode('forgot');
    setLocalError('');
    setLocalSuccess('');
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || isSubmitting) return;

    if (!resetData.email) {
      setLocalError('Please enter your email first');
      return;
    }

    setIsSubmitting(true);
    setLocalError('');
    setLocalSuccess('');

    try {
      const response = await authAPI.requestPasswordReset(resetData.email);
      setResendCooldown(response.cooldownSeconds || 30);
      setResetStep('code');
      setLocalSuccess('A new code has been sent to your email.');
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to resend code';
      const cooldownSeconds = error.response?.data?.cooldownSeconds;
      if (cooldownSeconds) {
        setResendCooldown(cooldownSeconds);
      }
      setLocalError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async () => {
    if (isSubmitting) return;

    setLocalError('');
    setLocalSuccess('');

    if (resetStep === 'email') {
      if (!resetData.email) {
        setLocalError('Please enter your email');
        return;
      }
    }

    if (resetStep === 'code') {
      if (!resetData.code || resetData.code.length !== 5) {
        setLocalError('Please enter the 5-digit code');
        return;
      }
    }

    if (resetStep === 'password') {
      if (!resetData.password || !resetData.confirmPassword) {
        setLocalError('Please fill in all fields');
        return;
      }
      if (resetData.password.length < 6) {
        setLocalError('Password must be at least 6 characters');
        return;
      }
      if (resetData.password !== resetData.confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (resetStep === 'email') {
        const response = await authAPI.requestPasswordReset(resetData.email);
        setResendCooldown(response.cooldownSeconds || 30);
        setResetStep('code');
        setLocalSuccess('We sent a 5-digit code to your email.');
      } else if (resetStep === 'code') {
        const response = await authAPI.verifyPasswordResetCode({
          email: resetData.email,
          code: resetData.code
        });
        setResetData((prev) => ({
          ...prev,
          resetToken: response.resetToken
        }));
        setResetStep('password');
        setLocalSuccess('Code verified. Set a new password.');
      } else if (resetStep === 'password') {
        await authAPI.resetPassword({
          email: resetData.email,
          resetToken: resetData.resetToken,
          password: resetData.password
        });
        setLocalSuccess('Password updated. Please sign in.');
        prefillEmailRef.current = resetData.email;
        setMode('login');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Password reset failed';
      const cooldownSeconds = error.response?.data?.cooldownSeconds;
      if (cooldownSeconds) {
        setResendCooldown(cooldownSeconds);
      }
      setLocalError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (mode === 'forgot') {
      await handleResetSubmit();
      return false;
    }
    
    // Prevent multiple submissions
    if (isSubmitting) {
      console.log('Already submitting, ignoring...');
      return;
    }
    
    setLocalError('');
    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        // Registration validation
        if (!formData.username || !formData.email || !formData.password) {
          setLocalError('Please fill in all fields');
          return;
        }

        const normalizedUsername = formData.username.trim().toLowerCase();
        if (normalizedUsername.length < USERNAME_MIN_LENGTH) {
          setLocalError(`Username must be at least ${USERNAME_MIN_LENGTH} characters`);
          return;
        }

        if (normalizedUsername.length > USERNAME_MAX_LENGTH) {
          setLocalError(`Username cannot exceed ${USERNAME_MAX_LENGTH} characters`);
          return;
        }

        if (!USERNAME_REGEX.test(normalizedUsername)) {
          setLocalError(`Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and contain letters and numbers only`);
          return;
        }

        if (formData.password.length < 6) {
          setLocalError('Password must be at least 6 characters');
          return;
        }

        if (!formData.acceptedTerms) {
          setLocalError('You must accept the Terms and Conditions');
          return;
        }

        const result = await register({
          username: normalizedUsername,
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
        });

        if (result.success) {
          handleClose();
          // Don't navigate, just close modal and stay on current page
        } else {
          // Clear password on error
          setFormData(prev => ({
            ...prev,
            password: '',
            confirmPassword: ''
          }));
          setLocalError(result.error || 'Registration failed. Please try again.');
          // Keep modal open so user can try again
        }
      } else {
        if (loginStep === 'twoFactor') {
          if (!loginTwoFactorData.code || loginTwoFactorData.code.length !== 5) {
            setLocalError('Please enter the 5-digit verification code');
            return;
          }

          const verifyResult = await verifyLoginTwoFactorCode({
            email: loginTwoFactorData.email,
            code: loginTwoFactorData.code,
            loginSessionToken: loginTwoFactorData.loginSessionToken
          });

          if (verifyResult.success) {
            handleClose();
          } else {
            setLocalError(verifyResult.error || 'Verification failed. Please try again.');
            setLoginTwoFactorData((prev) => ({
              ...prev,
              code: ''
            }));
          }
        } else {
          // Login validation
          if (!formData.email || !formData.password) {
            setLocalError('Please fill in all fields');
            return;
          }

          const normalizedEmail = formData.email.trim().toLowerCase();
          const result = await login({
            email: normalizedEmail,
            password: formData.password,
          });

          if (result.success && result.requiresTwoFactor) {
            setLoginStep('twoFactor');
            setLoginTwoFactorData({
              email: result.email || normalizedEmail,
              code: '',
              loginSessionToken: result.loginSessionToken || ''
            });
            setLoginTwoFactorCooldown(result.cooldownSeconds || 30);
            setLocalSuccess(result.message || 'We sent a 5-digit verification code to your email.');
            return;
          }

          if (result.success) {
            handleClose();
          } else {
            // Clear password on error and show error message
            setFormData(prev => ({
              ...prev,
              password: ''
            }));
            setLocalError(result.error || 'Invalid password. Please try again.');
            // Keep modal open so user can try again
          }
        }
      }
    } catch (error) {
      // Handle any unexpected errors
      console.error('Unexpected error during submission:', error);
      setFormData(prev => ({
        ...prev,
        password: ''
      }));
      setLocalError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
    
    // Return false to prevent any default behavior
    return false;
  };

  const switchMode = () => {
    if (mode === 'forgot') {
      setMode('login');
      return;
    }
    setMode(mode === 'login' ? 'register' : 'login');
  };

  const headerTitle = mode === 'login'
    ? loginStep === 'twoFactor'
      ? 'Two-factor verification'
      : 'Welcome back'
    : mode === 'register'
      ? 'Create account'
      : resetStep === 'password'
        ? 'Reset password'
        : 'Forgot password';

  const headerSubtitle = mode === 'login'
    ? loginStep === 'twoFactor'
      ? 'Enter the 5-digit code sent to your email'
      : 'Enter your credentials to continue'
    : mode === 'register'
      ? 'Join Handshake today'
      : resetStep === 'email'
        ? 'Enter your email to reset your password'
        : resetStep === 'code'
          ? 'Enter the 5-digit code we sent'
          : 'Create a new password to continue';

  const displayError = localError || (mode !== 'forgot' ? error : '');
  const displaySuccess = localSuccess;

  const isBusy = mode === 'forgot' ? isSubmitting : (loading || isSubmitting);
  const submitLabel = mode === 'login'
    ? loginStep === 'twoFactor'
      ? 'Verify code'
      : 'Sign in'
    : mode === 'register'
      ? 'Create account'
      : resetStep === 'email'
        ? 'Send reset code'
        : resetStep === 'code'
          ? 'Verify code'
          : 'Update password';
  const submitLoadingLabel = mode === 'forgot'
    ? resetStep === 'email'
      ? 'Sending code...'
      : resetStep === 'code'
        ? 'Verifying code...'
        : 'Updating password...'
    : mode === 'login'
      ? loginStep === 'twoFactor'
        ? 'Verifying code...'
        : 'Signing in...'
      : 'Creating account...';

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 overflow-y-auto ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isBusy) {
          handleClose();
        }
      }}
    >
      {/* Transparent backdrop with blur - homepage shows through */}
      <div className="absolute inset-0 bg-n-8/40 backdrop-blur-md" />

      {/* Modal with slide up animation */}
      <div
        className={`relative z-10 w-full max-w-4xl my-8 transform transition-all duration-300 ease-out ${
          isClosing ? 'translate-y-8 opacity-0' : 'translate-y-0 opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="relative bg-n-7/80 backdrop-blur-xl border border-n-6 rounded-2xl shadow-2xl overflow-hidden">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-color-1/5 via-transparent to-color-5/5 pointer-events-none" />
          
          {/* Grid layout for side panel + form */}
          <div className="grid md:grid-cols-2 gap-0 min-h-[600px]">
            
            {/* Left side - Green Planet with Stars */}
            <div className="hidden md:flex relative bg-gradient-to-br from-n-8 to-n-7 rounded-l-2xl overflow-hidden">
              {/* Static stars - no animation */}
              <div className="absolute inset-0">
                {stars.map((star, i) => (
                  <div
                    key={i}
                    className="absolute bg-n-1 rounded-full"
                    style={{
                      left: `${star.left}%`,
                      top: `${star.top}%`,
                      width: `${star.size}px`,
                      height: `${star.size}px`,
                      opacity: star.opacity
                    }}
                  />
                ))}
              </div>

              {/* Modern Shooting Star Effect */}
              {showShootingStar && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ willChange: 'transform' }}>
                  <div className="shooting-star-container">
                    {/* SVG Shooting Star with proper gradient and glow */}
                    <svg 
                      width="200" 
                      height="200" 
                      className="shooting-star-svg" 
                      viewBox="0 0 200 200" 
                      style={{
                        position: 'absolute',
                        bottom: '20%',
                        left: '-10%',
                        willChange: 'transform, opacity'
                      }}
                    >
                      <defs>
                        {/* Gradient for the trail */}
                        <linearGradient id={`starTrail-${Date.now()}`} x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="transparent" stopOpacity="0" />
                          <stop offset="40%" stopColor="rgba(255,255,255,0.3)" stopOpacity="0.3" />
                          <stop offset="70%" stopColor="rgba(255,255,255,0.7)" stopOpacity="0.7" />
                          <stop offset="100%" stopColor="white" stopOpacity="1" />
                        </linearGradient>
                        
                        {/* Glow filter */}
                        <filter id={`glow-${Date.now()}`}>
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      
                      {/* Trail pointing diagonally up-right */}
                      <g transform="rotate(-45 100 100)">
                        {/* Main trail */}
                        <ellipse cx="50" cy="100" rx="80" ry="2" fill={`url(#starTrail-${Date.now()})`} filter={`url(#glow-${Date.now()})`} opacity="0.9"/>
                        {/* Secondary softer trail */}
                        <ellipse cx="50" cy="100" rx="80" ry="3.5" fill={`url(#starTrail-${Date.now()})`} opacity="0.4"/>
                        
                        {/* Bright star head */}
                        <circle cx="130" cy="100" r="4" fill="white" filter={`url(#glow-${Date.now()})`}>
                          <animate attributeName="r" values="3;5;3" dur="0.3s" repeatCount="indefinite"/>
                        </circle>
                        
                        {/* Inner bright core */}
                        <circle cx="130" cy="100" r="2" fill="white" opacity="1"/>
                        
                        {/* Sparkle points */}
                        <circle cx="125" cy="100" r="1.5" fill="white" opacity="0.8"/>
                        <circle cx="135" cy="100" r="1.5" fill="white" opacity="0.8"/>
                        <circle cx="130" cy="95" r="1.5" fill="white" opacity="0.7"/>
                        <circle cx="130" cy="105" r="1.5" fill="white" opacity="0.7"/>
                      </g>
                    </svg>
                  </div>
                </div>
              )}

              {/* Green Planet */}
              <div className="relative w-full h-full flex items-center justify-center p-12">
                <div className="relative w-64 h-64">
                  {/* Glow effect */}
                  <div className="absolute inset-0 rounded-full bg-color-4/30 blur-3xl animate-pulse" />
                  
                  {/* Main planet */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-color-4 to-emerald-600 shadow-2xl">
                    {/* Planet texture/details */}
                    <div className="absolute inset-4 rounded-full bg-gradient-to-br from-color-4/60 to-transparent" />
                    <div className="absolute inset-8 rounded-full bg-gradient-to-tr from-transparent to-emerald-400/40" />
                    
                    {/* Handshake logo in center of planet */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <img src={handshakeSymbol} alt="Handshake" className="w-24 h-24 opacity-80 brightness-0 invert drop-shadow-lg" />
                    </div>
                  </div>
                  
                  {/* Ring */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-32">
                    <div className="absolute inset-0 rounded-[50%] border-t-4 border-b-4 border-color-4/40 transform -rotate-12 blur-sm" />
                    <div className="absolute inset-0 rounded-[50%] border-t-2 border-b-2 border-color-4/70 transform -rotate-12" />
                  </div>
                </div>
                
                {/* Floating particles with colors */}
                <div className="absolute inset-0">
                  {[...Array(15)].map((_, i) => {
                    const icons = ['₿', 'Ξ', '$', '◈', '●'];
                    // Only show green particles
                    if (i % 3 !== 0) return null;
                    return (
                      <div
                        key={`particle-${i}`}
                        className="absolute text-xs font-bold animate-float"
                        style={{
                          left: `${Math.random() * 100}%`,
                          top: `${Math.random() * 100}%`,
                          animationDelay: `${Math.random() * 5}s`,
                          animationDuration: `${4 + Math.random() * 4}s`,
                          color: 'rgba(122, 219, 120, 0.4)', // only green
                          opacity: 0.3
                        }}
                      >
                        {icons[i % icons.length]}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right side - Form */}
            <div className="relative p-8 pt-12 max-h-[85vh] md:max-h-full overflow-y-auto modal-scroll">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-n-4 hover:text-n-1 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-n-1">
                {headerTitle}
              </h2>
              <p className="text-n-3">
                {headerSubtitle}
              </p>
            </div>

            {/* Error message */}
            {displayError && (
              <div className="mb-6 p-4 bg-color-3/10 border border-color-3/50 rounded-lg">
                <p className="text-color-3 text-sm flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {displayError}
                </p>
              </div>
            )}

            {displaySuccess && (
              <div className="mb-6 p-4 bg-color-4/10 border border-color-4/40 rounded-lg">
                <p className="text-color-4 text-sm flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707a1 1 0 00-1.414-1.414L9 11.586 7.707 10.293a1 1 0 00-1.414 1.414L9 14.414l4.707-4.707z" clipRule="evenodd" />
                  </svg>
                  {displaySuccess}
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5" noValidate autoComplete="off">
              {mode === 'register' && (
                <div>
                  <label htmlFor="username" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                    placeholder="Choose a username"
                    autoComplete="username"
                    maxLength={USERNAME_MAX_LENGTH}
                    pattern="[A-Za-z0-9]+"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  <p className="text-xs text-n-4 mt-2">
                    {USERNAME_MIN_LENGTH}-{USERNAME_MAX_LENGTH} characters, letters and numbers only.
                  </p>
                </div>
              )}

              {mode !== 'forgot' && !(mode === 'login' && loginStep === 'twoFactor') && (
                <div>
                  <label htmlFor="email" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                    placeholder="Enter your email"
                    autoComplete="email"
                  />
                </div>
              )}

              {mode === 'login' && loginStep === 'twoFactor' && (
                <>
                  <div>
                    <label htmlFor="login-twofactor-email" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                      Email
                    </label>
                    <input
                      type="email"
                      id="login-twofactor-email"
                      value={loginTwoFactorData.email}
                      disabled
                      className="w-full px-4 py-3 bg-n-6/70 border border-n-6 rounded-lg text-n-3 placeholder-n-4 focus:outline-none transition-all cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label htmlFor="login-twofactor-code" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                      5-digit code
                    </label>
                    <input
                      type="text"
                      id="login-twofactor-code"
                      name="loginTwoFactorCode"
                      value={loginTwoFactorData.code}
                      onChange={handleLoginTwoFactorCodeChange}
                      className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all tracking-[0.3em] text-center"
                      placeholder="12345"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={5}
                    />
                    <div className="flex items-center justify-between mt-2 text-xs text-n-4">
                      <span>
                        {loginTwoFactorCooldown > 0 ? `Resend available in ${loginTwoFactorCooldown}s` : 'Did not receive a code?'}
                      </span>
                      <button
                        type="button"
                        onClick={handleResendLoginTwoFactorCode}
                        disabled={loginTwoFactorCooldown > 0 || isSubmitting}
                        className="text-[#10B981] hover:text-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Resend code
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginStep('credentials');
                        setLoginTwoFactorData((prev) => ({
                          ...prev,
                          code: '',
                          loginSessionToken: ''
                        }));
                        setLoginTwoFactorCooldown(0);
                        setLocalError('');
                        setLocalSuccess('');
                      }}
                      className="mt-3 text-xs text-n-4 hover:text-n-2 transition-colors"
                    >
                      Back to email and password
                    </button>
                  </div>
                </>
              )}

              {mode === 'forgot' && resetStep === 'email' && (
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    id="reset-email"
                    name="email"
                    value={resetData.email}
                    onChange={handleResetChange}
                    className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                    placeholder="Enter your email"
                    autoComplete="email"
                  />
                  <p className="text-xs text-n-4 mt-2">We will send a 5-digit code to this email.</p>
                </div>
              )}

              {mode === 'forgot' && resetStep === 'code' && (
                <>
                  <div>
                    <label htmlFor="reset-email-readonly" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                      Email
                    </label>
                    <input
                      type="email"
                      id="reset-email-readonly"
                      name="email"
                      value={resetData.email}
                      disabled
                      className="w-full px-4 py-3 bg-n-6/70 border border-n-6 rounded-lg text-n-3 placeholder-n-4 focus:outline-none transition-all cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label htmlFor="code" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                      5-digit code
                    </label>
                    <input
                      type="text"
                      id="code"
                      name="code"
                      value={resetData.code}
                      onChange={handleResetChange}
                      className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all tracking-[0.3em] text-center"
                      placeholder="12345"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={5}
                    />
                    <div className="flex items-center justify-between mt-2 text-xs text-n-4">
                      <span>
                        {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Did not receive a code?'}
                      </span>
                      <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={resendCooldown > 0 || isSubmitting}
                        className="text-[#10B981] hover:text-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Resend code
                      </button>
                    </div>
                  </div>
                </>
              )}

              {mode === 'forgot' && resetStep === 'password' && (
                <>
                  <div>
                    <label htmlFor="new-password" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                      New password
                    </label>
                    <input
                      type="password"
                      id="new-password"
                      name="password"
                      value={resetData.password}
                      onChange={handleResetChange}
                      className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                      placeholder="Create a new password"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-new-password" className="block text-sm font-code text-n-3 mb-2 uppercase tracking-wider">
                      Confirm password
                    </label>
                    <input
                      type="password"
                      id="confirm-new-password"
                      name="confirmPassword"
                      value={resetData.confirmPassword}
                      onChange={handleResetChange}
                      className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                      placeholder="Confirm your new password"
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}

              {mode !== 'forgot' && !(mode === 'login' && loginStep === 'twoFactor') && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="password" className="block text-sm font-code text-n-3 uppercase tracking-wider">
                      Password
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={startForgotPassword}
                        className="text-xs text-[#10B981] hover:text-[#059669] transition-colors"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all"
                    placeholder="Enter your password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>
              )}

              {mode === 'register' && (
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="acceptedTerms"
                    name="acceptedTerms"
                    checked={formData.acceptedTerms}
                    onChange={handleChange}
                    className="w-4 h-4 bg-n-6 border-n-5 rounded text-[#10B981] focus:ring-[#10B981] focus:ring-2 cursor-pointer"
                  />
                  <label htmlFor="acceptedTerms" className="text-sm text-n-3 cursor-pointer">
                    I agree to the{' '}
                    <a
                      href="/docs/terms#user-responsibility"
                      onClick={openTermsAndConditions}
                      className="text-[#10B981] hover:text-[#059669] underline"
                    >
                      Terms and Conditions
                    </a>
                  </label>
                </div>
              )}


              {/* Submit Button with Handshake ButtonSvg */}
              <button
                type="submit"
                disabled={isBusy}
                className="button relative inline-flex items-center justify-center h-11 w-full transition-colors hover:text-[#10B981] text-n-1 disabled:opacity-50 disabled:cursor-not-allowed mt-10"
              >
                <span className="relative z-10">
                  {isBusy ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {submitLoadingLabel}
                    </span>
                  ) : (
                    submitLabel
                  )}
                </span>
                {ButtonSvg(false)}
              </button>
            </form>

            {/* Switch mode */}
            <div className="mt-8 text-center">
              {mode === 'forgot' ? (
                <p className="text-n-4 text-sm">
                  Remembered your password?{' '}
                  <button
                    onClick={switchMode}
                    className="text-n-1 hover:text-n-1 hover:font-bold transition-all font-semibold"
                  >
                    Sign in
                  </button>
                </p>
              ) : (
                <p className="text-n-4 text-sm">
                  {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                  <button
                    onClick={switchMode}
                    className="text-n-1 hover:text-n-1 hover:font-bold transition-all font-semibold"
                  >
                    {mode === 'login' ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

AuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(['login', 'register', 'forgot']),
};

AuthModal.defaultProps = {
  mode: 'login',
};

export default AuthModal;
