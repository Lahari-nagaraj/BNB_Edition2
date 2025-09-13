const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema({
  name: String,
  department: String,
  state: String,
  amount: Number,
  fiscalYear: String,
  approvedBy: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Budget", budgetSchema, "budgets");
