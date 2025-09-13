require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");
const User = require("./public/models/User");
const Budget = require("./public/models/Budget");

const app = express();
const PORT = process.env.PORT || 8080;

mongoose.connect(process.env.MONGO_URI, {
  dbName: "bnb-fund-management",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public", "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secretkey",
    resave: false,
    saveUninitialized: false,
  })
);

app.get("/", async (req, res) => {
  const users = await User.find().limit(5);
  const budgets = await Budget.find().limit(5);
  res.render("home", {
    title: "BNB Fund Management",
    users,
    budgets,
  });
});

app.get("/add-user", async (req, res) => {
  const hashed = await bcrypt.hash("password123", 10);
  const newUser = new User({
    name: "Test User",
    email: "test@example.com",
    password: hashed,
  });
  await newUser.save();
  res.send("User added. Go back to /");
});

app.get("/add-budget", async (req, res) => {
  const budget = new Budget({
    name: "Healthcare Grant",
    department: "Health",
    state: "Maharashtra",
    amount: 75000000,
    fiscalYear: "2024-2025",
    approvedBy: "Finance Ministry",
  });
  await budget.save();
  res.send("Budget added. Go back to /");
});

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
