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
  let userState = req.query.state || null;
  let budgets;
  if (userState) {
    budgets = await Budget.find({ state: userState, type: "Public" }).limit(10);
  } else {
    budgets = await Budget.find({ type: "Public" }).limit(10);
  }
  const users = await User.find().limit(5);
  res.render("home", {
    title: "BNB Fund Management",
    users,
    budgets,
    session: req.session,
    userState,
  });
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Login - BNB Fund Management", error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.userId = user._id;
    res.redirect("/");
  } else {
    res.render("login", {
      title: "Login - BNB Fund Management",
      error: "Invalid credentials",
    });
  }
});

app.get("/register", (req, res) => {
  res.render("register", {
    title: "Register - BNB Fund Management",
    error: null,
  });
});

app.post("/register", async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.render("register", {
      title: "Register - BNB Fund Management",
      error: "Passwords do not match",
    });
  }
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.render("register", {
      title: "Register - BNB Fund Management",
      error: "Email already exists",
    });
  }
  const hashed = await bcrypt.hash(password, 10);
  const newUser = new User({ name, email, password: hashed });
  await newUser.save();
  req.session.userId = newUser._id;
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/budget/new", (req, res) => {
  res.render("addBudget", { title: "Add Budget" });
});

app.post("/budget/new", async (req, res) => {
  const {
    name,
    department,
    state,
    country,
    totalBudget,
    fiscalYear,
    approvedBy,
    type,
    expenses,
  } = req.body;
  const budget = new Budget({
    name,
    department,
    state,
    country,
    totalBudget,
    fiscalYear,
    approvedBy,
    type,
    expenses,
  });
  await budget.save();
  res.redirect("/");
});

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
