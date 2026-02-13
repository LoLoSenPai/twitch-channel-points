import mongoose, { Schema } from "mongoose";

const RedemptionSchema = new Schema(
  {
    redemptionId: { type: String, unique: true, index: true },
    twitchUserId: { type: String, index: true },
    rewardId: { type: String, index: true },
    status: {
      type: String,
      enum: ["PENDING", "CONSUMED", "FAILED"],
      default: "PENDING",
    },
    lockedByIntentId: { type: String, default: null, index: true },
    consumedAt: Date,
    mintTx: String,
  },
  { timestamps: true }
);

// ✅ index composé pour accélérer /api/me/tickets et /api/mint/prepare
RedemptionSchema.index({
  twitchUserId: 1,
  rewardId: 1,
  status: 1,
  lockedByIntentId: 1,
  createdAt: 1,
});

const MintSchema = new Schema(
  {
    twitchUserId: { type: String, index: true },
    wallet: { type: String, index: true },
    stickerId: { type: String, index: true },
    mintTx: String,
    assetId: String,
  },
  { timestamps: true }
);

const MintIntentSchema = new Schema(
  {
    intentId: { type: String, unique: true, index: true },
    twitchUserId: { type: String, index: true },
    wallet: String,
    redemptionId: String,
    stickerId: String,
    preparedTxB64: String,
    status: {
      type: String,
      enum: ["PREPARED", "SUBMITTED", "DONE", "FAILED"],
      default: "PREPARED",
    },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

const CollectionSchema = new Schema(
  {
    name: { type: String, required: true },
    coreCollectionPubkey: { type: String, default: null },
    merkleTreePubkey: { type: String, required: true },
    isActive: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const TradeOfferSchema = new Schema(
  {
    offerId: { type: String, unique: true, index: true },
    makerTwitchUserId: { type: String, required: true, index: true },
    makerWallet: { type: String, required: true, index: true },
    makerAssetId: { type: String, required: true, index: true },
    makerStickerId: { type: String, required: true, index: true },
    wantedStickerId: { type: String, required: true, index: true },
    preparedDelegationTxB64: { type: String, default: null },
    makerDelegationTxSig: { type: String, default: null },
    takerTwitchUserId: { type: String, default: null, index: true },
    takerWallet: { type: String, default: null },
    takerAssetId: { type: String, default: null, index: true },
    takerPreparedDelegationTxB64: { type: String, default: null },
    takerDelegationTxSig: { type: String, default: null },
    settlementTxSig: { type: String, default: null },
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "LOCKED", "DONE", "CANCELLED", "FAILED", "EXPIRED"],
      default: "DRAFT",
      index: true,
    },
    error: { type: String, default: null },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

const SaleListingSchema = new Schema(
  {
    listingId: { type: String, unique: true, index: true },
    sellerTwitchUserId: { type: String, required: true, index: true },
    sellerWallet: { type: String, required: true, index: true },
    sellerAssetId: { type: String, required: true, index: true },
    sellerStickerId: { type: String, required: true, index: true },
    priceLamports: { type: Number, required: true, min: 1, index: true },
    preparedDelegationTxB64: { type: String, default: null },
    sellerDelegationTxSig: { type: String, default: null },
    buyerTwitchUserId: { type: String, default: null, index: true },
    buyerWallet: { type: String, default: null },
    preparedBuyTxB64: { type: String, default: null },
    buyTxSig: { type: String, default: null },
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "LOCKED", "SOLD", "CANCELLED", "FAILED", "EXPIRED"],
      default: "DRAFT",
      index: true,
    },
    error: { type: String, default: null },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export const Redemption =
  mongoose.models.Redemption || mongoose.model("Redemption", RedemptionSchema);
export const Mint = mongoose.models.Mint || mongoose.model("Mint", MintSchema);
export const MintIntent =
  mongoose.models.MintIntent || mongoose.model("MintIntent", MintIntentSchema);
export const Collection =
  mongoose.models.Collection || mongoose.model("Collection", CollectionSchema);
export const TradeOffer =
  mongoose.models.TradeOffer || mongoose.model("TradeOffer", TradeOfferSchema);
export const SaleListing =
  mongoose.models.SaleListing || mongoose.model("SaleListing", SaleListingSchema);
