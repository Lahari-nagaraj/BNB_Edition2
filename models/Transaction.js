const mongoose = require("mongoose");
const crypto = require("crypto");

const transactionSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
  budgetId: { type: mongoose.Schema.Types.ObjectId, ref: "Budget", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvedAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  transactionHash: { type: String, default: function() { 
    return crypto.createHash('sha256').update(`${this.description}-${this.amount}-${Date.now()}`).digest('hex');
  }},
  
  // Receipt information
  receipt: {
    url: { type: String },
    publicId: { type: String },
    filename: { type: String },
    mimetype: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date },
    verified: { type: Boolean, default: false },
    verificationScore: { type: Number, default: 0 },
    aiAnalysis: {
      isDuplicate: { type: Boolean, default: false },
      confidence: { type: Number, default: 0 },
      flags: [{ type: String }],
      summary: { type: String }
    }
  },
  
  // Additional fields
  notes: { type: String },
  category: { type: String },
  date: { type: Date, default: Date.now },
  
  // AI Classification
  aiClassification: {
    category: { type: String, enum: ["legit", "suspicious"], default: "legit" },
    score: { type: Number, default: 75 },
    reasons: [{ type: String }],
    recommendedActions: [{ type: String }]
  },
  
  // Approval workflow
  approvalComments: [{ 
    comment: String,
    commentedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    commentedAt: { type: Date, default: Date.now }
  }],
  
  // Public verification
  isPublic: { type: Boolean, default: true },
  verificationCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);
