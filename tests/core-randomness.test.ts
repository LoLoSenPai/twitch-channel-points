import assert from "node:assert/strict";
import {
  getAvailableStickerIds,
  pickUniformAvailableStickerIdFromHex,
  uniformIndexFromHex,
} from "../lib/stickers";

function testUniformIndexFromHex() {
  assert.equal(uniformIndexFromHex("0f", 5), 0, "0x0f % 5 should be 0");
  assert.equal(uniformIndexFromHex("10", 5), 1, "0x10 % 5 should be 1");
  assert.equal(uniformIndexFromHex("0x11", 5), 2, "0x11 % 5 should be 2");

  assert.throws(() => uniformIndexFromHex("", 5), /empty/i);
  assert.throws(() => uniformIndexFromHex("aa", 0), /invalid size/i);
}

function testSupplyFiltering() {
  const minted = new Map<string, number>([
    ["1", 10], // maxSupply reached in current stickers.json
    ["12", 3], // maxSupply=4 (with reserved 1 below)
  ]);
  const reserved = new Map<string, number>([
    ["12", 1], // pushes 12 to sold out
  ]);

  const ids = getAvailableStickerIds({
    mintedCounts: minted,
    reservedCounts: reserved,
  });

  assert(!ids.includes("1"), "sticker #1 should be filtered when maxSupply is reached");
  assert(!ids.includes("12"), "sticker #12 should be filtered when minted+reserved reaches maxSupply");
  assert(ids.includes("14"), "sticker #14 should still be available");

  for (let i = 1; i < ids.length; i += 1) {
    assert(
      Number(ids[i - 1]) < Number(ids[i]),
      "available ids should be sorted ascending for deterministic draw",
    );
  }
}

function testPickUniformAvailableStickerIdFromHex() {
  const availableIds = ["3", "7", "12"];
  const draw = pickUniformAvailableStickerIdFromHex(availableIds, "02");

  assert.equal(draw.index, 2, "index should be 2");
  assert.equal(draw.stickerId, "12", "selected sticker should match deterministic index");
}

function main() {
  testUniformIndexFromHex();
  testSupplyFiltering();
  testPickUniformAvailableStickerIdFromHex();
  // Keep output explicit for CI and manual local runs.
  console.log("core-randomness.test.ts: OK");
}

main();

