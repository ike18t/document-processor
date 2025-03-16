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
const execPromise = promisify(exec);

const WATCH_DIR = env.get("WATCH_DIR").required().asString(); // Directory to watch for new files
const PROCESSED_DIR = env.get("PROCESSED_DIR").required().asString(); // Directory to move processed files
const MODEL = env.get("MODEL").required().asString(); // Directory to move processed files

console.log("WATCH_DIR:", WATCH_DIR);
watch(WATCH_DIR, { persistent: true }).on("add", async (filepath) => {
  if (!filepath.endsWith(".pdf")) return;

  console.log(`New file detected: ${filepath}`);

  const images: Buffer[] = [];
  for await (const image of await pdfToImg(filepath)) {
    images.push(image);
  }

  // Get AI-generated filename and tags from Llama-Vision
  const { filename, tags } = await generateFilenameAndTags(images);

  console.log(`Generated Filename: ${filename}`);
  console.log(`Generated Tags: ${tags.join(", ")}`);

  // Apply macOS tags
  await applyTags(filepath, tags);

  // Move the file to a structured directory
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const destDir = path.join(PROCESSED_DIR, `${year}`, `${month}`);
  fs.mkdirSync(destDir, { recursive: true });

  const newFilePath = path.join(destDir, filename);
  fs.rename(filepath, newFilePath, (err) => {
    if (err) console.error("Error moving file:", err);
    else console.log(`File moved to: ${newFilePath}`);
  });
});

// **Send Images to Llama-Vision to Get Filename & Tags**
async function generateFilenameAndTags(
  images: Buffer[]
): Promise<{ filename: string; tags: string[] }> {
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

  // Extract JSON safely
  const match = response.match(/\{.*\}/s);
  if (!match) {
    console.error("Invalid JSON response from Ollama:", response);
    return { filename: "unknown_document.pdf", tags: [] };
  }

  return JSON.parse(match[0]);
}

// **Apply macOS Tags**
async function applyTags(
  filePath: string,
  tags: ReadonlyArray<string>
): Promise<void> {
  if (tags.length === 0) return;

  const tagString = tags.join(",");
  const command = `tag --add ${tagString} "${filePath}"`;

  await execPromise(command);
  console.log(`Tags applied: ${tags.join(", ")}`);
}

console.log("Watching for new scanned documents...");
