import fs from "fs";
import path from "path";

// === CONFIG ===
const INPUT_FILE = "./stickers.json";
const OUTPUT_DIR = "./metadata";

const SYMBOL = "PANINI";
const DESCRIPTION =
  "1ere édition de la collection de la chaine Twitch de Nyls.";
const SERIES = "v1";

const BASE_IMAGE_URI =
  "https://indigo-permanent-gayal-308.mypinata.cloud/ipfs/bafybeibeqy2j5v6rtm5naenif4nk2lvnsc57boi6p22ipngciwwvoiz2la";

// =================

const run = () => {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error("stickers.json introuvable");
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_FILE, "utf-8");
  const data = JSON.parse(raw);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  data.items.forEach((item) => {
    const imageUri = `${BASE_IMAGE_URI}/${item.image}`;

    const formatted = {
      name: item.name,
      symbol: SYMBOL,
      description: DESCRIPTION,
      image: imageUri,
      attributes: [
        { trait_type: "sticker_id", value: item.id },
        { trait_type: "series", value: SERIES },
        { trait_type: "rarity", value: item.rarity },
        { trait_type: "maxSupply", value: item.maxSupply },
      ],
      properties: {
        category: "image",
        files: [
          {
            uri: imageUri,
            type: "image/png",
          },
        ],
      },
    };

    const outputPath = path.join(OUTPUT_DIR, `${item.id}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(formatted, null, 2));

    console.log(`✅ Generated ${item.id}.json`);
  });

  console.log("🎉 Done.");
};

run();
