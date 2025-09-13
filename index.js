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
const Editor = require("./models/Editor");
const Anomaly = require("./models/Anomaly");
const Feedback = require("./models/Feedback");
const aiService = require("./services/aiService");
const visualizationService = require("./services/visualizationService");
const { cloudinaryService, upload } = require("./services/cloudinaryService");
const ocrService = require("./services/ocrService");
const anomalyService = require("./services/anomalyService");
const blockchainService = require("./services/blockchainService");

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
    // Include all statuses by default, but allow filtering
    const query = { type: "Public" };
    const searchQuery = req.query.q || "";
    const department = req.query.department || "";
    const status = req.query.status || "";
    const userState = req.query.state || "";
    const userCity = req.query.city || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 8; // Show 8 cards per page
    const skip = (page - 1) * limit;

    const searchConditions = [];
    
    // Add status filter if specified, otherwise show all
    if (status) {
      searchConditions.push({ status: { $regex: status, $options: "i" } });
    }
    
    if (searchQuery) {
      // Enhanced fuzzy search with spelling tolerance
      const searchTerms = searchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      const fuzzyConditions = [];
      
      searchTerms.forEach(term => {
        // Create multiple variations for spelling tolerance
        const variations = [term];
        
        // Add common spelling variations (simple approach)
        if (term.length > 3) {
          // Add variations with one character difference
          for (let i = 0; i < term.length; i++) {
            const variation = term.slice(0, i) + '.' + term.slice(i + 1);
            variations.push(variation);
          }
        }
        
        const termConditions = variations.map(variation => ({
          $or: [
            { name: { $regex: variation, $options: "i" } },
            { department: { $regex: variation, $options: "i" } },
            { state: { $regex: variation, $options: "i" } },
            { city: { $regex: variation, $options: "i" } },
            { description: { $regex: variation, $options: "i" } }
          ]
        }));
        
        fuzzyConditions.push({ $or: termConditions });
      });
      
      if (fuzzyConditions.length > 0) {
        searchConditions.push({ $and: fuzzyConditions });
      }
    }
    
    if (department) {
      searchConditions.push({ department: { $regex: department, $options: "i" } });
    }
    
    if (userState) {
      searchConditions.push({ state: { $regex: userState, $options: "i" } });
    }
    
    if (userCity) {
      searchConditions.push({ city: { $regex: userCity, $options: "i" } });
    }

    if (searchConditions.length > 0) {
      query.$and = searchConditions;
    }

    // Get total count for pagination
    const totalBudgets = await Budget.countDocuments(query);
    const totalPages = Math.ceil(totalBudgets / limit);

    const budgets = await Budget.find(query).populate("creator").sort({ createdAt: -1 }).skip(skip).limit(limit);
    
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
    const states = indianStates;
    const cities = await Budget.distinct("city", { type: "Public" });
    
    // Get transactions for each budget
    const budgetsWithTransactions = await Promise.all(budgets.map(async (budget) => {
      const budgetTransactions = await Transaction.find({ budgetId: budget._id })
        .sort({ createdAt: -1 })
        .limit(3);
      
      return {
        ...budget.toObject(),
        recentTransactions: budgetTransactions
      };
    }));
    
    res.render("home", {
      title: "BNB Fund Management",
      budgets: budgetsWithTransactions,
      departments,
      states,
      cities,
      searchQuery,
      department,
      status,
      userState,
      userCity,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalBudgets: totalBudgets,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      }
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server Error");
  }
});


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
    isAdmin: role === "admin"
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

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/budget/new", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.render("addBudget", {
    title: "Create Budget",
    error: null,
    states: indianStates,
  });
});

app.get("/admin/editors", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const editors = await Editor.find({ isActive: true })
      .populate('assignedBudgets')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.render("editorManagement", {
      title: "Editor Management",
      editors
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.get("/admin/editors/new", (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  res.render("createEditor", {
    title: "Create New Editor",
    error: null
  });
});

app.post("/admin/editors/new", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const { name, email, password, role, permissions } = req.body;
    
    const existingEditor = await Editor.findOne({ email });
    if (existingEditor) {
      return res.render("createEditor", {
        title: "Create New Editor",
        error: "Editor with this email already exists"
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const editor = new Editor({
      name,
      email,
      password: hashedPassword,
      role: role || 'editor',
      permissions: permissions || {
        canCreateTransactions: true,
        canUploadReceipts: true,
        canEditBudgets: false,
        canApproveTransactions: false
      },
      createdBy: req.session.userId
    });
    
    await editor.save();
    
    await auditLog("create", "Editor", editor._id, editor.name, req, null, editor.toObject());
    
    res.redirect("/admin/editors");
  } catch (error) {
    console.error(error);
    res.render("createEditor", {
      title: "Create New Editor",
      error: "Failed to create editor"
    });
  }
});

app.post("/budget/:id/assign-editor", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const { editorId } = req.body;
    const budget = await Budget.findById(req.params.id);
    const editor = await Editor.findById(editorId);
    
    if (!budget || !editor) {
      return res.status(404).json({ error: "Budget or Editor not found" });
    }
    
    if (!budget.assignedEditors.includes(editorId)) {
      budget.assignedEditors.push(editorId);
      await budget.save();
    }
    
    if (!editor.assignedBudgets.includes(req.params.id)) {
      editor.assignedBudgets.push(req.params.id);
      await editor.save();
    }
    
    await auditLog("assign", "Budget", budget._id, budget.name, req, null, { editorId, editorName: editor.name });
    
    res.json({ success: true, message: "Editor assigned successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to assign editor" });
  }
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
    vendorEmails,
    projectType,
    nationality,
    collegeName,
    collegeType
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
  const editorPassword = crypto.randomBytes(6).toString("hex");
  
  const hashedPassword = await bcrypt.hash(editorPassword, 10);
  const editorUser = new User({
    name: `Editor for ${name}`,
    email: editorEmail,
    password: hashedPassword,
    role: "editor",
    assignedBudgets: []
  });
  await editorUser.save();
  
  const budget = new Budget({
    name,
    department,
    state,
    city,
    country,
    projectType: projectType || 'government',
    nationality,
    collegeName,
    collegeType,
    totalBudget,
    fiscalYear,
    approvedBy,
    type,
    creator: req.session.userId,
    editorEmail,
    editorPassword,
    assignedEditors: [editorUser._id],
    expenses: [],
    status: "draft"
  });
  await budget.save();
  
  editorUser.assignedBudgets.push(budget._id);
  await editorUser.save();
  
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

app.get("/budget/:id", async (req, res) => {
  const budget = await Budget.findById(req.params.id)
    .populate("creator")
    .populate("assignedEditors");
  if (!budget) return res.status(404).send("Budget not found");
  
  // Get all transactions for this budget
  const transactions = await Transaction.find({ budgetId: req.params.id })
    .populate('createdBy', 'name')
    .populate('approvedBy', 'name')
    .sort({ createdAt: -1 });
  
  res.render("budgetDetails", { title: budget.name, budget, transactions });
});

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

app.get("/admin/dashboard", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
  
  try {
    const budgets = await Budget.find({ creator: req.session.userId })
      .populate("creator")
      .populate("assignedEditors")
      .sort({ createdAt: -1 });
    
    const editorStats = await User.aggregate([
      { $match: { role: "editor" } },
      {
        $group: {
          _id: null,
          totalEditors: { $sum: 1 },
          activeEditors: { $sum: { $cond: [{ $ne: ["$assignedBudgets", []] }, 1, 0] } }
        }
      }
    ]);
    
    const stats = editorStats[0] || { totalEditors: 0, activeEditors: 0 };
    
    res.render("adminDashboard", { 
      title: "Admin Dashboard", 
      budgets,
      stats
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// Admin route to view all pending transactions
app.get("/admin/transactions/pending", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const pendingTransactions = await Transaction.find({ status: 'pending' })
      .populate('createdBy', 'name email')
      .populate('budgetId', 'name department')
      .sort({ createdAt: -1 });
    
    res.render("adminPendingTransactions", {
      title: "Pending Transactions - Admin",
      transactions: pendingTransactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

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
  
  // Redirect to admin pending transactions page instead of vendor page
  res.redirect("/admin/transactions/pending");
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
  
  // Redirect to admin pending transactions page instead of vendor page
  res.redirect("/admin/transactions/pending");
});

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

async function awardBadges(user) {
  const badges = [];
  
  if (user.transactionsSubmitted === 1 && !user.badges.some(b => b.name === 'First Transaction')) {
    badges.push({
      name: 'First Transaction',
      description: 'Submitted your first transaction',
      icon: '🎯',
      earnedAt: new Date()
    });
  }
  
  if (user.receiptsUploaded >= 10 && !user.badges.some(b => b.name === 'Receipt Master')) {
    badges.push({
      name: 'Receipt Master',
      description: 'Uploaded 10+ receipts',
      icon: '📄',
      earnedAt: new Date()
    });
  }
  
  if (user.transactionsSubmitted >= 50 && !user.badges.some(b => b.name === 'Transaction Pro')) {
    badges.push({
      name: 'Transaction Pro',
      description: 'Submitted 50+ transactions',
      icon: '💼',
      earnedAt: new Date()
    });
  }
  
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
  
  if (badges.length > 0) {
    user.badges.push(...badges);
    user.points += badges.length * 10;
    
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

// EDITOR BUDGET TRANSACTIONS VIEW
app.get("/editor/budget/:id/transactions", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const budget = await Budget.findById(req.params.id);
    
    if (!budget || !user.assignedBudgets.includes(req.params.id)) {
      return res.status(403).send("Unauthorized access to this budget");
    }
    
    // Get transactions for this budget
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    res.render("editorBudgetTransactions", {
      title: `Transactions - ${budget.name}`,
      budget,
      transactions,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// EDITOR PENDING TRANSACTIONS
app.get("/editor/transactions/pending", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const pendingTransactions = await Transaction.find({ 
      createdBy: req.session.userId,
      status: 'pending'
    })
    .populate('budgetId', 'name department')
    .sort({ createdAt: -1 });
    
    res.render("editorPendingTransactions", {
      title: "Pending Transactions",
      transactions: pendingTransactions,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.post("/editor/transaction/new", upload.single('receipt'), async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  
  try {
    const { description, amount, budgetId, vendorId, projectId, departmentId, notes, category } = req.body;
    
    if (!description || !amount || !budgetId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    
    // Verify user has access to this budget
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    
    if (!user.assignedBudgets.includes(budgetId)) {
      return res.status(403).json({ success: false, error: "Unauthorized access to this budget" });
    }
    
    let receiptData = {};
    if (req.file) {
      try {
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
        } else {
          console.error('Cloudinary upload failed:', uploadResult.error);
          // Continue without receipt if upload fails
        }
      } catch (uploadError) {
        console.error('Receipt upload error:', uploadError);
        // Continue without receipt if upload fails
      }
    }
    
    const transaction = new Transaction({
      description,
      amount: parseFloat(amount),
      budgetId,
      vendorId: vendorId || undefined,
      projectId: projectId || undefined,
      departmentId: departmentId || undefined,
      notes,
      category,
      receipt: receiptData,
      createdBy: req.session.userId
    });
    
    await transaction.save();
    
    // Store transaction in blockchain
    try {
      const blockchainResult = await blockchainService.storeTransaction(transaction);
      if (blockchainResult.success) {
        transaction.blockchainId = blockchainResult.transactionId;
        transaction.blockHash = blockchainResult.blockHash;
        transaction.blockIndex = blockchainResult.blockIndex;
        await transaction.save();
        console.log('Transaction stored in blockchain:', blockchainResult.transactionId);
      }
    } catch (blockchainError) {
      console.error('Blockchain storage error:', blockchainError);
      // Continue without blockchain storage
    }
    
    // AI Classification (disabled to prevent crashes)
    // try {
    //   const classification = await aiService.classifyTransaction(transaction, { _id: budgetId });
    //   if (classification && classification[0]) {
    //     transaction.aiClassification = classification[0];
    //     await transaction.save();
    //   }
    // } catch (aiError) {
    //   console.error('AI classification error:', aiError);
    //   // Continue without AI classification
    // }
    
    // Update user stats (optional, don't fail if it doesn't work)
    try {
      user.transactionsSubmitted = (user.transactionsSubmitted || 0) + 1;
      if (req.file) user.receiptsUploaded = (user.receiptsUploaded || 0) + 1;
      await user.save();
    } catch (userError) {
      console.error('User stats update error:', userError);
      // Continue without updating user stats
    }
    
    // Award badges (optional, don't fail if it doesn't work)
    try {
      await awardBadges(user);
    } catch (badgeError) {
      console.error('Badge awarding error:', badgeError);
      // Continue without awarding badges
    }
    
    // Audit log (optional, don't fail if it doesn't work)
    try {
      await auditLog("create", "Transaction", transaction._id, transaction.description, req, null, transaction.toObject());
    } catch (auditError) {
      console.error('Audit log error:', auditError);
      // Continue without audit log
    }
    
    res.json({ success: true, message: "Transaction created successfully", transactionId: transaction._id });
  } catch (error) {
    console.error('Transaction creation error:', error);
    res.status(500).json({ success: false, error: "Failed to create transaction: " + error.message });
  }
});

// RECEIPT UPLOAD AND OCR PROCESSING
app.get("/editor/receipts/upload", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const assignedBudgets = await Budget.find({ 
      _id: { $in: user.assignedBudgets } 
    });
    
    res.render("receiptUpload", { 
      title: "Upload Receipt",
      assignedBudgets
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.post("/editor/receipts/upload", upload.single('receipt'), async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    
    // Upload to Cloudinary
    const uploadResult = await cloudinaryService.uploadReceipt(req.file, Date.now());
    
    if (!uploadResult.success) {
      return res.status(500).json({ success: false, error: uploadResult.error });
    }
    
    // Process with OCR
    const ocrResult = await ocrService.processReceiptFromUrl(uploadResult.url);
    
    // AI Receipt Verification
    const verification = await aiService.verifyReceipt(uploadResult.url);
    
    res.json({
      success: true,
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      verification: verification,
      ocrData: ocrResult.success ? ocrResult.data : null,
      ocrError: ocrResult.success ? null : ocrResult.error
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// OCR PROCESSING API
app.post("/api/ocr/process", upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    
    const ocrResult = await ocrService.processReceipt(req.file.path);
    
    res.json(ocrResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// OCR PROCESSING FROM URL
app.post("/api/ocr/process-url", async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ success: false, error: "Image URL required" });
    }
    
    const ocrResult = await ocrService.processReceiptFromUrl(imageUrl);
    
    res.json(ocrResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// SIMPLE CLOUDINARY UPLOAD ROUTE
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (!process.env.CLOUD_KEY_NAME) {
      return res.status(500).json({ 
        error: 'Cloudinary not configured. Please add CLOUD_KEY_NAME, COUD_API_KEY, and CLOUD_API_SECRET to your .env file' 
      });
    }
    
    const result = await cloudinary.uploader.upload(req.file.path);
    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// ADD EXPENSE WITH RECEIPT
app.post("/budget/:id/add-expense", upload.single('receipt'), async (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: "Login required" });
  
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    // Check if user has permission to add expenses
    const user = await User.findById(req.session.userId);
    const isCreator = budget.creator.toString() === req.session.userId;
    const isAssignedEditor = budget.assignedEditors.some(editor => 
      typeof editor === 'string' ? editor === req.session.userId : editor.toString() === req.session.userId
    );
    const hasPermission = req.session.isAdmin || 
                         user.role === 'editor' || 
                         isCreator ||
                         isAssignedEditor;
    
    if (!hasPermission) {
      return res.status(403).json({ error: "No permission to add expenses to this budget" });
    }
    
    const { description, amount, category, vendor, notes } = req.body;
    
    if (!description || !amount) {
      return res.status(400).json({ error: "Description and amount are required" });
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
    
    // Create expense object
    const expense = {
      description,
      amount: parseFloat(amount),
      category: category || 'other',
      vendor: vendor || '',
      notes: notes || '',
      receipt: receiptData,
      addedBy: req.session.userId,
      addedAt: new Date()
    };
    
    // Add expense to budget
    budget.expenses.push(expense);
    budget.spent += expense.amount;
    budget.remaining = budget.totalBudget - budget.spent;
    
    await budget.save();
    
    await auditLog("add_expense", "Budget", budget._id, budget.name, req, null, expense);
    
    res.json({ 
      success: true, 
      message: "Expense added successfully",
      expense: expense
    });
  } catch (error) {
    console.error('Error adding expense:', error);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

// DATA MIGRATION ROUTE - Fix existing data
app.get("/fix-data", async (req, res) => {
  try {
    // Fix budgets with string creator values
    await Budget.updateMany(
      { creator: { $type: "string" } },
      { $set: { creator: new mongoose.Types.ObjectId() } }
    );
    
    // Fix transactions with missing required fields
    await Transaction.updateMany(
      { $or: [
        { vendorId: { $exists: false } },
        { projectId: { $exists: false } },
        { departmentId: { $exists: false } }
      ]},
      { $unset: { vendorId: "", projectId: "", departmentId: "" } }
    );
    
    res.json({ message: "Data migration completed successfully" });
  } catch (error) {
    console.error("Migration error:", error);
    res.status(500).json({ error: "Migration failed" });
  }
});



// AI-POWERED FEATURES

// Chatbot API
app.post("/api/chatbot", async (req, res) => {
  const USER_PROMPT = req.body.message;
  if (!USER_PROMPT) return res.json({ reply: "No message provided." });
  
  try {
    // Use a simple fallback response instead of external API
    const responses = [
      "I can help you understand budget transparency and fund management. What specific information are you looking for?",
      "Budget transparency ensures public funds are used responsibly. You can view detailed breakdowns of spending and allocations.",
      "For budget verification, you can use the verification system to check individual transactions and their authenticity.",
      "The system tracks budget allocations from departments to projects to vendors, providing complete visibility.",
      "You can search budgets by department, state, city, or keywords to find relevant information quickly.",
      "All public budgets are displayed with their current status, spending progress, and remaining allocations.",
      "The system provides real-time updates on budget utilization and spending patterns across different categories."
    ];
    
    // Simple keyword-based responses
    const lowerPrompt = USER_PROMPT.toLowerCase();
    let reply = responses[Math.floor(Math.random() * responses.length)];
    
    if (lowerPrompt.includes('verify') || lowerPrompt.includes('verification')) {
      reply = "You can verify transactions using the verification system. Each transaction has a unique hash that can be checked for authenticity.";
    } else if (lowerPrompt.includes('budget') || lowerPrompt.includes('fund')) {
      reply = "Budgets are organized by department and show total allocation, spent amount, and remaining funds. You can view detailed breakdowns and spending patterns.";
    } else if (lowerPrompt.includes('search') || lowerPrompt.includes('find')) {
      reply = "Use the search filters to find budgets by department, location, or keywords. The system will show matching public budgets with their current status.";
    } else if (lowerPrompt.includes('help') || lowerPrompt.includes('how')) {
      reply = "I can help you navigate the budget transparency system. You can search budgets, view details, verify transactions, and track spending patterns. What would you like to know?";
    }
    
    res.json({ reply: reply });
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
    
    // Get all transactions for this budget
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    
    // Create comprehensive context for AI
    const budgetContext = {
      name: budget.name,
      department: budget.department,
      state: budget.state,
      city: budget.city,
      country: budget.country,
      totalBudget: budget.totalBudget,
      spent: budget.spent,
      remaining: budget.remaining,
      fiscalYear: budget.fiscalYear,
      approvedBy: budget.approvedBy,
      type: budget.type,
      status: budget.status,
      expenses: budget.expenses,
      departments: budget.departments,
      transactions: transactions.map(t => ({
        description: t.description,
        amount: t.amount,
        category: t.category,
        status: t.status,
        date: t.createdAt,
        receipt: t.receipt ? 'Yes' : 'No'
      }))
    };
    
    // Generate AI-powered content with full context
    const [summary, faq, sankeyData] = await Promise.all([
      aiService.generateBudgetSummary(budget, budgetContext),
      aiService.generateFAQ(budget, budgetContext),
      aiService.generateSankeyData(budget, budgetContext)
    ]);
    
    res.render("enhancedBudgetDetails", { 
      title: budget.name, 
      budget, 
      transactions,
      summary, 
      faq, 
      sankeyData,
      budgetContext: JSON.stringify(budgetContext)
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// STATE-WISE BUDGET VIEW
app.get("/budgets/state/:state", async (req, res) => {
  try {
    const state = req.params.state;
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    
    const query = { 
      type: "Public", 
      state: { $regex: state, $options: "i" } 
    };
    
    const totalBudgets = await Budget.countDocuments(query);
    const totalPages = Math.ceil(totalBudgets / limit);
    const budgets = await Budget.find(query)
      .populate("creator")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.render("stateBudgets", {
      title: `Budgets in ${state}`,
      budgets,
      state,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalBudgets: totalBudgets,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      }
    });
  } catch (error) {
    console.error('Error fetching state budgets:', error);
    res.status(500).send("Server Error");
  }
});

// DEPARTMENT-WISE BUDGET VIEW
app.get("/budgets/department/:department", async (req, res) => {
  try {
    const department = req.params.department;
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    
    const query = { 
      type: "Public", 
      department: { $regex: department, $options: "i" } 
    };
    
    const totalBudgets = await Budget.countDocuments(query);
    const totalPages = Math.ceil(totalBudgets / limit);
    const budgets = await Budget.find(query)
      .populate("creator")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.render("departmentBudgets", {
      title: `${department} Department Budgets`,
      budgets,
      department,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalBudgets: totalBudgets,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      }
    });
  } catch (error) {
    console.error('Error fetching department budgets:', error);
    res.status(500).send("Server Error");
  }
});

// EXPORT REPORT ROUTE
app.get("/api/budget/:id/export", async (req, res) => {
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
    
    // Get all transactions for this budget
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    
    // Generate comprehensive report data
    const reportData = {
      budget: {
        name: budget.name,
        department: budget.department,
        state: budget.state,
        city: budget.city,
        country: budget.country,
        totalBudget: budget.totalBudget,
        spent: budget.spent,
        remaining: budget.remaining,
        fiscalYear: budget.fiscalYear,
        approvedBy: budget.approvedBy,
        type: budget.type,
        status: budget.status,
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt
      },
      transactions: transactions.map(t => ({
        description: t.description,
        amount: t.amount,
        category: t.category,
        status: t.status,
        notes: t.notes,
        createdAt: t.createdAt,
        approvedAt: t.approvedAt,
        createdBy: t.createdBy ? t.createdBy.name : 'Unknown',
        approvedBy: t.approvedBy ? t.approvedBy.name : null,
        receipt: t.receipt ? 'Yes' : 'No',
        transactionHash: t.transactionHash
      })),
      summary: {
        totalTransactions: transactions.length,
        totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
        pendingTransactions: transactions.filter(t => t.status === 'pending').length,
        approvedTransactions: transactions.filter(t => t.status === 'approved').length,
        rejectedTransactions: transactions.filter(t => t.status === 'rejected').length
      },
      generatedAt: new Date().toISOString()
    };
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="budget-report-${budget.name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json"`);
    
    res.json(reportData);
  } catch (error) {
    console.error('Error generating export:', error);
    res.status(500).send("Error generating report");
  }
});

// ANOMALY DETECTION ROUTES
app.get("/api/anomalies/:budgetId", async (req, res) => {
  try {
    const anomalies = await anomalyService.getActiveAnomalies(req.params.budgetId);
    res.json({ anomalies });
  } catch (error) {
    console.error("Error fetching anomalies:", error);
    res.status(500).json({ error: "Failed to fetch anomalies" });
  }
});

app.post("/api/anomalies/:anomalyId/resolve", async (req, res) => {
  try {
    const { resolution } = req.body;
    const anomaly = await anomalyService.resolveAnomaly(
      req.params.anomalyId, 
      req.session.userId, 
      resolution
    );
    res.json({ message: "Anomaly resolved successfully", anomaly });
  } catch (error) {
    console.error("Error resolving anomaly:", error);
    res.status(500).json({ error: "Failed to resolve anomaly" });
  }
});

// COMMUNITY FEEDBACK ROUTES
app.post("/api/feedback", async (req, res) => {
  try {
    const feedbackData = {
      ...req.body,
      userId: req.session.userId || undefined
    };
    
    const feedback = new Feedback(feedbackData);
    await feedback.save();
    
    res.json({ message: "Feedback submitted successfully", feedback });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

app.get("/api/feedback/:budgetId", async (req, res) => {
  try {
    const feedback = await Feedback.find({ 
      budgetId: req.params.budgetId,
      status: { $ne: "rejected" }
    })
    .populate("userId", "name")
    .sort({ createdAt: -1 });
    
    res.json({ feedback });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// PROJECT HIERARCHY ROUTES
app.post("/api/budget/:budgetId/departments", async (req, res) => {
  try {
    const { name, allocatedBudget } = req.body;
    const budget = await Budget.findById(req.params.budgetId);
    
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    budget.departments.push({
      name,
      allocatedBudget: parseFloat(allocatedBudget),
      spent: 0,
      remaining: parseFloat(allocatedBudget)
    });
    
    await budget.save();
    res.json({ message: "Department added successfully", budget });
  } catch (error) {
    console.error("Error adding department:", error);
    res.status(500).json({ error: "Failed to add department" });
  }
});

app.post("/api/budget/:budgetId/departments/:deptIndex/vendors", async (req, res) => {
  try {
    const { name, allocatedBudget, workDescription, contactInfo } = req.body;
    const budget = await Budget.findById(req.params.budgetId);
    
    if (!budget || !budget.departments[req.params.deptIndex]) {
      return res.status(404).json({ error: "Budget or department not found" });
    }
    
    budget.departments[req.params.deptIndex].vendors.push({
      name,
      allocatedBudget: parseFloat(allocatedBudget),
      spent: 0,
      remaining: parseFloat(allocatedBudget),
      workDescription,
      contactInfo: contactInfo || {}
    });
    
    await budget.save();
    res.json({ message: "Vendor added successfully", budget });
  } catch (error) {
    console.error("Error adding vendor:", error);
    res.status(500).json({ error: "Failed to add vendor" });
  }
});

// Run anomaly detection after transaction creation
app.post("/api/run-anomaly-detection/:budgetId", async (req, res) => {
  try {
    const anomalies = await anomalyService.runAnomalyDetection(req.params.budgetId);
    res.json({ message: "Anomaly detection completed", anomalies });
  } catch (error) {
    console.error("Error running anomaly detection:", error);
    res.status(500).json({ error: "Failed to run anomaly detection" });
  }
});

// BUDGET VISUALIZATION ROUTE
app.get("/budget/:id/visualization", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) {
      return res.status(404).send("Budget not found");
    }
    
    res.render("budgetVisualization", {
      title: `Visualization - ${budget.name}`,
      budget
    });
  } catch (error) {
    console.error("Error loading visualization:", error);
    res.status(500).send("Server Error");
  }
});

// DEBUG TEST ROUTE
app.get("/debug/transaction", async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: "Debug endpoint working",
      timestamp: new Date().toISOString(),
      session: req.session
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
