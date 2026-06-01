import mongoose from 'mongoose';

const walletModesSchema = new mongoose.Schema(
  {
    mainnet: {
      type: String,
      default: ''
    },
    testnet: {
      type: String,
      default: ''
    }
  },
  { _id: false }
);

const systemConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: 'runtime'
    },
    ticketWorkflowPaused: {
      type: Boolean,
      default: false
    },
    pauseReason: {
      type: String,
      default: null
    },
    pauseChangedAt: {
      type: Date,
      default: null
    },
    pauseChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    networkModes: {
      bitcoin: {
        type: String,
        enum: ['mainnet', 'testnet'],
        default: 'mainnet'
      },
      litecoin: {
        type: String,
        enum: ['mainnet', 'testnet'],
        default: 'mainnet'
      },
      ethereum: {
        type: String,
        enum: ['mainnet', 'testnet'],
        default: 'mainnet'
      },
      solana: {
        type: String,
        enum: ['mainnet', 'testnet'],
        default: 'mainnet'
      }
    },
    wallets: {
      type: Map,
      of: walletModesSchema,
      default: {}
    },
    ticketAvailability: {
      bitcoin: {
        type: Boolean,
        default: true
      },
      litecoin: {
        type: Boolean,
        default: true
      },
      ethereum: {
        type: Boolean,
        default: true
      },
      solana: {
        type: Boolean,
        default: true
      },
      'usdt-erc20': {
        type: Boolean,
        default: true
      },
      'usdc-erc20': {
        type: Boolean,
        default: true
      },
      'usdt-spl': {
        type: Boolean,
        default: true
      },
      'usdc-spl': {
        type: Boolean,
        default: true
      }
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

export default SystemConfig;
