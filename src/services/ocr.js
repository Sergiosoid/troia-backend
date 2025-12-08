import { createWorker } from 'tesseract.js';

export async function ocrFromFile(imagePath) {
  const worker = await createWorker();

  try {
    await worker.loadLanguage('por');
    await worker.initialize('por');

    const { data } = await worker.recognize(imagePath);

    await worker.terminate();
    return data.text;

  } catch (error) {
    console.error("Erro no OCR:", error);
    await worker.terminate();
    throw error;
  }
}
