import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse";

async function main() {
  const path = process.argv[2];
  const buf = await readFile(path);
  const parsed = await pdfParse(buf);
  console.log(`=== ${path} ===`);
  console.log(`pages=${parsed.numpages} textLen=${parsed.text.length}`);
  console.log("----- TEXT -----");
  console.log(parsed.text);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
