
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
  'usdc-erc20': usdc,
  'usdt-sol': usdtSolBrand,
  'usdt-spl': usdtSolBrand,
  'usdc-sol': usdc,
  'usdc-spl': usdc,
};
