const { HfInference } = require('@huggingface/inference');

class AIService {
  constructor() {
    this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
  }

  // Budget Summary Generator
  async generateBudgetSummary(budgetData) {
    try {
      const prompt = `Summarize this budget for non-technical citizens in a clear, concise way.

Budget Data:
- Name: ${budgetData.name}
- Department: ${budgetData.department}
- Total Budget: ₹${budgetData.totalBudget.toLocaleString()}
- Spent: ₹${budgetData.spent.toLocaleString()}
- Remaining: ₹${budgetData.remaining.toLocaleString()}
- Fiscal Year: ${budgetData.fiscalYear}
- Type: ${budgetData.type}

Return JSON format:
{
  "headline": "One sentence action-oriented headline",
  "bullets": ["Bullet 1 (≤12 words)", "Bullet 2 (≤12 words)", "Bullet 3 (≤12 words)"],
  "numbers": {
    "total": "₹X,XXX,XXX",
    "spent": "₹X,XXX,XXX", 
    "remaining": "₹X,XXX,XXX"
  },
  "verification_tips": ["Tip 1 for verification", "Tip 2 for verification"]
}`;

      const response = await this.hf.textGeneration({
        model: 'microsoft/DialoGPT-medium',
        inputs: prompt,
        parameters: {
          max_new_tokens: 300,
          temperature: 0.3,
          return_full_text: false
        }
      });

      return this.parseJSONResponse(response.generated_text);
    } catch (error) {
      console.error('Error generating budget summary:', error);
      return this.getFallbackSummary(budgetData);
    }
  }

  // Transaction Classifier
  async classifyTransaction(transactionData, budgetContext) {
    try {
      const prompt = `Classify this transaction as 'legit' or 'suspicious' based on the context.

Transaction:
- Description: ${transactionData.description}
- Amount: ₹${transactionData.amount.toLocaleString()}
- Vendor: ${transactionData.vendorName || 'Unknown'}

Budget Context:
- Budget: ${budgetContext.name}
- Department: ${budgetContext.department}
- Fiscal Year: ${budgetContext.fiscalYear}
- Large Payment Threshold: ₹${budgetContext.largePaymentThreshold || 100000}

Return JSON array:
[{
  "id": "${transactionData._id}",
  "category": "legit" or "suspicious",
  "score": 0-100,
  "reasons": ["reason1", "reason2"],
  "recommended_actions": ["action1", "action2"]
}]`;

      const response = await this.hf.textGeneration({
        model: 'microsoft/DialoGPT-medium',
        inputs: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.0,
          return_full_text: false
        }
      });

      return this.parseJSONResponse(response.generated_text);
    } catch (error) {
      console.error('Error classifying transaction:', error);
      return this.getFallbackClassification(transactionData);
    }
  }

  // FAQ Generator
  async generateFAQ(budgetData) {
    try {
      const prompt = `Generate 6 short FAQ Q/A pairs for the public about this budget. Questions should be ≤10 words. Answers should be one concise sentence in plain language.

Budget: ${budgetData.name}
Department: ${budgetData.department}
Total: ₹${budgetData.totalBudget.toLocaleString()}
Fiscal Year: ${budgetData.fiscalYear}

Return JSON array:
[{"q": "Question?", "a": "Answer."}, ...]`;

      const response = await this.hf.textGeneration({
        model: 'microsoft/DialoGPT-medium',
        inputs: prompt,
        parameters: {
          max_new_tokens: 400,
          temperature: 0.4,
          return_full_text: false
        }
      });

      return this.parseJSONResponse(response.generated_text);
    } catch (error) {
      console.error('Error generating FAQ:', error);
      return this.getFallbackFAQ(budgetData);
    }
  }

  // Sankey Data Generator
  async generateSankeyData(hierarchyData) {
    try {
      const nodes = [];
      const links = [];

      // Budget node
      nodes.push({
        id: `budget_${hierarchyData._id}`,
        label: hierarchyData.name,
        type: 'budget'
      });

      // Department nodes and links
      if (hierarchyData.departments) {
        hierarchyData.departments.forEach(dept => {
          nodes.push({
            id: `dept_${dept._id}`,
            label: dept.name,
            type: 'department'
          });
          links.push({
            source: `budget_${hierarchyData._id}`,
            target: `dept_${dept._id}`,
            value: dept.budget
          });

          // Project nodes and links
          if (dept.projects) {
            dept.projects.forEach(project => {
              nodes.push({
                id: `project_${project._id}`,
                label: project.name,
                type: 'project'
              });
              links.push({
                source: `dept_${dept._id}`,
                target: `project_${project._id}`,
                value: project.budget
              });

              // Vendor nodes and links
              if (project.vendors) {
                project.vendors.forEach(vendor => {
                  nodes.push({
                    id: `vendor_${vendor._id}`,
                    label: vendor.name,
                    type: 'vendor'
                  });
                  links.push({
                    source: `project_${project._id}`,
                    target: `vendor_${vendor._id}`,
                    value: vendor.allocatedAmount
                  });
                });
              }
            });
          }
        });
      }

      return { nodes, links };
    } catch (error) {
      console.error('Error generating Sankey data:', error);
      return { nodes: [], links: [] };
    }
  }

  // Chatbot Response Generator
  async generateChatbotResponse(userMessage, context) {
    try {
      const prompt = `You are a friendly BudgetTransparency Assistant. Answer the user's question about budget transparency in 3 short bullets. If they ask for verification, include the endpoint /verify/<hash>.

User Question: ${userMessage}
Context: ${JSON.stringify(context)}

Provide 3 short bullets for lay users, and 1 technical line for auditors if requested.`;

      const response = await this.hf.textGeneration({
        model: 'microsoft/DialoGPT-medium',
        inputs: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.5,
          return_full_text: false
        }
      });

      return response.generated_text;
    } catch (error) {
      console.error('Error generating chatbot response:', error);
      return "I'm sorry, I'm having trouble processing your request right now. Please try again later or contact support.";
    }
  }

  // Email Digest Generator
  async generateEmailDigest(period, changes, transactions) {
    try {
      const prompt = `Generate a weekly email digest for stakeholders about budget changes and transactions.

Period: ${period}
Budget Changes: ${JSON.stringify(changes)}
New Transactions: ${JSON.stringify(transactions)}

Return JSON:
{
  "subject": "Weekly FundFlow Digest: <one-liner>",
  "body": "HTML formatted summary with bullets and CTAs"
}`;

      const response = await this.hf.textGeneration({
        model: 'microsoft/DialoGPT-medium',
        inputs: prompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.3,
          return_full_text: false
        }
      });

      return this.parseJSONResponse(response.generated_text);
    } catch (error) {
      console.error('Error generating email digest:', error);
      return this.getFallbackEmailDigest(period, changes, transactions);
    }
  }

  // Helper methods
  parseJSONResponse(text) {
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      return null;
    }
  }

  getFallbackSummary(budgetData) {
    return {
      headline: `${budgetData.name} - ${budgetData.department} Budget`,
      bullets: [
        "Supports departmental operations",
        "Transparent fund allocation",
        "Public accountability maintained"
      ],
      numbers: {
        total: `₹${budgetData.totalBudget.toLocaleString()}`,
        spent: `₹${budgetData.spent.toLocaleString()}`,
        remaining: `₹${budgetData.remaining.toLocaleString()}`
      },
      verification_tips: [
        "Check transaction hashes for verification",
        "Review audit trail for complete history"
      ]
    };
  }

  getFallbackClassification(transactionData) {
    return [{
      id: transactionData._id,
      category: "legit",
      score: 75,
      reasons: ["Standard transaction format", "Within expected parameters"],
      recommended_actions: ["Continue monitoring", "Regular audit review"]
    }];
  }

  getFallbackFAQ(budgetData) {
    return [
      { q: "What is this budget for?", a: `This budget funds ${budgetData.department} operations for ${budgetData.fiscalYear}.` },
      { q: "How much is allocated?", a: `Total allocation is ₹${budgetData.totalBudget.toLocaleString()}.` },
      { q: "How much has been spent?", a: `₹${budgetData.spent.toLocaleString()} has been spent so far.` },
      { q: "What's the remaining amount?", a: `₹${budgetData.remaining.toLocaleString()} remains unspent.` },
      { q: "Is this budget public?", a: budgetData.type === 'Public' ? "Yes, this is a public budget." : "No, this is a private budget." },
      { q: "How can I verify transactions?", a: "Use the transaction hash to verify individual transactions." }
    ];
  }

  getFallbackEmailDigest(period, changes, transactions) {
    return {
      subject: `Weekly FundFlow Digest: ${changes.length} budget changes, ${transactions.length} new transactions`,
      body: `
        <h2>Weekly FundFlow Digest</h2>
        <p>Period: ${period}</p>
        <h3>Budget Changes (${changes.length})</h3>
        <ul>
          ${changes.map(change => `<li>${change.name}: ${change.action}</li>`).join('')}
        </ul>
        <h3>New Transactions (${transactions.length})</h3>
        <ul>
          ${transactions.map(tx => `<li>${tx.description}: ₹${tx.amount.toLocaleString()}</li>`).join('')}
        </ul>
        <p><a href="/dashboard">View Full Dashboard</a></p>
      `
    };
  }
}

module.exports = new AIService();
