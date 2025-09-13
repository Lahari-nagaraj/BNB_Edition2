const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  description: String,
  amount: Number,
  allocatedTo: String,
});

const budgetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    department: { type: String, required: true },
    state: { type: String, required: true },
    city: { type: String },
    country: { type: String, required: true },
    totalBudget: { type: Number, required: true },
    spent: { type: Number, default: 0 },
    remaining: { type: Number, default: function() { return this.totalBudget - this.spent; } },
    fiscalYear: { type: String, required: true },
    approvedBy: { type: String, required: true },
    type: { type: String, enum: ["Public", "Private"], required: true },
    status: { type: String, enum: ["draft", "pending", "approved", "rejected", "active", "completed"], default: "draft" },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedEditors: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Editor'
    }],
    // Keep for backward compatibility
    editorEmail: String,
    editorPassword: String,
    expenses: [expenseSchema], // Keep for backward compatibility
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String },
    tags: [{ type: String }],
    authenticityHash: { type: String, unique: true, sparse: true }, // Make it sparse to allow null values
    aiSummary: { type: String },
    faq: [{ q: String, a: String }],
    departmentsCount: { type: Number, default: 0 },
    projectsCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Budget", budgetSchema);
