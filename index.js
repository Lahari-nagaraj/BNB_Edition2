require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const User = require("./models/User");
const Budget = require("./models/Budget");
const Department = require("./models/Department");
const Project = require("./models/Project");
const Vendor = require("./models/Vendor");
const Transaction = require("./models/Transaction");
const AuditLog = require("./models/AuditLog");
const aiService = require("./services/aiService");
const visualizationService = require("./services/visualizationService");

const app = express();
const PORT = process.env.PORT || 8080;

mongoose
  .connect(process.env.MONGO_URI, { dbName: "bnb-fund-management" })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public/views"));
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

const indianStates = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
  "Chandigarh",
  "Daman and Diu",
  "Dadra and Nagar Haveli",
  "Lakshadweep",
  "Andaman and Nicobar Islands",
];

// Audit logging middleware
const auditLog = async (action, entityType, entityId, entityName, req, oldData = null, newData = null) => {
  try {
    if (req.session.userId) {
      const user = await User.findById(req.session.userId);
      const audit = new AuditLog({
        action,
        entityType,
        entityId,
        entityName,
        userId: req.session.userId,
        userName: user.name,
        oldData,
        newData,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      await audit.save();
    }
  } catch (error) {
    console.error('Audit logging error:', error);
  }
};

app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

app.get("/", async (req, res) => {
  try {
    const query = { type: "Public", status: { $in: ["approved", "active"] } };
    const searchQuery = req.query.q || "";
    const userState = req.query.userState || "";
    const department = req.query.department || "";
    const budgetType = req.query.budgetType || "";

    if (searchQuery) query.name = { $regex: searchQuery, $options: "i" };
    if (userState) query.state = userState;
    if (department) query.department = { $regex: department, $options: "i" };
    if (budgetType) query.type = budgetType;

    const budgets = await Budget.find(query).populate("creator").limit(20);
    
    // Get unique departments for filter
    const departments = await Budget.distinct("department", { type: "Public" });
    
    res.render("home", {
      title: "BNB Fund Management",
      budgets,
      indianStates,
      departments,
      searchQuery,
      userState,
      department,
      budgetType,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server Error");
  }
});


// LOGIN
app.get("/login", (req, res) =>
  res.render("login", { title: "Login", error: null })
);
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.userId = user._id;
    req.session.isAdmin = user.isAdmin || user.role === "admin";
    req.session.userRole = user.role;
    req.session.userName = user.name;
    
    await auditLog("login", "User", user._id, user.name, req);
    
    if (user.role === "admin" || user.isAdmin) return res.redirect("/admin/dashboard");
    if (user.role === "manager") return res.redirect("/dashboard");
    return res.redirect("/");
  }
  res.render("login", { title: "Login", error: "Invalid credentials" });
});

// REGISTER
app.get("/register", (req, res) =>
  res.render("register", { title: "Register", error: null })
);
app.post("/register", async (req, res) => {
  const { name, email, password, confirmPassword, role } = req.body;
  if (password !== confirmPassword)
    return res.render("register", {
      title: "Register",
      error: "Passwords do not match",
    });
  if (await User.findOne({ email }))
    return res.render("register", {
      title: "Register",
      error: "Email already exists",
    });
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ 
    name, 
    email, 
    password: hashed, 
    role: role || "public",
    isAdmin: role === "admin" // Set isAdmin for backward compatibility
  });
  await user.save();
  req.session.userId = user._id;
  req.session.isAdmin = user.isAdmin;
  req.session.userRole = user.role;
  req.session.userName = user.name;
  
  await auditLog("register", "User", user._id, user.name, req);
  
  if (user.role === "admin" || user.isAdmin) return res.redirect("/admin/dashboard");
  if (user.role === "manager") return res.redirect("/dashboard");
  res.redirect("/");
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// CREATE BUDGET
app.get("/budget/new", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.render("addBudget", {
    title: "Create Budget",
    error: null,
    states: indianStates,
  });
});
app.post("/budget/new", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const {
    name,
    department,
    state,
    country,
    totalBudget,
    fiscalYear,
    approvedBy,
    type,
  } = req.body;
  if (
    !name ||
    !department ||
    !state ||
    !country ||
    !totalBudget ||
    !fiscalYear ||
    !approvedBy ||
    !type
  )
    return res.render("addBudget", {
      title: "Create Budget",
      error: "All fields required",
      states: indianStates,
    });
  const editorEmail = `editor_${Date.now()}@bnb.com`;
  const editorPassword = crypto.randomBytes(4).toString("hex");
  const budget = new Budget({
    name,
    department,
    state,
    country,
    totalBudget,
    fiscalYear,
    approvedBy,
    type,
    creator: req.session.userId,
    editorEmail,
    editorPassword,
    expenses: [],
    status: "draft"
  });
  await budget.save();
  
  await auditLog("create", "Budget", budget._id, budget.name, req, null, budget.toObject());
  
  res.redirect(`/budget/${budget._id}`);
});

// BUDGET DETAILS
app.get("/budget/:id", async (req, res) => {
  const budget = await Budget.findById(req.params.id).populate("creator");
  if (!budget) return res.status(404).send("Budget not found");
  res.render("budgetDetails", { title: budget.name, budget });
});

// EDIT BUDGET
app.get("/budget/:id/edit", async (req, res) => {
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  if (req.session.userId != budget.creator.toString())
    return res.status(403).send("Unauthorized");
  res.render("editBudget", {
    title: `Edit ${budget.name}`,
    budget,
    error: null,
  });
});
app.post("/budget/:id/edit", async (req, res) => {
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  if (req.session.userId != budget.creator.toString())
    return res.status(403).send("Unauthorized");
  const { description, amount, allocatedTo } = req.body;
  budget.expenses.push({ description, amount, allocatedTo });
  await budget.save();
  res.redirect(`/budget/${budget._id}`);
});

// USER DASHBOARD
app.get("/dashboard", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  
  try {
    const userBudgets = await Budget.find({ creator: req.session.userId }).populate("creator");
    const activeProjects = await Project.countDocuments({ 
      departmentId: { $in: await Department.find({ budgetId: { $in: userBudgets.map(b => b._id) } }).distinct('_id') },
      status: "active" 
    });
    const pendingApprovals = await Transaction.countDocuments({ 
      budgetId: { $in: userBudgets.map(b => b._id) },
      status: "pending" 
    });
    const totalAllocated = userBudgets.reduce((sum, budget) => sum + budget.totalBudget, 0);
    
    // Get recent activity
    const recentActivity = await AuditLog.find({ userId: req.session.userId })
      .sort({ timestamp: -1 })
      .limit(10);
    
    res.render("userDashboard", { 
      title: "My Dashboard", 
      userBudgets,
      activeProjects,
      pendingApprovals,
      totalAllocated,
      recentActivity
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// ADMIN DASHBOARD
app.get("/admin/dashboard", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
  const budgets = await Budget.find({ creator: req.session.userId }).populate(
    "creator"
  );
  res.render("adminDashboard", { title: "Admin Dashboard", budgets });
});

// DEPARTMENT MANAGEMENT
app.get("/budget/:id/departments", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  if (req.session.userId != budget.creator.toString() && !req.session.isAdmin)
    return res.status(403).send("Unauthorized");
  
  const departments = await Department.find({ budgetId: req.params.id });
  res.render("departments", { title: "Departments", budget, departments });
});

app.post("/budget/:id/departments", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const { name, budget } = req.body;
  
  const department = new Department({
    name,
    budget: parseFloat(budget),
    budgetId: req.params.id,
    createdBy: req.session.userId
  });
  await department.save();
  
  await auditLog("create", "Department", department._id, department.name, req, null, department.toObject());
  
  res.redirect(`/budget/${req.params.id}/departments`);
});

// PROJECT MANAGEMENT
app.get("/department/:id/projects", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const department = await Department.findById(req.params.id).populate("budgetId");
  if (!department) return res.status(404).send("Department not found");
  
  const projects = await Project.find({ departmentId: req.params.id });
  res.render("projects", { title: "Projects", department, projects });
});

app.post("/department/:id/projects", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const { name, description, budget, startDate, endDate } = req.body;
  
  const project = new Project({
    name,
    description,
    budget: parseFloat(budget),
    departmentId: req.params.id,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    createdBy: req.session.userId
  });
  await project.save();
  
  await auditLog("create", "Project", project._id, project.name, req, null, project.toObject());
  
  res.redirect(`/department/${req.params.id}/projects`);
});

// VENDOR MANAGEMENT
app.get("/project/:id/vendors", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const project = await Project.findById(req.params.id).populate("departmentId");
  if (!project) return res.status(404).send("Project not found");
  
  const vendors = await Vendor.find({ projectId: req.params.id });
  res.render("vendors", { title: "Vendors", project, vendors });
});

app.post("/project/:id/vendors", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const { name, contactPerson, email, phone, address, allocatedAmount } = req.body;
  
  const vendor = new Vendor({
    name,
    contactPerson,
    email,
    phone,
    address,
    allocatedAmount: parseFloat(allocatedAmount),
    projectId: req.params.id,
    createdBy: req.session.userId
  });
  await vendor.save();
  
  await auditLog("create", "Vendor", vendor._id, vendor.name, req, null, vendor.toObject());
  
  res.redirect(`/project/${req.params.id}/vendors`);
});

// TRANSACTION MANAGEMENT
app.get("/vendor/:id/transactions", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const vendor = await Vendor.findById(req.params.id).populate("projectId");
  if (!vendor) return res.status(404).send("Vendor not found");
  
  const transactions = await Transaction.find({ vendorId: req.params.id });
  res.render("transactions", { title: "Transactions", vendor, transactions });
});

app.post("/vendor/:id/transactions", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const { description, amount, notes } = req.body;
  
  const vendor = await Vendor.findById(req.params.id).populate("projectId");
  const project = await Project.findById(vendor.projectId._id).populate("departmentId");
  
  const transaction = new Transaction({
    description,
    amount: parseFloat(amount),
    vendorId: req.params.id,
    projectId: vendor.projectId._id,
    departmentId: project.departmentId._id,
    budgetId: project.departmentId.budgetId,
    notes,
    createdBy: req.session.userId
  });
  await transaction.save();
  
  await auditLog("create", "Transaction", transaction._id, transaction.description, req, null, transaction.toObject());
  
  res.redirect(`/vendor/${req.params.id}/transactions`);
});

// APPROVE/REJECT TRANSACTIONS
app.post("/transaction/:id/approve", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).send("Transaction not found");
  
  const oldData = transaction.toObject();
  transaction.status = "approved";
  transaction.approvedBy = req.session.userId;
  transaction.approvedAt = new Date();
  await transaction.save();
  
  await auditLog("approve", "Transaction", transaction._id, transaction.description, req, oldData, transaction.toObject());
  
  res.redirect(`/vendor/${transaction.vendorId}/transactions`);
});

app.post("/transaction/:id/reject", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).send("Transaction not found");
  
  const oldData = transaction.toObject();
  transaction.status = "rejected";
  transaction.approvedBy = req.session.userId;
  transaction.approvedAt = new Date();
  await transaction.save();
  
  await auditLog("reject", "Transaction", transaction._id, transaction.description, req, oldData, transaction.toObject());
  
  res.redirect(`/vendor/${transaction.vendorId}/transactions`);
});

// BUDGET APPROVAL
app.post("/budget/:id/approve", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  
  const oldData = budget.toObject();
  budget.status = "approved";
  await budget.save();
  
  await auditLog("approve", "Budget", budget._id, budget.name, req, oldData, budget.toObject());
  
  res.redirect(`/budget/${budget._id}`);
});

// AI-POWERED FEATURES

// Budget Summary API
app.get("/api/budget/:id/summary", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const summary = await aiService.generateBudgetSummary(budget);
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// Transaction Classification API
app.post("/api/transaction/:id/classify", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate('budgetId');
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    
    const classification = await aiService.classifyTransaction(transaction, transaction.budgetId);
    res.json(classification);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to classify transaction" });
  }
});

// FAQ Generation API
app.get("/api/budget/:id/faq", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const faq = await aiService.generateFAQ(budget);
    res.json(faq);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate FAQ" });
  }
});

// Sankey Data API
app.get("/api/budget/:id/sankey", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate({
        path: 'departments',
        populate: {
          path: 'projects',
          populate: {
            path: 'vendors'
          }
        }
      });
    
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const sankeyData = await aiService.generateSankeyData(budget);
    res.json(sankeyData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate Sankey data" });
  }
});

// Chatbot API
app.post("/api/chatbot", async (req, res) => {
  try {
    const { message, context } = req.body;
    const response = await aiService.generateChatbotResponse(message, context);
    res.json({ response });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate chatbot response" });
  }
});

// QR Code Generation API
app.get("/api/transaction/:id/qr", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    
    const qrCode = await visualizationService.generateQRCode(transaction.transactionHash);
    res.json({ qrCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// Chart Data APIs
app.get("/api/budget/:id/charts/spending", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const chartConfig = visualizationService.generateSpendingChart(budget);
    res.json(chartConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate spending chart" });
  }
});

app.get("/api/budget/:id/charts/departments", async (req, res) => {
  try {
    const departments = await Department.find({ budgetId: req.params.id });
    const chartConfig = visualizationService.generateDepartmentChart(departments);
    res.json(chartConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate department chart" });
  }
});

app.get("/api/budget/:id/charts/timeline", async (req, res) => {
  try {
    const transactions = await Transaction.find({ budgetId: req.params.id });
    const chartConfig = visualizationService.generateTimelineChart(transactions);
    res.json(chartConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate timeline chart" });
  }
});

// Public Verification Page
app.get("/verify/:hash", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ transactionHash: req.params.hash })
      .populate('budgetId')
      .populate('departmentId')
      .populate('projectId')
      .populate('vendorId');
    
    if (!transaction) {
      return res.render("verification", { 
        title: "Transaction Verification", 
        transaction: null, 
        error: "Transaction not found" 
      });
    }
    
    res.render("verification", { 
      title: "Transaction Verification", 
      transaction, 
      error: null 
    });
  } catch (error) {
    console.error(error);
    res.render("verification", { 
      title: "Transaction Verification", 
      transaction: null, 
      error: "Verification failed" 
    });
  }
});

// Enhanced Budget Details with AI Features
app.get("/budget/:id/enhanced", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate("creator")
      .populate({
        path: 'departments',
        populate: {
          path: 'projects',
          populate: {
            path: 'vendors'
          }
        }
      });
    
    if (!budget) return res.status(404).send("Budget not found");
    
    // Generate AI-powered content
    const [summary, faq, sankeyData] = await Promise.all([
      aiService.generateBudgetSummary(budget),
      aiService.generateFAQ(budget),
      aiService.generateSankeyData(budget)
    ]);
    
    res.render("enhancedBudgetDetails", { 
      title: budget.name, 
      budget, 
      summary, 
      faq, 
      sankeyData 
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
