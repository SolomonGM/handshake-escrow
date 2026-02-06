import {
  benefitIconAbout,
  benefitIconBuyer,
  benefitIconSeller,
  benefitIconFees,
  benefitIconCoins,
  benefitIconSupport,
  benefitImage2,
  chromecast,
  disc02,
  discordBlack,
  facebook,
  file02,
  homeSmile,
  instagram,
  notification2,
  notification3,
  notification4,
  plusSquare,
  buyIcon,
  sellIcon,
  walletIcon,
  recording01,
  recording03,
  roadmap1,
  roadmap2,
  roadmap3,
  roadmap4,
  searchMd,
  sliders04,
  telegram,
  twitter,
  yourlogo,
  etherscan,
  polygonscan,
  blockchain,
  solscan,
  xrpscan,
  blockcypher,
  arbiscan,
  bscscan,
} from "../assets";

export const navigation = [
  {
    id: "0",
    title: "About",
    url: "#about",
  },
  {
    id: "1",
    title: "How to verify",
    url: "#how-to-verify",
  },
  {
    id: "2",
    title: "Trade Hub",
    url: "/trade-hub",
  },
  {
    id: "3",
    title: "Passes",
    url: "/passes/purchase",
  },
  {
    id: "4",
    title: "Docs",
    url: "/docs",
  },
  {
    id: "5",
    title: "New account",
    url: "#signup",
    onlyMobile: true,
  },
  {
    id: "6",
    title: "Sign in",
    url: "#login",
    onlyMobile: true,
  },
];

export const heroIcons = [buyIcon, walletIcon, sellIcon, homeSmile];

export const notificationImages = [notification4, notification3, notification2];

export const companyLogos = [yourlogo, yourlogo, yourlogo, yourlogo, yourlogo];

export const brainwaveServices = [
  "Photo generating",
  "Photo enhance",
  "Seamless Integration",
];

export const brainwaveServicesIcons = [
  recording03,
  recording01,
  disc02,
  chromecast,
  sliders04,
];

export const roadmap = [
  {
    id: "0",
    title: "Voice recognition",
    text: "Enable the chatbot to understand and respond to voice commands, making it easier for users to interact with the app hands-free.",
    date: "May 2023",
    status: "done",
    imageUrl: roadmap1,
    colorful: true,
  },
  {
    id: "1",
    title: "Gamification",
    text: "Add game-like elements, such as badges or leaderboards, to incentivize users to engage with the chatbot more frequently.",
    date: "May 2023",
    status: "progress",
    imageUrl: roadmap2,
  },
  {
    id: "2",
    title: "Chatbot customization",
    text: "Allow users to customize the chatbot's appearance and behavior, making it more engaging and fun to interact with.",
    date: "May 2023",
    status: "done",
    imageUrl: roadmap3,
  },
  {
    id: "3",
    title: "Integration with APIs",
    text: "Allow the chatbot to access external data sources, such as weather APIs or news APIs, to provide more relevant recommendations.",
    date: "May 2023",
    status: "progress",
    imageUrl: roadmap4,
  },
];

export const collabText =
  "Track every transaction with complete transparency. Verify all trades between users and our automated escrow system through blockchain explorers displayed below.";

export const collabContent = [
  {
    id: "0",
    title: "Seamless Integration",
    text: collabText,
  },
  {
    id: "1",
    title: "Smart Automation",
  },
  {
    id: "2",
    title: "Top-notch Security",
  },
];

export const collabApps = [
  {
    id: "0",
    title: "Etherscan",
    icon: etherscan,
    width: 34,
    height: 34,
    url: "https://etherscan.io",
  },
  {
    id: "1",
    title: "Polygonscan",
    icon: polygonscan,
    width: 34,
    height: 34,
    url: "https://polygonscan.com",
  },
  {
    id: "2",
    title: "Blockchain.com",
    icon: blockchain,
    width: 34,
    height: 34,
    url: "https://blockchain.com/explorer",
  },
  {
    id: "3",
    title: "Solscan",
    icon: solscan,
    width: 34,
    height: 34,
    url: "https://solscan.io",
  },
  {
    id: "4",
    title: "XRPScan",
    icon: xrpscan,
    width: 34,
    height: 34,
    url: "https://xrpscan.com",
  },
  {
    id: "5",
    title: "BlockCypher",
    icon: blockcypher,
    width: 34,
    height: 34,
    url: "https://blockcypher.com",
  },
  {
    id: "6",
    title: "BscScan",
    icon: bscscan,
    width: 34,
    height: 34,
    url: "https://bscscan.com",
  },
  {
    id: "7",
    title: "Arbiscan",
    icon: arbiscan,
    width: 34,
    height: 34,
    url: "https://arbiscan.io",
  },
];

export const passes = [
  {
    id: "0",
    title: "Single",
    description: "Perfect for occasional exchanges",
    price: "1",
    passCount: "1 Pass",
    features: [
      "Bypass transaction fees on 1 exchange",
      "Save on platform fees (typically 2-3% per exchange)",
      "Instant activation upon purchase",
      "Valid for any supported cryptocurrency",
      "Never expires - use whenever you're ready",
    ],
  },
  {
    id: "1",
    title: "Premium",
    description: "Best value for regular exchanges",
    price: "5",
    passCount: "3 Passes",
    features: [
      "Bypass transaction fees on 3 exchange",
      "Save on platform fees (typically 2-3% per exchange)",
      "Instant activation upon purchase",
      "Valid for any supported cryptocurrency",
      "Never expires - use whenever you're ready",
    ],
  },
  {
    id: "2",
    title: "Rhino",
    description: "Maximum savings for mass exchanges",
    price: "12",
    passCount: "8 Passes",
    features: [
      "Bypass transaction fees on 8 exchanges",
      "Save on platform fees (typically 2-3% per exchange)",
      "Instant activation upon purchase",
      "Valid for any supported cryptocurrency",
      "Never expires - use whenever you're ready",
    ],
  },
];

export const benefits = [
  {
    id: "0",
    title: "About Us",
    text: "Secure P2P cryptocurrency exchange enabling anonymous trades. Multiple coins supported with automated escrow protection and full blockchain transparency. Trade with confidence.",
    backgroundUrl: "./src/assets/benefits/card-1.svg",
    iconUrl: benefitIconAbout,
    imageUrl: benefitImage2,
    light: true,
  },
  {
    id: "1",
    title: "Buyer Walkthrough",
    text: "Learn how to purchase crypto from others, understand prices, manage offers, and send payments securely through our escrow system.",
    backgroundUrl: "./src/assets/benefits/card-2.svg",
    iconUrl: benefitIconBuyer,
    imageUrl: benefitImage2,
    light: true,
  },
  {
    id: "2",
    title: "Seller Walkthrough",
    text: "Learn how to list your crypto for sale, set your prices, manage offers, and receive payments securely through our escrow system.",
    backgroundUrl: "./src/assets/benefits/card-3.svg",
    iconUrl: benefitIconSeller,
    imageUrl: benefitImage2,
  },
  {
    id: "3",
    title: "Fees & Passes",
    text: "Low platform fees plus standard blockchain costs. Purchase passes to bypass per-transaction fees and save on high-volume exchanging.",
    backgroundUrl: "./src/assets/benefits/card-4.svg",
    iconUrl: benefitIconFees,
    imageUrl: benefitImage2,
    light: true,
  },
  {
    id: "4",
    title: "Supported Coins",
    text: "Trade Bitcoin, Ethereum, Litecoin, Solana, and many more cryptocurrencies. We support all major coins with more being added regularly.",
    backgroundUrl: "./src/assets/benefits/card-5.svg",
    iconUrl: benefitIconCoins,
    imageUrl: benefitImage2,
  },
  {
    id: "5",
    title: "Support",
    text: "24/7 customer support via discord community and email. Get help with trades, technical issues, or account queries. Fast response guaranteed.",
    backgroundUrl: "./src/assets/benefits/card-6.svg",
    iconUrl: benefitIconSupport,
    imageUrl: benefitImage2,
    light: true,
  },
];

export const socials = [
  {
    id: "0",
    title: "Discord",
    iconUrl: discordBlack,
    url: "https://discord.gg/4htgqJZtce",
  },
  {
    id: "1",
    title: "Twitter",
    iconUrl: twitter,
    url: "#",
  },
  {
    id: "2",
    title: "Instagram",
    iconUrl: instagram,
    url: "#",
  },
  {
    id: "3",
    title: "Telegram",
    iconUrl: telegram,
    url: "#",
  },
  {
    id: "4",
    title: "Facebook",
    iconUrl: facebook,
    url: "#",
  },
];

export const recentTransactions = [
  {
    id: "1",
    coinReceived: "LTC",
    amount: 0.05787743,
    usdValue: 5.63,
    sender: "Anonymous",
    receiver: "Anonymous",
    transactionId: "5eaa745d064b22a878f8351052e4e09240fc3a9874e5ec0a0930af44f8073ec1cd34696ca28c",
    blockchain: "litecoin",
    timestamp: "14:32",
    status: "completed"
  },
  {
    id: "2",
    coinReceived: "LTC",
    amount: 0.17773960,
    usdValue: 17.20,
    sender: "@3MkyAzed",
    receiver: "Anonymous",
    transactionId: "b0902782b8a722a878f8351052e4e09240fc3a9874e5ec0a0930af44f8073ec1cd34696ca28c",
    blockchain: "litecoin",
    timestamp: "14:49",
    status: "completed"
  },
  {
    id: "3",
    coinReceived: "ETH",
    amount: 0.00234567,
    usdValue: 8.45,
    sender: "@CryptoTrader99",
    receiver: "@BlockchainBob",
    transactionId: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    blockchain: "ethereum",
    timestamp: "13:15",
    status: "completed"
  },
  {
    id: "4",
    coinReceived: "BTC",
    amount: 0.00012345,
    usdValue: 12.34,
    sender: "Anonymous",
    receiver: "@BitcoinWhale",
    transactionId: "1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
    blockchain: "bitcoin",
    timestamp: "12:58",
    status: "completed"
  },
  {
    id: "5",
    coinReceived: "SOL",
    amount: 0.45678901,
    usdValue: 23.45,
    sender: "@SolanaFan",
    receiver: "Anonymous",
    transactionId: "7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n",
    blockchain: "solana",
    timestamp: "11:42",
    status: "completed"
  }
];
