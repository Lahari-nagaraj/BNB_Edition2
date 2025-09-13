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
const { cloudinaryService, upload } = require("./services/cloudinaryService");
const multer = require("multer");

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
    const department = req.query.department || "";
    const status = req.query.status || "";
    const userState = req.query.state || "";
    const userCity = req.query.city || "";

    if (searchQuery) {
      query.$or = [
        { name: { $regex: searchQuery, $options: "i" } },
        { department: { $regex: searchQuery, $options: "i" } },
        { state: { $regex: searchQuery, $options: "i" } },
        { city: { $regex: searchQuery, $options: "i" } }
      ];
    }
    
    if (department) {
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { department: { $regex: department, $options: "i" } }
        ];
        delete query.$or;
      } else {
        query.department = { $regex: department, $options: "i" };
      }
    }
    
    if (status) {
      if (query.$and) {
        query.$and.push({ status: status });
      } else if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { status: status }
        ];
        delete query.$or;
      } else {
        query.status = status;
      }
    }
    
    if (userState) {
      if (query.$and) {
        query.$and.push({ state: { $regex: userState, $options: "i" } });
      } else if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { state: { $regex: userState, $options: "i" } }
        ];
        delete query.$or;
      } else {
        query.state = { $regex: userState, $options: "i" };
      }
    }
    
    if (userCity) {
      if (query.$and) {
        query.$and.push({ city: { $regex: userCity, $options: "i" } });
      } else if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { city: { $regex: userCity, $options: "i" } }
        ];
        delete query.$or;
      } else {
        query.city = { $regex: userCity, $options: "i" };
      }
    }

    const budgets = await Budget.find(query).populate("creator").limit(20);
    
    // Generate AI summaries for budgets that don't have them
    for (let budget of budgets) {
      if (!budget.aiSummary && budget.status === 'approved') {
        try {
          const summary = await aiService.generateBudgetSummary(budget);
          if (summary && summary.headline) {
            budget.aiSummary = summary.headline + " " + summary.bullets.join(" ");
            await budget.save();
          }
        } catch (error) {
          console.error('Error generating AI summary:', error);
        }
      }
    }
    
    const departments = await Budget.distinct("department", { type: "Public" });
    const statuses = await Budget.distinct("status", { type: "Public" });
    const states = await Budget.distinct("state", { type: "Public" });
    const cities = await Budget.distinct("city", { type: "Public" });
    
    res.render("home", {
      title: "BNB Fund Management",
      budgets,
      departments,
      statuses,
      states,
      cities,
      searchQuery,
      department,
      status,
      userState,
      userCity
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
    if (user.role === "editor") return res.redirect("/editor/dashboard");
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
    city,
    country,
    totalBudget,
    fiscalYear,
    approvedBy,
    type,
    vendorNames,
    vendorEmails
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
    city,
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
  
  if (vendorNames && vendorEmails) {
    const names = vendorNames.split(',').map(name => name.trim());
    const emails = vendorEmails.split(',').map(email => email.trim());
    
    for (let i = 0; i < names.length; i++) {
      if (names[i] && emails[i]) {
        const vendor = new Vendor({
          name: names[i],
          email: emails[i],
          budgetId: budget._id,
          departmentId: null,
          projectId: null
        });
        await vendor.save();
      }
    }
  }
  
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

// GAMIFICATION SYSTEM
async function awardBadges(user) {
  const badges = [];
  
  // First Transaction Badge
  if (user.transactionsSubmitted === 1 && !user.badges.some(b => b.name === 'First Transaction')) {
    badges.push({
      name: 'First Transaction',
      description: 'Submitted your first transaction',
      icon: '🎯',
      earnedAt: new Date()
    });
  }
  
  // Receipt Master Badge
  if (user.receiptsUploaded >= 10 && !user.badges.some(b => b.name === 'Receipt Master')) {
    badges.push({
      name: 'Receipt Master',
      description: 'Uploaded 10+ receipts',
      icon: '📄',
      earnedAt: new Date()
    });
  }
  
  // Transaction Pro Badge
  if (user.transactionsSubmitted >= 50 && !user.badges.some(b => b.name === 'Transaction Pro')) {
    badges.push({
      name: 'Transaction Pro',
      description: 'Submitted 50+ transactions',
      icon: '💼',
      earnedAt: new Date()
    });
  }
  
  // Perfect Week Badge
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentTransactions = await Transaction.countDocuments({
    createdBy: user._id,
    createdAt: { $gte: weekAgo }
  });
  
  if (recentTransactions >= 7 && !user.badges.some(b => b.name === 'Perfect Week')) {
    badges.push({
      name: 'Perfect Week',
      description: 'Submitted transactions every day for a week',
      icon: '⭐',
      earnedAt: new Date()
    });
  }
  
  // Add new badges to user
  if (badges.length > 0) {
    user.badges.push(...badges);
    user.points += badges.length * 10; // 10 points per badge
    
    // Level up calculation
    const newLevel = Math.floor(user.points / 100) + 1;
    if (newLevel > user.level) {
      user.level = newLevel;
      badges.push({
        name: `Level ${newLevel}`,
        description: `Reached level ${newLevel}`,
        icon: '🏆',
        earnedAt: new Date()
      });
    }
    
    await user.save();
  }
  
  return badges;
}

// EDITOR DASHBOARD
app.get("/editor/dashboard", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const assignedBudgets = await Budget.find({ 
      _id: { $in: user.assignedBudgets } 
    }).populate("creator");
    
    const pendingTransactions = await Transaction.countDocuments({ 
      createdBy: req.session.userId,
      status: "pending" 
    });
    
    const approvedToday = await Transaction.countDocuments({ 
      createdBy: req.session.userId,
      status: "approved",
      approvedAt: { $gte: new Date().setHours(0, 0, 0, 0) }
    });
    
    const recentTransactions = await Transaction.find({ 
      createdBy: req.session.userId 
    })
    .populate('budgetId')
    .populate('vendorId')
    .sort({ createdAt: -1 })
    .limit(5);
    
    res.render("editorDashboard", { 
      title: "Editor Dashboard", 
      user,
      assignedBudgets,
      pendingTransactions,
      approvedToday,
      recentTransactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// EDITOR BUDGET MANAGEMENT
app.get("/editor/budget/:id", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
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
    
    if (!budget || !user.assignedBudgets.includes(budget._id)) {
      return res.status(403).send("Unauthorized access to this budget");
    }
    
    res.render("editorBudgetDetails", { 
      title: `Manage ${budget.name}`, 
      budget,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// EDITOR TRANSACTION CREATION
app.get("/editor/transaction/new", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const assignedBudgets = await Budget.find({ 
      _id: { $in: user.assignedBudgets } 
    });
    
    res.render("editorTransactionForm", { 
      title: "Add New Transaction", 
      assignedBudgets,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.post("/editor/transaction/new", upload.single('receipt'), async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const { description, amount, budgetId, vendorId, projectId, departmentId, notes, category } = req.body;
    
    // Verify user has access to this budget
    const user = await User.findById(req.session.userId);
    if (!user.assignedBudgets.includes(budgetId)) {
      return res.status(403).send("Unauthorized access to this budget");
    }
    
    let receiptData = {};
    if (req.file) {
      // Upload receipt to Cloudinary
      const uploadResult = await cloudinaryService.uploadReceipt(req.file, Date.now());
      if (uploadResult.success) {
        receiptData = {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          uploadedAt: new Date()
        };
      }
    }
    
    const transaction = new Transaction({
      description,
      amount: parseFloat(amount),
      budgetId,
      vendorId,
      projectId,
      departmentId,
      notes,
      category,
      receipt: receiptData,
      createdBy: req.session.userId
    });
    
    await transaction.save();
    
    // AI Classification
    const classification = await aiService.classifyTransaction(transaction, { _id: budgetId });
    if (classification && classification[0]) {
      transaction.aiClassification = classification[0];
      await transaction.save();
    }
    
    // Update user stats
    user.transactionsSubmitted += 1;
    if (req.file) user.receiptsUploaded += 1;
    await user.save();
    
    // Award badges
    await awardBadges(user);
    
    await auditLog("create", "Transaction", transaction._id, transaction.description, req, null, transaction.toObject());
    
    res.redirect("/editor/dashboard");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// RECEIPT UPLOAD
app.get("/editor/receipts/upload", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  res.render("receiptUpload", { title: "Upload Receipt" });
});

app.post("/editor/receipts/upload", upload.single('receipt'), async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }
    
    const uploadResult = await cloudinaryService.uploadReceipt(req.file, Date.now());
    
    if (uploadResult.success) {
      // AI Receipt Verification
      const verification = await aiService.verifyReceipt(uploadResult.url);
      
      res.json({
        success: true,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        verification: verification
      });
    } else {
      res.status(500).json({ success: false, error: uploadResult.error });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// TEST DATA ROUTE (Remove in production)
app.get("/add-test-data", async (req, res) => {
  try {
    const testBudgets = [
      {
        name: "Education Infrastructure Development",
        department: "Education",
        state: "Maharashtra",
        city: "Mumbai",
        country: "India",
        totalBudget: 5000000,
        fiscalYear: "2024-25",
        approvedBy: "Ministry of Education",
        type: "Public",
        status: "approved",
        creator: req.session.userId || "64f8b1234567890abcdef123",
        description: "Development of new schools and educational facilities"
      },
      {
        name: "Healthcare Modernization",
        department: "Health",
        state: "Karnataka",
        city: "Bangalore",
        country: "India",
        totalBudget: 7500000,
        fiscalYear: "2024-25",
        approvedBy: "Health Department",
        type: "Public",
        status: "approved",
        creator: req.session.userId || "64f8b1234567890abcdef123",
        description: "Modernization of healthcare facilities and equipment"
      },
      {
        name: "Road Infrastructure",
        department: "Transport",
        state: "Tamil Nadu",
        city: "Chennai",
        country: "India",
        totalBudget: 10000000,
        fiscalYear: "2024-25",
        approvedBy: "Transport Ministry",
        type: "Public",
        status: "approved",
        creator: req.session.userId || "64f8b1234567890abcdef123",
        description: "Construction and maintenance of road networks"
      }
    ];

    for (let budgetData of testBudgets) {
      const existing = await Budget.findOne({ name: budgetData.name });
      if (!existing) {
        const budget = new Budget(budgetData);
        await budget.save();
      }
    }

    res.json({ message: "Test data added successfully", count: testBudgets.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add test data" });
  }
});

// AI-POWERED FEATURES

// Chatbot API
app.post("/api/chatbot", async (req, res) => {
  const USER_PROMPT = req.body.message;
  if (!USER_PROMPT) return res.json({ reply: "No message provided." });
  
  try {
    if (!process.env.HF_TOKEN)
      return res.status(400).json({ error: "HF_TOKEN not set in environment" });
    
    const prompt = `You are a helpful assistant for budget transparency. Provide clear, concise answers about budget management, fund tracking, and financial transparency. Keep responses under 150 words and be friendly but professional.

User question: ${USER_PROMPT}`;
    
    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b:fireworks-ai",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          top_p: 0.1,
        }),
      }
    );
    
    if (!response.ok)
      return res.json({
        reply: "Sorry, I couldn't get advice at the moment. Try again.",
      });
    
    const data = await response.json();
    let reply =
      data?.choices?.[0]?.message?.content?.trim() || "No advice returned";
    reply = reply
      .split("\n")
      .filter((line) => line.trim() !== "")
      .join("\n");
    
    res.json({ reply, model_used: "gpt-oss-120b" });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.json({
      reply: "I'm here to help with budget transparency questions! How can I assist you today?",
    });
  }
});

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
