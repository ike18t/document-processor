import fs from "fs";
import path from "path";
import { watch } from "chokidar";
import { promisify } from "util";
import { exec } from "child_process";
import env from "env-var";
import { config } from "dotenv";
import { pdf as pdfToImg } from "pdf-to-img";
import ollama from "ollama";

config();

const WATCH_DIR = env.get("WATCH_DIR").required().asString();
const PROCESSED_DIR = env.get("PROCESSED_DIR").required().asString();
const MODEL = env.get("MODEL").required().asString();

console.log("WATCH_DIR:", WATCH_DIR);
watch(WATCH_DIR, { 
  usePolling: true,
  interval: 1000,
  stabilityThreshold: 2000,
  ignoreInitial: true,
  persistent: true 
}).on("add", async (filepath) => {
  if (!filepath.endsWith(".pdf")) return;
  if (!filepath.endsWith("-ocr.pdf")) {
    return await ocrPDF(filepath);
  }

  console.log(`New file detected: ${filepath}`);

  const { filename, tags, documentType } = await generateFilenameAndTags(filepath);

  console.log(`Generated Filename: ${filename}`);
  console.log(`Generated Tags: ${tags.join(", ")}`);
  console.log(`Document Type: ${documentType}`);

  const allTags = [...tags, documentType];
  await applyTags(filepath, allTags);

  const destDir = generateDestinationDirectory(PROCESSED_DIR);
  const newFilePath = path.join(destDir, filename);

  await promisify(fs.rename)(filepath, newFilePath);
});

function generateDestinationDirectory(dir: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const destDir = path.join(dir, `${year}`, `${month}`);

  fs.mkdirSync(destDir, { recursive: true });

  return destDir;
}

async function generateFilenameAndTags(
  filepath: string
): Promise<{ filename: string; tags: string[]; documentType: string }> {
  const images: Buffer[] = [];
  for await (const image of await pdfToImg(filepath)) {
    images.push(image);
  }

  const { response } = await ollama.generate({
    model: MODEL,
    system: `You are a document analysis assistant. Your job is to analyze document images and provide structured metadata for file organization. Always respond in valid JSON format with no additional text, explanations, or formatting.`,
    prompt: `Analyze these document images and provide:
1. A descriptive filename (include .pdf extension)
2. 3-5 relevant tags (no spaces, use underscores)
3. Document type classification from these categories: tax, financial, medical, legal, utility, insurance, personal, business, government, education, other

Guidelines:
- For tax documents, include form type (W2, 1040, etc.) and year
- For bills/invoices, include vendor name and type
- For personal documents, use descriptive categories
- Use lowercase with underscores for consistency
- Choose the most specific documentType that applies

Examples:
- Tax form → "2024_w2_acme_corp.pdf", tags: ["tax", "w2", "income", "2024"], documentType: "tax"
- Electric bill → "pg_e_electric_bill_march_2024.pdf", tags: ["utility", "electric", "bill", "pge"], documentType: "utility"
- Bank statement → "chase_bank_statement_january_2024.pdf", tags: ["bank", "statement", "finance", "chase"], documentType: "financial"
- Medical record → "dr_smith_visit_summary_feb_2024.pdf", tags: ["medical", "doctor", "health", "visit"], documentType: "medical"
- Insurance policy → "auto_insurance_policy_2024.pdf", tags: ["insurance", "auto", "policy", "2024"], documentType: "insurance"

Response format (JSON only):
{"filename": "descriptive_name.pdf", "tags": ["tag1", "tag2", "tag3"], "documentType": "category"}`,
    images,
  });

  try {
    return JSON.parse(response);
  } catch (e) {
    const match = response.match(/\{.*\}/s);
    if (!match) {
      throw new Error(`Invalid JSON response from Ollama: ${response}`);
    }
    
    try {
      return JSON.parse(match[0]);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON from response: ${response}`);
    }
  }
}

async function ocrPDF(pdfPath: string): Promise<void> {
  const destPath = pdfPath.replace(".pdf", "-ocr.pdf");
  const command = `ocrmypdf --rotate-pages --deskew --clean "${pdfPath}" "${destPath}"`;

  try {
    await promisify(exec)(command);
  } catch (error) {
    if (
      error instanceof Error &&
      ["PriorOcrFoundError", "TaggedPDFError"].some((errorType) =>
        error.message.includes(errorType)
      )
    ) {
      console.log("Prior OCR found. Skipping OCR.");
      await promisify(fs.rename)(pdfPath, destPath);
      return;
    }

    throw error;
  }
  await promisify(fs.rm)(pdfPath);
}

async function applyTags(
  filePath: string,
  tags: ReadonlyArray<string>
): Promise<void> {
  if (tags.length === 0) return;

  const tagString = tags.map((t) => t.replaceAll(" ", "_")).join(",");
  const command = `tag --add ${tagString} "${filePath}"`;

  await promisify(exec)(command);
  console.log(`Tags applied: ${tagString}`);
}

console.log("Watching for new scanned documents...");
