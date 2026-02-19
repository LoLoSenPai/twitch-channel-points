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
    randomnessProvider: { type: String, default: null },
    randomnessQueuePubkey: { type: String, default: null },
    randomnessAccount: { type: String, default: null, index: true },
    randomnessCommitTx: { type: String, default: null },
    randomnessRevealTx: { type: String, default: null },
    randomnessCloseTx: { type: String, default: null },
    randomnessValueHex: { type: String, default: null },
    randomnessSeedSlot: { type: Number, default: null },
    randomnessRevealSlot: { type: Number, default: null },
    drawAvailableStickerIds: { type: [String], default: [] },
    drawIndex: { type: Number, default: null },
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
    randomnessProvider: { type: String, default: null },
    randomnessQueuePubkey: { type: String, default: null },
    randomnessAccount: { type: String, default: null, index: true },
    randomnessCommitTx: { type: String, default: null },
    randomnessRevealTx: { type: String, default: null },
    randomnessCloseTx: { type: String, default: null },
    randomnessValueHex: { type: String, default: null },
    randomnessSeedSlot: { type: Number, default: null },
    randomnessRevealSlot: { type: Number, default: null },
    drawAvailableStickerIds: { type: [String], default: [] },
    drawIndex: { type: Number, default: null },
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

const UserWalletSchema = new Schema(
  {
    twitchUserId: { type: String, required: true, index: true },
    wallet: { type: String, required: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
UserWalletSchema.index({ twitchUserId: 1, wallet: 1 }, { unique: true });

const TradeOfferSchema = new Schema(
  {
    offerId: { type: String, unique: true, index: true },
    makerTwitchUserId: { type: String, required: true, index: true },
    makerWallet: { type: String, required: true, index: true },
    makerAssetId: { type: String, required: true, index: true },
    makerStickerId: { type: String, required: true, index: true },
    wantedStickerId: { type: String, default: null, index: true },
    wantedStickerIds: { type: [String], default: [], index: true },
    preparedDelegationTxB64: { type: String, default: null },
    makerDelegationTxSig: { type: String, default: null },
    takerTwitchUserId: { type: String, default: null, index: true },
    takerWallet: { type: String, default: null },
    takerAssetId: { type: String, default: null, index: true },
    takerStickerId: { type: String, default: null, index: true },
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

const TransferIntentSchema = new Schema(
  {
    intentId: { type: String, unique: true, index: true },
    twitchUserId: { type: String, required: true, index: true },
    wallet: { type: String, required: true, index: true },
    assetId: { type: String, required: true, index: true },
    stickerId: { type: String, default: null, index: true },
    recipientWallet: { type: String, required: true, index: true },
    preparedTxB64: { type: String, required: true },
    status: {
      type: String,
      enum: ["PREPARED", "SUBMITTED", "DONE", "FAILED"],
      default: "PREPARED",
      index: true,
    },
    txSig: { type: String, default: null },
    error: { type: String, default: null },
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
export const UserWallet =
  mongoose.models.UserWallet || mongoose.model("UserWallet", UserWalletSchema);
export const TradeOffer =
  mongoose.models.TradeOffer || mongoose.model("TradeOffer", TradeOfferSchema);
export const SaleListing =
  mongoose.models.SaleListing || mongoose.model("SaleListing", SaleListingSchema);
export const TransferIntent =
  mongoose.models.TransferIntent || mongoose.model("TransferIntent", TransferIntentSchema);
