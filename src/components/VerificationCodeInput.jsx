import { useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';

const VerificationCodeInput = ({
  value,
  onChange,
  length = 5,
  disabled = false,
  autoFocus = false,
  className = ''
}) => {
  const normalizedValue = String(value || '').replace(/\D/g, '').slice(0, length);
  const inputRefs = useRef([]);
  const valueDigits = useMemo(() => {
    const nextDigits = Array.from({ length }, (_, index) => normalizedValue[index] || '');
    return nextDigits;
  }, [normalizedValue, length]);

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }

    const firstEmptyIndex = valueDigits.findIndex((digit) => !digit);
    const targetIndex = firstEmptyIndex >= 0 ? firstEmptyIndex : Math.max(length - 1, 0);
    inputRefs.current[targetIndex]?.focus();
  }, [autoFocus, disabled, length, valueDigits]);

  const focusInput = (index) => {
    if (index < 0 || index >= length) {
      return;
    }
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  };

  const updateDigits = (nextDigits) => {
    onChange(nextDigits.join('').slice(0, length));
  };

  const handleSingleInput = (index, incomingValue) => {
    const digitsOnly = String(incomingValue || '').replace(/\D/g, '');
    const nextDigits = [...valueDigits];

    if (!digitsOnly) {
      nextDigits[index] = '';
      updateDigits(nextDigits);
      return;
    }

    if (digitsOnly.length === 1) {
      nextDigits[index] = digitsOnly;
      updateDigits(nextDigits);
      focusInput(index + 1);
      return;
    }

    let nextIndex = index;
    for (const digit of digitsOnly) {
      if (nextIndex >= length) {
        break;
      }
      nextDigits[nextIndex] = digit;
      nextIndex += 1;
    }

    updateDigits(nextDigits);
    focusInput(Math.min(nextIndex, length - 1));
  };

  const handleKeyDown = (event, index) => {
    if (event.key === 'Backspace') {
      if (valueDigits[index]) {
        const nextDigits = [...valueDigits];
        nextDigits[index] = '';
        updateDigits(nextDigits);
      } else {
        focusInput(index - 1);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusInput(index - 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusInput(index + 1);
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData?.getData('text') || '';
    const digitsOnly = pasted.replace(/\D/g, '').slice(0, length);
    if (!digitsOnly) {
      return;
    }

    event.preventDefault();
    onChange(digitsOnly);
    focusInput(Math.min(digitsOnly.length, length - 1));
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`} onPaste={handlePaste}>
      {valueDigits.map((digit, index) => (
        <input
          key={`verification-digit-${index}`}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          value={digit}
          onChange={(event) => handleSingleInput(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onFocus={(event) => event.target.select()}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          aria-label={`Verification digit ${index + 1}`}
          className="w-11 h-12 sm:w-12 sm:h-14 bg-n-7 border border-n-5 rounded-lg text-n-1 text-center text-lg sm:text-xl font-semibold tracking-wide focus:outline-none focus:border-n-1 focus:ring-1 focus:ring-n-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        />
      ))}
    </div>
  );
};

VerificationCodeInput.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  length: PropTypes.number,
  disabled: PropTypes.bool,
  autoFocus: PropTypes.bool,
  className: PropTypes.string
};

export default VerificationCodeInput;
