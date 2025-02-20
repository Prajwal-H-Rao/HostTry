const dotenv = require("dotenv");
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

const authRoutes = require("./routes/auth.js");
const uploadRoute = require("./routes/Upload.js");
app.use(cors());
app.use(express.json());
app.use(express.static("uploads"));
app.use(express.urlencoded({ extended: true }));
app.use("/auth", authRoutes);
app.use("/", uploadRoute);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to mongoDB");
    app.listen(port, () => {
      console.log(`Server running on port:${port}`);
    });
  })
  .catch((error) => console.error("MongoDB connection error:", error));
