class FileUploadComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          border: 2px dashed #ccc;
          border-radius: 10px;
          width: 400px;
          text-align: center;
          background: #f9f9f9;
          transition: all 0.3s ease-in-out;
        }

        :host(:hover) {
          border-color: #007bff;
          background: #eef4ff;
        }

        #fileInput {
          display: none;
        }

        .upload-label {
          cursor: pointer;
          padding: 12px 20px;
          background: #007bff;
          color: white;
          border-radius: 5px;
          transition: background 0.3s ease-in-out;
        }

        .upload-label:hover {
          background: #0056b3;
        }

        .file-list {
          width: 100%;
          margin-top: 15px;
        }

        .file-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          width: 100%;
          margin-bottom: 10px;
          padding: 10px;
          background: #fff;
          border-radius: 5px;
          box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.1);
        }

        .file-name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #ddd;
          border-radius: 5px;
          overflow: hidden;
        }

        .progress-bar-inner {
          width: 0%;
          height: 100%;
          background: #28a745;
          transition: width 0.3s ease-in-out;
        }

        .file-status {
          margin-top: 5px;
          font-size: 12px;
        }

        .success {
          color: green;
        }

        .error {
          color: red;
        }
      </style>

      <label class="upload-label" for="fileInput">Choose Files to Upload</label>
      <input type="file" id="fileInput" multiple>
      <div class="file-list"></div>
    `;
  }

  async connectedCallback() {
    await this.initFileUploader();
  }

  async initFileUploader() {
    const response = await fetch('http://localhost:3000/config');
    const config = await response.json();

    this.fileUploader = new Resumable(config);

    this.fileUploader.assignBrowse(this.shadowRoot.querySelector('#fileInput'));

    this.fileUploader.on('fileAdded', this.handleFileAdded.bind(this));
    this.fileUploader.on('progress', this.updateProgress.bind(this));
    this.fileUploader.on('fileSuccess', this.handleFileSuccess.bind(this));
    this.fileUploader.on('fileError', this.handleFileError.bind(this));
  }

  handleFileAdded(file) {
    const timestamp = Date.now();
    file.uniqueIdentifier = `${timestamp}_${file.uniqueIdentifier}`; 
    file.fileName = `${timestamp}_${file.fileName}`; 

    const fileList = this.shadowRoot.querySelector('.file-list');

    const fileItem = document.createElement('div');
    fileItem.classList.add('file-item');
    fileItem.setAttribute('data-id', file.uniqueIdentifier);
    fileItem.innerHTML = `
      <div class="file-name">${file.fileName}</div>
      <div class="progress-bar"><div class="progress-bar-inner"></div></div>
      <div class="file-status">Uploading...</div>
    `;

    fileList.appendChild(fileItem);
    this.fileUploader.upload();
  }

  
  updateProgress() {
    this.fileUploader.files.forEach(file => {
      const progress = Math.floor(file.progress() * 100);
      const fileItem = this.shadowRoot.querySelector(`.file-item[data-id="${file.uniqueIdentifier}"]`);
      if (fileItem) {
        fileItem.querySelector('.progress-bar-inner').style.width = `${progress}%`;
      }
    });
  }

  updateFileStatus(file, message, status = '') {
    const fileItem = this.shadowRoot.querySelector(`.file-item[data-id="${file.uniqueIdentifier}"]`);
    if (fileItem) {
      const statusEl = fileItem.querySelector('.file-status');
      statusEl.textContent = message;
      statusEl.classList.remove('success', 'error');
      statusEl.classList.add(status);
    }
  }

  handleFileSuccess(file) {
    this.updateFileStatus(file, 'Upload Complete!', 'success');
    this.checkAndMerge(file); // Start merging
  }

  handleFileError(file, message) {
    this.updateFileStatus(file, `Upload Failed: ${message}`, 'error');
  }

  async checkAndMerge(file) {
    try {
      const response = await fetch('http://localhost:3000/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.fileName,
          identifier: file.uniqueIdentifier,
          totalChunks: file.chunks.length
        })
      });

      const data = await response.json();
      if (response.ok) {
        this.updateFileStatus(file, 'Upload and Merge Complete!', 'success');
        if (this.isVideoFile(file.fileName)) {
          this.checkCompressionStatus(file); // Check compression status for video files
        }
      } else {
        console.error(`Merge failed for ${file.fileName}:`, data);
        this.updateFileStatus(file, `Merge Failed: ${data.message}`, 'error');
      }
    } catch (error) {
      console.error(`Merge error for ${file.fileName}:`, error);
      this.updateFileStatus(file, `Merge Error: ${error.message}`, 'error');
    }
  }

  isVideoFile(fileName) {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv'];
    const fileExtension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    return videoExtensions.includes(fileExtension);
  }

  async checkCompressionStatus(file) {
    try {
      const response = await fetch(`http://localhost:3000/compression-status?filename=${file.fileName}`);
      const data = await response.json();
      if (response.ok && data.compressionComplete) {
        this.updateFileStatus(file, 'Compression Complete!', 'success');
      } else {
        setTimeout(() => this.checkCompressionStatus(file), 5000);
      }
    } catch (error) {
      console.error(`Compression status error for ${file.fileName}:`, error);
      this.updateFileStatus(file, `Compression Status Error: ${error.message}`, 'error');
    }
  }
}

customElements.define('file-upload-component', FileUploadComponent);
