const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Assuming you have a User model to fetch user data

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// Middleware to check JWT and fetch user email
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    req.userEmail = user.email;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
};

async function getGeminiResponse(prompt) {
  const result = await model.generateContent(prompt);

  return result.response.text();
}

router.post(
  "/upload",
  authenticate,
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userEmail = req.userEmail;
    const userDir = path.join(
      "uploads",
      userEmail,
      `${path.parse(req.file.originalname).name}`
    );
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    const audioPath = req.file.path;
    const outputPath = path.join(
      userDir,
      `${path.parse(req.file.originalname).name}.wav`
    );

    // Convert to WAV format
    ffmpeg(audioPath)
      .output(outputPath)
      .audioFrequency(16000) // Whisper works best with 16kHz
      .on("end", async () => {
        try {
          const audioFile = fs.createReadStream(outputPath);
          const formData = new FormData();
          formData.append("file", audioFile); // Ensure `audioFile` is a valid File object

          // Updated axios request with proper endpoint & headers
          axios
            .post(`${process.env.FLASK_SERVER_URL}/transcribe`, formData, {
              headers: formData.getHeaders(),
            })
            .then(async (response) => {
              const transcriptionPath = path.join(
                userDir,
                `${path.parse(req.file.originalname).name}_${
                  req.body.language
                }.txt`
              );
              fs.writeFileSync(transcriptionPath, response.data.transcription);
              const translatedData = await getGeminiResponse(
                `Translate: "${response.data.transcription}" to ${req.body.language}`
              );
              fs.appendFileSync(
                transcriptionPath,
                `\n\nTranslated Text:\n${translatedData}`
              );
              // console.log(translatedData);
              res.json({ transcription: translatedData });
            })
            .catch((error) => {
              console.error("Error:", error);
              res.status(500).json({ error: "Transcription service error" });
            });
        } catch (error) {
          console.error("Transcription failed:", error);
          res.status(500).json({ error: "Transcription failed" });
        }
      })
      .on("error", (err) => {
        console.error("FFmpeg Error:", err);
        res.status(500).json({ error: "Audio processing failed" });
      })
      .run();
  }
);

router.get("/uploads/:email", authenticate, async (req, res) => {
  const userEmail = req.params.email;
  const userDir = path.join("uploads", userEmail);
  // console.log(userDir);
  if (!fs.existsSync(userDir)) {
    return res.status(404).json({ error: "No files found for this user" });
  }

  fs.readdir(userDir, (err, subdirs) => {
    if (err) {
      console.error("Error reading directory:", err);
      return res.status(500).json({ error: "Error reading directory" });
    }

    const fileContents = [];
    subdirs.forEach((subdir) => {
      const subdirPath = path.join(userDir, subdir);
      if (fs.lstatSync(subdirPath).isDirectory()) {
        const textFiles = fs
          .readdirSync(subdirPath)
          .filter((file) => file.endsWith(".txt"));
        textFiles.forEach((file) => {
          const filePath = path.join(subdirPath, file);
          fileContents.push({
            fileName: path.join(subdir, file),
          });
        });
      }
    });
    res.json({ files: fileContents });
  });
});

router.get("/download/:mail/:dir/:file", authenticate, async (req, res) => {
  const filePath = path.join(
    __dirname,
    "..",
    "uploads",
    req.params.mail,
    req.params.dir,
    req.params.file
  );

  if (fs.existsSync(filePath)) {
    res.download(filePath, req.params.file, (err) => {
      if (err) {
        console.error("Error sending file:", err);
        res.status(500).send("Error downloading file");
      }
    });
  } else {
    res.status(404).send("File not found");
  }
});

module.exports = router;
