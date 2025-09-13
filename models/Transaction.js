const mongoose = require("mongoose");
const crypto = require("crypto");

const transactionSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
  budgetId: { type: mongoose.Schema.Types.ObjectId, ref: "Budget", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvedAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  transactionHash: { type: String, default: function() { 
    return crypto.createHash('sha256').update(`${this.description}-${this.amount}-${Date.now()}`).digest('hex');
  }},
  receipt: { type: String }, // File path or URL
  notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);
