// Currency conversion functionality
let currentCurrency = 'INR';
const exchangeRates = {
  INR: 1,
  USD: 0.012 // Approximate rate: 1 INR = 0.012 USD
};

// Initialize currency on page load
document.addEventListener('DOMContentLoaded', function() {
  // Load saved currency preference
  const savedCurrency = localStorage.getItem('preferredCurrency');
  if (savedCurrency && exchangeRates[savedCurrency]) {
    currentCurrency = savedCurrency;
    updateCurrencyDisplay();
    convertAllAmounts();
  }
});

function toggleCurrency() {
  // Toggle between INR and USD
  currentCurrency = currentCurrency === 'INR' ? 'USD' : 'INR';
  
  // Save preference
  localStorage.setItem('preferredCurrency', currentCurrency);
  
  // Update display and convert amounts
  updateCurrencyDisplay();
  convertAllAmounts();
}

function updateCurrencyDisplay() {
  const symbolElement = document.getElementById('currencySymbol');
  const codeElement = document.getElementById('currencyCode');
  
  if (symbolElement && codeElement) {
    if (currentCurrency === 'INR') {
      symbolElement.textContent = '₹';
      codeElement.textContent = 'INR';
    } else {
      symbolElement.textContent = '$';
      codeElement.textContent = 'USD';
    }
  }
}

function convertAmount(amount, fromCurrency = 'INR') {
  if (fromCurrency === currentCurrency) {
    return amount;
  }
  
  if (fromCurrency === 'INR' && currentCurrency === 'USD') {
    return Math.round(amount * exchangeRates.USD * 100) / 100;
  } else if (fromCurrency === 'USD' && currentCurrency === 'INR') {
    return Math.round(amount / exchangeRates.USD);
  }
  
  return amount;
}

function getCurrencySymbol() {
  return currentCurrency === 'INR' ? '₹' : '$';
}

function convertAllAmounts() {
  // Convert all amount elements on the page
  const amountElements = document.querySelectorAll('[data-amount]');
  
  amountElements.forEach(element => {
    const originalAmount = parseFloat(element.getAttribute('data-amount'));
    const convertedAmount = convertAmount(originalAmount);
    const symbol = getCurrencySymbol();
    
    // Update the display
    element.textContent = `${symbol}${convertedAmount.toLocaleString()}`;
  });
  
  // Also convert elements with class 'amount-display'
  const displayElements = document.querySelectorAll('.amount-display');
  displayElements.forEach(element => {
    const text = element.textContent;
    const amountMatch = text.match(/₹(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    
    if (amountMatch) {
      const originalAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
      const convertedAmount = convertAmount(originalAmount);
      const symbol = getCurrencySymbol();
      
      element.textContent = text.replace(/₹\d+(?:,\d{3})*(?:\.\d{2})?/, `${symbol}${convertedAmount.toLocaleString()}`);
    }
  });
}

// Helper function to format amounts with current currency
function formatAmount(amount, fromCurrency = 'INR') {
  const convertedAmount = convertAmount(amount, fromCurrency);
  const symbol = getCurrencySymbol();
  return `${symbol}${convertedAmount.toLocaleString()}`;
}

// Export functions for use in other scripts
window.currencyUtils = {
  toggleCurrency,
  convertAmount,
  getCurrencySymbol,
  formatAmount,
  getCurrentCurrency: () => currentCurrency
};
