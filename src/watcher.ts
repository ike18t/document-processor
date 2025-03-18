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
watch(WATCH_DIR, { persistent: true }).on("add", async (filepath) => {
  if (!filepath.endsWith(".pdf")) return;
  if (!filepath.endsWith("-ocr.pdf")) {
    return await ocrPDF(filepath);
  }

  console.log(`New file detected: ${filepath}`);

  const { filename, tags } = await generateFilenameAndTags(filepath);

  console.log(`Generated Filename: ${filename}`);
  console.log(`Generated Tags: ${tags.join(", ")}`);

  await applyTags(filepath, tags);

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
): Promise<{ filename: string; tags: string[] }> {
  const images: Buffer[] = [];
  for await (const image of await pdfToImg(filepath)) {
    images.push(image);
  }

  const { response } = await ollama.generate({
    model: MODEL,
    prompt: `Analyze the provided document images and generate:
      - A meaningful filename relevant to the document's content. Include the pdf file extension. If it is a tax document please include the type of tax form (e.g. 1040, W-2, etc).
      - Exactly 3-5 relevant tags that best describe the document. These tags must contain no spaces.

      Respond in **strict JSON format**:
      {
        "filename": "suggested_filename.pdf",
        "tags": ["tag1", "tag2", "tag3"]
      }

      No explanations or pleasantries, just JSON output.`,
    images,
  });

  const match = response.match(/\{.*\}/s);
  if (!match) {
    throw new Error("Invalid JSON response from Ollama:" + response);
  }

  return JSON.parse(match[0]);
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
