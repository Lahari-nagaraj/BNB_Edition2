# 🏛️ BNB Fund Management System

A comprehensive, AI-powered fund management platform with complete transparency, audit trails, and modern UI/UX.

## ✨ Features

### 🎯 Core Functionality
- **Complete Fund Flow Hierarchy**: Budget → Department → Project → Vendor → Transaction
- **Role-Based Access Control**: Admin, Manager, and Public user roles
- **Real-time Audit Trail**: Complete logging of all changes with cryptographic hashing
- **Approval Workflows**: Budget and transaction approval system
- **Public Verification**: QR codes and public verification endpoints

### 🤖 AI-Powered Features
- **Budget Summarization**: AI-generated public-friendly budget summaries
- **Transaction Classification**: Automatic suspicious transaction detection
- **FAQ Generation**: AI-generated frequently asked questions
- **Interactive Chatbot**: Real-time Q&A about budgets and transactions
- **Email Digest Generation**: Automated stakeholder notifications

### 📊 Advanced Visualizations
- **Sankey Diagrams**: Interactive fund flow visualization
- **Chart.js Integration**: Spending charts, department allocations, timelines
- **Progress Tracking**: Real-time budget utilization indicators
- **Status Dashboards**: Comprehensive overview with key metrics

### 🎨 Modern UI/UX
- **Responsive Design**: Mobile-first approach with modern grid layouts
- **Animated Backgrounds**: Subtle animations and gradient effects
- **Glass Morphism**: Modern card designs with backdrop blur effects
- **Interactive Elements**: Hover effects, smooth transitions, and micro-interactions

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud)
- Hugging Face API key (optional, for AI features)

### Installation

1. **Clone and Install**
```bash
git clone <repository-url>
cd fund-management-bnb
npm install
```

2. **Environment Setup**
Create a `.env` file in the root directory:
```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/bnb-fund-management

# Session Secret
SESSION_SECRET=your-super-secret-session-key-here

# Server Port
PORT=8080

# Hugging Face API Key (optional)
HUGGINGFACE_API_KEY=your-huggingface-api-key-here

# Base URL for QR codes
BASE_URL=http://localhost:8080
```

3. **Start the Server**
```bash
# Development mode with auto-reload
npm run dev
# or
nodemon index.js

# Production mode
node index.js
```

4. **Access the Application**
Open your browser and navigate to `http://localhost:8080`

## 📋 User Guide

### 👤 User Roles

#### **Admin**
- Full system access
- Approve/reject budgets and transactions
- View all budgets and audit trails
- Access admin dashboard

#### **Manager**
- Create and manage budgets
- Add departments, projects, and vendors
- Record transactions
- View personal dashboard

#### **Public User**
- View public budgets
- Access verification pages
- Use AI chatbot for questions
- Browse fund flow visualizations

### 🏗️ Fund Flow Hierarchy

1. **Create Budget** → Set total allocation and basic info
2. **Add Departments** → Allocate budget to departments
3. **Create Projects** → Set up projects under departments
4. **Add Vendors** → Assign vendors to projects
5. **Record Transactions** → Track individual expenses
6. **Monitor & Approve** → Review and approve transactions

### 🤖 AI Features Usage

#### **Budget Summary**
- Visit any budget page
- Click "🤖 AI Enhanced" button
- View AI-generated public-friendly summary

#### **Transaction Classification**
- Transactions are automatically classified
- Suspicious transactions are flagged
- Admins receive alerts for review

#### **Interactive Chatbot**
- Available on enhanced budget pages
- Ask questions about budgets, spending, or processes
- Get instant AI-powered responses

#### **Public Verification**
- Each transaction has a unique hash
- Visit `/verify/<hash>` to verify any transaction
- QR codes available for mobile verification

## 🔧 API Endpoints

### **Core Budget Management**
- `GET /` - Home page with public budgets
- `GET /budget/:id` - Budget details
- `GET /budget/:id/enhanced` - AI-enhanced budget view
- `POST /budget/new` - Create new budget
- `POST /budget/:id/approve` - Approve budget (admin only)

### **Hierarchy Management**
- `GET /budget/:id/departments` - View departments
- `POST /budget/:id/departments` - Add department
- `GET /department/:id/projects` - View projects
- `POST /department/:id/projects` - Add project
- `GET /project/:id/vendors` - View vendors
- `POST /project/:id/vendors` - Add vendor
- `GET /vendor/:id/transactions` - View transactions
- `POST /vendor/:id/transactions` - Add transaction

### **AI-Powered APIs**
- `GET /api/budget/:id/summary` - AI budget summary
- `GET /api/budget/:id/faq` - AI-generated FAQ
- `GET /api/budget/:id/sankey` - Sankey diagram data
- `POST /api/chatbot` - Chatbot interaction
- `POST /api/transaction/:id/classify` - Transaction classification

### **Visualization APIs**
- `GET /api/budget/:id/charts/spending` - Spending chart data
- `GET /api/budget/:id/charts/departments` - Department chart data
- `GET /api/budget/:id/charts/timeline` - Timeline chart data
- `GET /api/transaction/:id/qr` - QR code generation

### **Public Verification**
- `GET /verify/:hash` - Public transaction verification

## 🎨 UI Components

### **Modern Design System**
- **Color Palette**: Blue gradient primary, semantic status colors
- **Typography**: Inter + Montserrat font combination
- **Spacing**: Consistent 8px grid system
- **Shadows**: Layered shadow system for depth
- **Animations**: Smooth transitions and micro-interactions

### **Responsive Grid System**
- **Desktop**: Multi-column layouts with auto-fit grids
- **Tablet**: Adaptive column counts
- **Mobile**: Single-column stacked layout

### **Interactive Elements**
- **Cards**: Hover effects with elevation changes
- **Buttons**: Gradient backgrounds with shimmer effects
- **Forms**: Focus states with color transitions
- **Progress Bars**: Animated fill with shimmer effects

## 🔐 Security Features

### **Authentication & Authorization**
- Session-based authentication
- Role-based access control
- Password hashing with bcrypt
- Secure session management

### **Data Integrity**
- Cryptographic transaction hashing (SHA-256)
- Complete audit trail logging
- Input validation and sanitization
- SQL injection prevention

### **Privacy & Compliance**
- Public/private budget visibility controls
- User data protection
- Audit trail for compliance
- Secure API endpoints

## 📊 Monitoring & Analytics

### **Key Metrics Tracked**
- Budget utilization rates
- Transaction approval times
- User activity patterns
- System performance metrics

### **Audit Trail**
- Complete change history
- User action logging
- IP address tracking
- Timestamp precision

## 🚀 Deployment

### **Production Checklist**
1. Set secure environment variables
2. Configure MongoDB connection
3. Set up SSL certificates
4. Configure reverse proxy (nginx)
5. Set up monitoring and logging
6. Configure backup strategy

### **Docker Deployment** (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Check the FAQ section in the application
- Use the built-in chatbot for quick answers
- Review the audit trail for transaction history
- Contact system administrators for technical issues

---

**Built with ❤️ for transparent fund management**
