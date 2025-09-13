require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_KEY_NAME,
  api_key: process.env.COUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

console.log('Cloudinary configured successfully');

class CloudinaryService {
  constructor() {
    this.cloudinary = cloudinary;
  }

  // Upload receipt image/PDF
  async uploadReceipt(file, transactionId) {
    try {
      // Check if Cloudinary is configured
      if (!process.env.CLOUD_KEY_NAME) {
        return {
          success: false,
          error: 'Cloudinary not configured. Please add CLOUD_KEY_NAME, COUD_API_KEY, and CLOUD_API_SECRET to your .env file'
        };
      }

      // Use file buffer instead of file path to avoid file system issues
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
          folder: 'bnb-receipts',
          public_id: `receipt_${transactionId}_${Date.now()}`,
          resource_type: 'auto', // Automatically detect image or PDF
          transformation: [
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        
        uploadStream.end(file.buffer);
      });

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        size: result.bytes
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete receipt
  async deleteReceipt(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return {
        success: result.result === 'ok',
        result: result.result
      };
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate receipt thumbnail
  async generateThumbnail(publicId) {
    try {
      const thumbnailUrl = cloudinary.url(publicId, {
        width: 200,
        height: 200,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto'
      });
      return thumbnailUrl;
    } catch (error) {
      console.error('Thumbnail generation error:', error);
      return null;
    }
  }

  // Verify receipt format and content
  async verifyReceipt(url) {
    try {
      // Extract public ID from URL
      const publicId = this.extractPublicId(url);
      
      // Get image info
      const result = await cloudinary.api.resource(publicId);
      
      return {
        success: true,
        format: result.format,
        size: result.bytes,
        width: result.width,
        height: result.height,
        createdAt: result.created_at,
        isImage: ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(result.format.toLowerCase()),
        isPDF: result.format.toLowerCase() === 'pdf'
      };
    } catch (error) {
      console.error('Receipt verification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Extract public ID from Cloudinary URL
  extractPublicId(url) {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    return filename.split('.')[0];
  }

  // Generate optimized URL for different use cases
  generateOptimizedUrl(publicId, options = {}) {
    const defaultOptions = {
      quality: 'auto',
      fetch_format: 'auto',
      ...options
    };
    
    return cloudinary.url(publicId, defaultOptions);
  }

  // Get storage usage statistics
  async getStorageStats() {
    try {
      const result = await cloudinary.api.usage();
      return {
        success: true,
        plan: result.plan,
        objects: result.objects,
        bandwidth: result.bandwidth,
        storage: result.storage,
        requests: result.requests,
        resources: result.resources,
        derived_resources: result.derived_resources
      };
    } catch (error) {
      console.error('Storage stats error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Configure multer for file uploads (memory storage)
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.log('File type rejected:', file.mimetype);
      cb(new Error('Invalid file type. Only images (JPG, PNG, GIF, WebP) and PDFs are allowed.'), false);
    }
  }
});

module.exports = {
  cloudinaryService: new CloudinaryService(),
  upload: upload
};
