// server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// The exact fallback response from your system when the DB has no answer
const FALLBACK_MSG = "The requested information is not available in the retrieved data. Please try another query or topic.";

app.use(cors());
app.use(express.json());

// Helper that performs an Azure OpenAI call.
// If `useSearch` is true, we include your Azure Cognitive Search plugin.
// Otherwise we omit it (so the model falls back to its broader training).
async function queryOpenAI(messages, useSearch) {
  const body = {
    messages,
    temperature: 0.7,
  };

  if (useSearch) {
    body.data_sources = [
      {
        type: "azure_search",
        parameters: {
          endpoint: process.env.SEARCH_ENDPOINT,
          index_name: process.env.SEARCH_INDEX,
          authentication: {
            type: "api_key",
            key: process.env.SEARCH_API_KEY
          }
        }
      }
    ];
  }

  const resp = await fetch(process.env.AZURE_OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.AZURE_OPENAI_API_KEY
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;

  // Build the base message array
  const messages = [
    {
      role: "system",
      content: "You are an expert in cardiovascular disease, and you are helping answer other experts' questions about cardiovascular disease. Always write the name of the paper you're referencing in a reference section at the end of your response."
    },
    {
      role: "user",
      content: prompt
    }
  ];

  try {
    // First try: with Azure Search
    let content = await queryOpenAI(messages, true);

    // If we got the “no data” fallback, retry without search (so model can tap its broader knowledge)
    if (content.trim() === FALLBACK_MSG) {
      content = await queryOpenAI(messages, false);
    }

    // Send back the final answer
    res.json(content);

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Failed to fetch data from Azure OpenAI." });
  }
});
const serverless = require('serverless-http');
module.exports.handler = serverless(app);
