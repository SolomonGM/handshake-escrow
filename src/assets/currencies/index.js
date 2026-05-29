
import usd from './usd.png';
import gbp from './gbp.png';
import eur from './eur.png';    
import jpy from './jpy.png';
import cad from './cad.png';
import aud from './aud.png';
import chf from './chf.png';
import cny from './cny.png';
import inr from './inr.png';
import btc from './btc.png';
import eth from './eth.png';
import ltc from './ltc.png';
import usdt from './usdt.png';
import sol from './sol.png';
import usdc from './usdc.svg';

// High-fidelity brand logos used in marketing surfaces (passes purchase page,
// docs supported assets, admin Payment Infrastructure). Kept distinct from
// `cryptoLogos` above so the small flag-style icons used elsewhere on the site
// aren't affected.
import btcBrand from '../svg/bitcoin-btc-logo.png';
import ethBrand from '../svg/ethereum-eth-logo.png';
import ltcBrand from '../svg/litecoin-ltc-logo.png';
import solBrand from '../svg/solana-sol-logo.png';
import usdtErcBrand from '../svg/tether-erc-logo.png';
import usdtSolBrand from '../svg/tether-sol-logo.png';
import usdcErcBrand from '../svg/usdc-erc-logo.png';
import usdcSolBrand from '../svg/usdc-sol-logo.png';

// Trade-hub payment method logos. Used by the Create Trade Request modal and
// the trade request cards so every payment method renders with a real brand
// mark instead of a unicode glyph or single letter.
import btcPay from '../svg/bitcoin-btc-logo.png';
import ltcPay from '../svg/litecoin-ltc-logo.png';
import ethPay from '../svg/Ethereum_Logo.png';
import solPay from '../svg/solana-sol-logo.png';
import usdtPay from '../svg/tether-usdt-logo.png';
import usdcPay from '../svg/usd-coin-usdc-logo.png';
import bankPay from '../svg/chase-bank.png';
import paypalPay from '../svg/paypal_PNG7.png';
import wisePay from '../svg/470451-Frame 39321-0745ed-medium-1677657684.png';
import zellePay from '../svg/1659810938zelle-icon-png.png';

export const currencyFlags = {
  usd,
  gbp,
  eur,
  jpy,
  cad,
  aud,
  chf,
  cny,
  inr,
  btc,
  eth,
  ltc,
  usdt,
  usdc,
  sol,
};

export const cryptoLogos = {
  bitcoin: btc,
  litecoin: ltc,
  ethereum: eth,
  solana: sol,
  'usdt-erc20': usdt,
  'usdc-erc20': usdc,
  'usdt-spl': usdt,
  'usdc-spl': usdc,
};

// Use these on the passes purchase page, docs supported-assets section, and
// admin Payment Infrastructure section ONLY. USDC keeps its existing mark
// since no brand asset was provided.
export const cryptoBrandLogos = {
  bitcoin: btcBrand,
  litecoin: ltcBrand,
  ethereum: ethBrand,
  solana: solBrand,
  'usdt-erc20': usdtErcBrand,
  'usdc-erc20': usdcErcBrand,
  'usdt-sol': usdtSolBrand,
  'usdt-spl': usdtSolBrand,
  'usdc-sol': usdcSolBrand,
  'usdc-spl': usdcSolBrand,
};

// Logo + display label for every payment method offered in the Trade Hub.
// Keys map to the values stored on TradeRequest.paymentMethods. Render via
// <img className="object-contain"> at a fixed box so unequal source aspect
// ratios crop cleanly without distortion.
export const paymentMethodLogos = {
  bitcoin: { logo: btcPay, label: 'Bitcoin' },
  ethereum: { logo: ethPay, label: 'Ethereum' },
  litecoin: { logo: ltcPay, label: 'Litecoin' },
  solana: { logo: solPay, label: 'Solana' },
  'usdt-erc20': { logo: usdtPay, label: 'USDT' },
  'usdc-erc20': { logo: usdcPay, label: 'USDC' },
  usdt: { logo: usdtPay, label: 'USDT' },
  usdc: { logo: usdcPay, label: 'USDC' },
  'bank-transfer': { logo: bankPay, label: 'Bank Transfer' },
  paypal: { logo: paypalPay, label: 'PayPal' },
  wise: { logo: wisePay, label: 'Wise' },
  zelle: { logo: zellePay, label: 'Zelle' },
};
