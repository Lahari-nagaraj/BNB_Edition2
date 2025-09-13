# BNB Fund Management - Setup Instructions

## Environment Variables Required

Add these to your `.env` file:

```env
# MongoDB Connection
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority

# Cloudinary Configuration (for image uploads)
CLOUD_KEY_NAME=your_cloud_name
COUD_API_KEY=your_api_key
CLOUD_API_SECRET=your_secret_key

# Session Secret
SESSION_SECRET=your_session_secret_key

# Hugging Face Token (for AI features)
HF_TOKEN=your_huggingface_token
```

## Cloudinary Setup

1. Go to [Cloudinary.com](https://cloudinary.com)
2. Create a free account
3. Go to Dashboard
4. Copy your Cloud Name, API Key, and API Secret
5. Add them to your `.env` file

## Features Fixed

✅ **Public Budget Visibility**: Public budgets now show on home page
✅ **Location Detection**: Removed geolocation, Karnataka set as default
✅ **Creator Validation**: Fixed ObjectId validation errors
✅ **Cloudinary Upload**: Added proper error handling for missing credentials
✅ **Random Credentials**: Editor email/password generation working

## How to Test

1. Start the server: `node index.js`
2. Go to `http://localhost:8080`
3. Create a new budget as admin
4. Check admin dashboard for editor credentials
5. Login as editor to add expenses with receipts

## Current Status

✅ **All Issues Fixed:**
- Cloudinary configuration updated to match your .env variable names
- Cloudinary cloud name case sensitivity fixed (BNB → bnb)
- File upload restrictions fixed - now accepts JPG, PNG, GIF, WebP, and PDF
- Admin dashboard now shows editor credentials properly
- Missing editor views created (editorTransactionForm, editorBudgetTransactions, editorPendingTransactions)
- Editor functionality routes added (add transaction, view transactions, pending approvals)
- Image uploads (PNG, JPG) should work with your Cloudinary credentials
- Editor email/password generation working correctly

## Testing

1. Create a new budget as admin
2. Check admin dashboard - you should see editor credentials
3. Copy the email/password and share with editor
4. Test image upload in budget details page
