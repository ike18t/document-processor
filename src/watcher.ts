import fs from "fs";
import path from "path";
import { watch } from "chokidar";
import { exec } from "child_process";
import env from "env-var";
import { config } from "dotenv";
import Tesseract from "tesseract.js";
import { pdf as pdfToImg } from "pdf-to-img";
import ollama from "ollama";

config();

const WATCH_DIR = env.get("WATCH_DIR").required().asString(); // Directory to watch for new files
const PROCESSED_DIR = env.get("PROCESSED_DIR").required().asString(); // Directory to move processed files
const MODEL = env.get("MODEL").required().asString(); // Directory to move processed files

console.log("WATCH_DIR:", WATCH_DIR);
watch(WATCH_DIR, {
  persistent: true,
}).on("add", async (filepath) => {
  if (!filepath.endsWith(".pdf")) return;

  console.log(`New file detected: ${filepath}`);

  const text = await ocrExtractText(filepath);
  console.log(`Extracted Text:\n${text.substring(0, 500)}`);

  // Get AI-generated tags from DeepSeek
  const tags = await generateTags(text);
  console.log(`Generated Tags: ${tags.join(", ")}`);

  // Apply macOS tags
  await applyTags(filepath, tags);

  // Get AI-generated filename from DeepSeek
  const newFilename = await generateFilename(text);

  // Determine the year and month for directory structure
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Ensure 2-digit month

  // Create destination directory if it doesn’t exist
  const destDir = path.join(PROCESSED_DIR, `${year}`, `${month}`);
  fs.mkdirSync(destDir, { recursive: true });

  // Move the file to the structured directory
  const newFilePath = path.join(destDir, newFilename);
  fs.rename(filepath, newFilePath, (err) => {
    if (err) console.error("Error moving file:", err);
    else console.log(`File moved to: ${newFilePath}`);
  });
});

async function ocrExtractText(pdfPath: string) {
  // Convert PDF pages to in-memory images
  const images = await pdfToImg(pdfPath);
  let pageText = [];

  for await (const image of images) {
    // Run OCR on each image
    const {
      data: { text },
    } = await Tesseract.recognize(image);

    pageText.push(text);
  }

  return pageText.join("\n");
}

// **Call DeepSeek in Docker for AI-generated tags**
async function generateTags(text: string): Promise<ReadonlyArray<string>> {
  const { response } = await ollama.generate({
    model: MODEL,
    prompt:
      `Generate exactly 3-5 relevant tags that gives the most insight into the content for the following document, and remember that tags cannot have spaces.
      Respond in pure JSON format as follows (quotes around keys): {"tags": ["tag1", "tag2", "tag3"]}.
      No extra text or explanations.

      Document Text:` + text,
  });

  const { tags }: { tags: ReadonlyArray<string> } = JSON.parse(response);

  return tags;
}

// **Apply macOS Tags**
async function applyTags(
  filePath: string,
  tags: ReadonlyArray<string>
): Promise<void> {
  if (tags.length === 0) return;

  const tagString = tags.join(",");
  const command = `tag --add ${tagString} "${filePath}"`;

  exec(command, (error, _stdout, stderr) => {
    if (error) {
      console.error(`Error applying tags: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`Tags applied: ${tags.join(", ")}`);
  });
}

// **Call DeepSeek in Docker for AI-generated filename**
async function generateFilename(text: string): Promise<string> {
  const { response } = await ollama.generate({
    model: MODEL,
    prompt:
      `Generate a meaningful filename for the following document and include the pdf extension.
      Respond in pure JSON format as follows (quotes around keys): {"filename": "desired_filename"}.
      No extra text or explanations.

      Document Text:` + text,
  });

  const { filename }: { filename: string } = JSON.parse(response);

  return filename;
}

console.log("Watching for new scanned documents...");
