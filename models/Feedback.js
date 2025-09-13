const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  budgetId: { type: mongoose.Schema.Types.ObjectId, ref: "Budget", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Optional for anonymous feedback
  type: { 
    type: String, 
    enum: ["suggestion", "complaint", "question", "praise", "concern"],
    required: true 
  },
  category: {
    type: String,
    enum: ["budget_allocation", "transparency", "efficiency", "corruption", "other"],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5 }, // 1-5 star rating
  isAnonymous: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ["pending", "under_review", "addressed", "rejected", "resolved"], 
    default: "pending" 
  },
  
  // Response from admin
  adminResponse: {
    message: String,
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    respondedAt: Date
  },
  
  // Moderation
  isModerated: { type: Boolean, default: false },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  moderatedAt: Date,
  moderationReason: String,
  
  // Engagement
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  reports: { type: Number, default: 0 },
  
  // Priority
  priority: { 
    type: String, 
    enum: ["low", "medium", "high", "urgent"], 
    default: "medium" 
  },
  
  // Tags for categorization
  tags: [{ type: String }],
  
  // Attachments
  attachments: [{
    filename: String,
    url: String,
    mimetype: String,
    size: Number
  }]
}, { timestamps: true });

// Index for better query performance
feedbackSchema.index({ budgetId: 1, status: 1 });
feedbackSchema.index({ type: 1, category: 1 });
feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
