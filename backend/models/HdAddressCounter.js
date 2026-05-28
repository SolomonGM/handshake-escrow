import mongoose from 'mongoose';

// Per-chain derivation-index counter. Each deposit (ticket or pass order) consumes
// the next index atomically via `findOneAndUpdate({ $inc })` so two concurrent
// deposits can never share an address.
const hdAddressCounterSchema = new mongoose.Schema(
  {
    chain: {
      type: String,
      required: true,
      unique: true,
      index: true,
      enum: ['bitcoin', 'litecoin', 'ethereum', 'solana']
    },
    nextIndex: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

hdAddressCounterSchema.statics.consumeNextIndex = async function consumeNextIndex(chain) {
  const normalizedChain = String(chain || '').trim().toLowerCase();
  if (!['bitcoin', 'litecoin', 'ethereum', 'solana'].includes(normalizedChain)) {
    throw new Error(`Unsupported chain for HD derivation: ${chain}`);
  }

  const updated = await this.findOneAndUpdate(
    { chain: normalizedChain },
    { $inc: { nextIndex: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // findOneAndUpdate returns the document AFTER the $inc. The index we just
  // claimed is therefore (nextIndex - 1).
  return updated.nextIndex - 1;
};

const HdAddressCounter = mongoose.model('HdAddressCounter', hdAddressCounterSchema);

export default HdAddressCounter;
