const vision = require("@google-cloud/vision");

const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

async function extractTextFromImage(imagePath) {
  try {
    const [result] = await client.textDetection(imagePath);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      return "";
    }

    return detections[0].description;
  } catch (error) {
    console.error("OCR hatası:", error.message);
    throw error;
  }
}

module.exports = { extractTextFromImage };