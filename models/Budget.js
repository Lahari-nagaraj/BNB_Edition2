const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  description: String,
  amount: Number,
  allocatedTo: String,
});

const budgetSchema = new mongoose.Schema(
  {
    name: String,
    department: String,
    state: String,
    country: String,
    totalBudget: Number,
    fiscalYear: String,
    approvedBy: String,
    type: String,
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    editorEmail: String,
    editorPassword: String,
    expenses: [expenseSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Budget", budgetSchema);
