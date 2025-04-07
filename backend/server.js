const express = require('express');
const cors = require('cors');
const FileUpload = require('./fileUpload');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
const fileUpload = new FileUpload();
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv'];

app.use(cors());
app.use(express.json());
app.use('/libs', express.static('loaderjs'));
app.use('/videos', express.static(fileUpload.mergedDir));

const upload = fileUpload.getMulterMiddleware();

app.post('/upload', upload.single('file'), (req, res) => fileUpload.handleChunkUpload(req, res));
app.get('/upload', (req, res) => fileUpload.handleChunkTest(req, res));
app.post('/merge', (req, res) => fileUpload.handleMergeChunks(req, res));
app.get('/config', (req, res) => fileUpload.getResumableConfig(req, res));
app.get('/videos', (req, res) => {fileUpload.getVideos(req, res)});
app.get('/compression-status', (req, res) => fileUpload.getCompressionStatus(req, res));
app.get('/videos/:filename', (req, res) => fileUpload.streamVideo(req, res));

// Serve image
app.get('/image', (req, res) => {
  const imagePath = path.join(__dirname, 'laptop.jpg');
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ message: 'Image not found' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server listening at http://localhost:${port}`);
});
