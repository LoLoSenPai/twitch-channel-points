import bs58 from "bs58";

const secret = process.argv[2];
if (!secret) {
  console.log("Usage: ts-node scripts/secret-to-json.ts <base58-secret>");
  process.exit(1);
}

const bytes = bs58.decode(secret);
console.log(JSON.stringify(Array.from(bytes)));
