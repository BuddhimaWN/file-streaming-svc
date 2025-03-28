const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');


const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunk size
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv'];
const FILE_LIST_PATH = path.join(__dirname, 'file_list.json');

class FileUpload {
  constructor({ uploadDir = 'uploads', mergedDir = 'merged' } = {}) {
    this.uploadDir = uploadDir;
    this.mergedDir = mergedDir;
    this.ensureDirectoriesExist();
    this.ensureFileListExists();
  }

  ensureDirectoriesExist() {
    if (!fs.existsSync(this.uploadDir)) fs.mkdirSync(this.uploadDir);
    if (!fs.existsSync(this.mergedDir)) fs.mkdirSync(this.mergedDir);
  }

  ensureFileListExists() {
    if (!fs.existsSync(FILE_LIST_PATH) || fs.readFileSync(FILE_LIST_PATH).length === 0) {
      fs.writeFileSync(FILE_LIST_PATH, JSON.stringify([]));
    }
  }

  getMulterMiddleware() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, this.uploadDir),
      filename: (req, file, cb) => {
        const { resumableIdentifier, resumableChunkNumber } = req.body;
        cb(null, `${resumableIdentifier}_${resumableChunkNumber}`);
      }
    });

    return multer({ 
      storage,
      limits: { fileSize: MAX_FILE_SIZE }
    });
  }

  handleChunkUpload(req, res) {
    const { resumableIdentifier, resumableChunkNumber } = req.body;
    const chunkPath = path.join(this.uploadDir, `${resumableIdentifier}_${resumableChunkNumber}`);
    if (fs.existsSync(chunkPath)) {
      return res.status(200).json({ message: 'Chunk already exists' });
    }
    res.status(200).json({ message: 'Chunk uploaded successfully!' });
  }

  handleChunkTest(req, res) {
    const { resumableIdentifier, resumableChunkNumber } = req.query;
    const chunkPath = path.join(this.uploadDir, `${resumableIdentifier}_${resumableChunkNumber}`);
    
    if (fs.existsSync(chunkPath)) {
      return res.status(200).send('Chunk exists');
    } else {
      return res.status(204).send('Chunk not found');
    }
  }

  async handleMergeChunks(req, res) {
    let { filename, identifier, totalChunks } = req.body;
    filename = this.sanitizeFilename(filename);
    const filePath = path.join(this.mergedDir, filename);
    const writeStream = fs.createWriteStream(filePath);

    try {
      for (let currentChunk = 1; currentChunk <= totalChunks; currentChunk++) {
        const chunkPath = path.join(this.uploadDir, `${identifier}_${currentChunk}`);
        if (!fs.existsSync(chunkPath)) {
          return res.status(400).json({ message: `Missing chunk ${currentChunk}` });
        }

        const readStream = fs.createReadStream(chunkPath);
        await new Promise((resolve, reject) => {
          readStream.pipe(writeStream, { end: false });
          readStream.on('end', () => {
            fs.unlinkSync(chunkPath);
            resolve();
          });
          readStream.on('error', reject);
        });
      }  
      writeStream.end();
      this.processVideoIfNeeded(filePath);
      this.saveFileMetadata(filename);
      
      res.status(200).json({ message: 'File merged successfully!', filePath });
    } catch (err) {
      res.status(500).json({ message: 'Error during file merge', error: err });
    }
  }

  processVideoIfNeeded(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!VIDEO_EXTENSIONS.includes(ext)) return; 

    const filenameWithoutExt = path.basename(filePath, ext);
    const thumbnailPath = path.join(this.mergedDir, `${filenameWithoutExt}_compressed.jpg`);
    const compressedPath = path.join(this.mergedDir, `${filenameWithoutExt}_compressed.mp4`);

    const ffmpegCommand = `
      ffmpeg -i "${filePath}" -ss 4 -vframes 1 "${thumbnailPath}" &&
      ffmpeg -i "${filePath}" -s 854x480 -vcodec libx265 -crf 30 -preset slow -c:a aac -b:a 64k -map 0 "${compressedPath}"
    `;

    exec(ffmpegCommand, (error) => {
      if (error) {
        console.error(`Error processing video ${filePath}:`, error.message);
      } else {
        console.log(`Thumbnail and compressed video created for ${filePath}`);
        this.saveFileMetadata(`${filenameWithoutExt}_compressed.mp4`); 
        this.updateCompressionStatus(filenameWithoutExt, true); 
      }
    });
  }

  updateCompressionStatus(filenameWithoutExt, status) {
    const fileList = JSON.parse(fs.readFileSync(FILE_LIST_PATH));
    const fileIndex = fileList.findIndex(file => file.filename.includes(filenameWithoutExt));
    if (fileIndex !== -1) {
      fileList[fileIndex].compressionComplete = status;
      fs.writeFileSync(FILE_LIST_PATH, JSON.stringify(fileList, null, 2));
    }
  }

  getCompressionStatus(req, res) {
    const { filename } = req.query;
    const filenameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    const fileList = JSON.parse(fs.readFileSync(FILE_LIST_PATH));
    const file = fileList.find(file => file.filename.includes(filenameWithoutExt));
    if (file) {
      res.json({ compressionComplete: file.compressionComplete || false });
    } else {
      res.status(404).json({ message: 'File not found' });
    }
  }

  sanitizeFilename(filename) {
    return filename.replace(/\s+/g, '_').replace(/[()]/g, '');
  }

  saveFileMetadata(filename) {
    const metadata = {
      filename,
      uploadDate: new Date().toISOString()
    };

    const fileList = JSON.parse(fs.readFileSync(FILE_LIST_PATH));
    fileList.push(metadata);
    fs.writeFileSync(FILE_LIST_PATH, JSON.stringify(fileList, null, 2));
  }

  getVideos(req, res) {
    try {
      const fileList = JSON.parse(fs.readFileSync(FILE_LIST_PATH));
      res.json(fileList.map(file => file.filename));
    } catch (error) {
      res.status(500).json({ message: 'Error reading file list', error });
    }
  }

  getResumableConfig(req, res) {
    res.json({
      target: 'http://localhost:3000/upload',
      fileTypes: ['*'],
      maxFileSize: MAX_FILE_SIZE,
      chunkSize: CHUNK_SIZE,
      testChunks: true,
      throttleProgressCallbacks: 1,
      maxRetries: 3,
      chunkRetryInterval: 2000,
    });
  }

  streamVideo(req, res) {
    const videoPath = path.join(this.mergedDir, req.params.filename);
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ message: 'Video not found' });
    }
  
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
  
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  }
}

module.exports = FileUpload;


