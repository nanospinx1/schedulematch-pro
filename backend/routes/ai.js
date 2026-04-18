/**
 * AI Agent route — POST /api/ai/chat
 * Connects the LLM to the tool registry with auth context from middleware.
 */
const express = require('express');
const router = express.Router();
const { getToolDefinitions, executeTool } = require('../lib/tool-registry');
const { runAgentLoop } = require('../lib/llm-client');
const db = require('../db');

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Check if AI is enabled
  if (!process.env.AZURE_OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'AI assistant is not configured. Set AZURE_OPENAI_API_KEY in your environment.',
      mock: true
    });
  }

  const userId = req.user.id; // From auth middleware — never from client/model
  const toolDefs = getToolDefinitions();
  const conversationHistory = Array.isArray(history) ? history : [];

  try {
    const result = await runAgentLoop(
      message,
      conversationHistory,
      toolDefs,
      (name, args) => executeTool(name, args, { userId, db }) // Auth context injected server-side
    );

    res.json({
      response: result.response,
      tool_calls: result.tool_calls.map(tc => ({
        name: tc.name,
        arguments: tc.arguments,
        // Don't send full result data to frontend — just summary
        success: !tc.result?.error,
        summary: tc.result?.error || summarizeResult(tc.name, tc.result)
      }))
    });
  } catch (err) {
    console.error('AI agent error:', err.message);
    if (err.message.includes('API key') || err.message.includes('not configured')) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'AI processing failed. Please try again.' });
  }
});

// GET /api/ai/tools — list available tools (for debugging / MCP discovery)
router.get('/tools', (req, res) => {
  const defs = getToolDefinitions();
  res.json({ count: defs.length, tools: defs.map(t => ({ name: t.function.name, description: t.function.description })) });
});

// Summarize tool results for the frontend tool-call display
function summarizeResult(name, result) {
  if (!result) return 'No result';
  if (name === 'list_clients') return `${result.count} clients`;
  if (name === 'list_providers') return `${result.count} providers`;
  if (name === 'list_sessions') return `${result.count} sessions`;
  if (name === 'create_client') return result.created ? `Created: ${result.name}` : 'Failed';
  if (name === 'create_provider') return result.created ? `Created: ${result.name}` : 'Failed';
  if (name === 'find_available_providers') return `${result.provider_count || 0} providers found`;
  if (name === 'book_session') return result.booked ? `Booked: ${result.client} with ${result.provider}` : 'Conflict';
  if (name === 'get_availability') return `${result.slots?.length || 0} slots`;
  if (name === 'compare_calendars') return `${result.overlapping_slots?.length || 0} overlaps`;
  if (name === 'get_client_detail' || name === 'get_provider_detail') return result.name || 'Found';
  if (name === 'update_session_status') return result.updated ? `Status: ${result.new_status}` : 'Failed';
  return 'Done';
}

module.exports = router;
