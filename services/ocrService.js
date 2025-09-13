const Tesseract = require('tesseract.js');
const axios = require('axios');

class OCRService {
  constructor() {
    this.worker = null;
    this.isAvailable = true;
  }

  // Initialize Tesseract worker
  async initializeWorker() {
    if (!this.isAvailable) {
      throw new Error('OCR service is disabled due to previous errors');
    }
    
    if (!this.worker) {
      try {
        this.worker = await Tesseract.createWorker('eng', 1, {
          logger: m => {
            // Only log important messages, not all progress updates
            if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract' || m.status === 'loading language traineddata' || m.status === 'initializing api') {
              console.log(`OCR: ${m.status} - ${m.progress * 100}%`);
            }
          }
        });
      } catch (error) {
        console.error('Failed to initialize Tesseract worker:', error);
        this.isAvailable = false;
        throw new Error('OCR service unavailable');
      }
    }
    return this.worker;
  }

  // Extract text from image using Tesseract OCR
  async extractTextFromImage(imagePath) {
    try {
      const worker = await this.initializeWorker();
      const { data: { text } } = await worker.recognize(imagePath);
      return {
        success: true,
        text: text.trim(),
        confidence: 0.8 // Tesseract doesn't provide confidence in this version
      };
    } catch (error) {
      console.error('OCR extraction error:', error);
      this.isAvailable = false; // Disable OCR after first error
      return {
        success: false,
        error: 'OCR service temporarily unavailable',
        text: ''
      };
    }
  }

  // Extract text from image URL
  async extractTextFromUrl(imageUrl) {
    try {
      const worker = await this.initializeWorker();
      const { data: { text } } = await worker.recognize(imageUrl);
      return {
        success: true,
        text: text.trim(),
        confidence: 0.8
      };
    } catch (error) {
      console.error('OCR extraction from URL error:', error);
      this.isAvailable = false; // Disable OCR after first error
      return {
        success: false,
        error: 'OCR service temporarily unavailable',
        text: ''
      };
    }
  }

  // Parse receipt data from OCR text
  parseReceiptData(ocrText) {
    const receiptData = {
      vendor: '',
      amount: 0,
      date: '',
      items: [],
      tax: 0,
      total: 0,
      rawText: ocrText
    };

    try {
      // Extract amount patterns (₹, $, numbers with decimals)
      const amountPatterns = [
        /₹\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
        /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
        /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rupees?|rs)/gi,
        /total[:\s]*₹?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
        /amount[:\s]*₹?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi
      ];

      let amounts = [];
      amountPatterns.forEach(pattern => {
        const matches = [...ocrText.matchAll(pattern)];
        matches.forEach(match => {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (amount > 0) {
            amounts.push(amount);
          }
        });
      });

      // Get the largest amount as total
      if (amounts.length > 0) {
        receiptData.total = Math.max(...amounts);
        receiptData.amount = receiptData.total;
      }

      // Extract date patterns
      const datePatterns = [
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
        /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{2,4})/gi,
        /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g
      ];

      datePatterns.forEach(pattern => {
        const match = ocrText.match(pattern);
        if (match && !receiptData.date) {
          receiptData.date = match[0];
        }
      });

      // Extract vendor name (usually at the top)
      const lines = ocrText.split('\n').filter(line => line.trim().length > 0);
      if (lines.length > 0) {
        // First non-empty line is often the vendor name
        receiptData.vendor = lines[0].trim();
      }

      // Extract tax information
      const taxPatterns = [
        /tax[:\s]*₹?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
        /gst[:\s]*₹?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
        /vat[:\s]*₹?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi
      ];

      taxPatterns.forEach(pattern => {
        const match = ocrText.match(pattern);
        if (match) {
          receiptData.tax = parseFloat(match[1].replace(/,/g, ''));
        }
      });

      // Extract items (lines that contain amounts but aren't totals)
      const itemLines = lines.filter(line => {
        const hasAmount = /₹?\s*\d+(?:,\d{3})*(?:\.\d{2})?/.test(line);
        const isTotal = /total|amount|sum|subtotal/gi.test(line);
        return hasAmount && !isTotal && line.length > 10;
      });

      receiptData.items = itemLines.map(line => ({
        description: line.replace(/₹?\s*\d+(?:,\d{3})*(?:\.\d{2})?/g, '').trim(),
        amount: parseFloat(line.match(/₹?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/)?.[1]?.replace(/,/g, '') || 0)
      }));

    } catch (error) {
      console.error('Receipt parsing error:', error);
    }

    return receiptData;
  }

  // Process receipt with OCR and parsing
  async processReceipt(imagePath) {
    try {
      // Extract text using OCR
      const ocrResult = await this.extractTextFromImage(imagePath);
      
      if (!ocrResult.success) {
        return {
          success: false,
          error: ocrResult.error,
          data: null
        };
      }

      // Parse the extracted text
      const receiptData = this.parseReceiptData(ocrResult.text);

      return {
        success: true,
        data: receiptData,
        confidence: ocrResult.confidence
      };
    } catch (error) {
      console.error('Receipt processing error:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  // Process receipt from URL
  async processReceiptFromUrl(imageUrl) {
    try {
      // Extract text using OCR
      const ocrResult = await this.extractTextFromUrl(imageUrl);
      
      if (!ocrResult.success) {
        return {
          success: false,
          error: ocrResult.error,
          data: null
        };
      }

      // Parse the extracted text
      const receiptData = this.parseReceiptData(ocrResult.text);

      return {
        success: true,
        data: receiptData,
        confidence: ocrResult.confidence
      };
    } catch (error) {
      console.error('Receipt processing from URL error:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  // Clean up worker
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

module.exports = new OCRService();
