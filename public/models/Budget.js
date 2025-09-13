const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  description: String,
  amount: Number,
  allocatedTo: String,
});

const budgetSchema = new mongoose.Schema({
  name: String,
  department: String,
  state: String,
  country: { type: String, default: "India" },
  totalBudget: Number,
  fiscalYear: String,
  approvedBy: String,
  type: { type: String, enum: ["Public", "Private"], default: "Public" },
  expenses: [expenseSchema],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Budget", budgetSchema);
