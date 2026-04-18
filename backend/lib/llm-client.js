/**
 * LLM Client — wraps Azure OpenAI API for the agent runner.
 * Configurable via environment variables.
 */
const { AzureOpenAI } = require('openai');

const MAX_TOOL_ROUNDS = 6;
const MAX_TOTAL_TOOL_CALLS = 15;
const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT = `You are the AI scheduling assistant for ScheduleMatch Pro. You help users manage their clients, providers, calendars, and session scheduling through natural language conversation.

Your capabilities (via tools):
- **Client management**: list, create, and get details of clients
- **Provider management**: list, create, and get details of providers  
- **Find availability**: search for providers matching a client's schedule preferences
- **Book sessions**: schedule sessions between clients and providers
- **View calendars**: check availability for any client or provider
- **Compare calendars**: find overlapping time slots between a client and provider
- **Manage sessions**: list, filter, and update session status

Guidelines:
- Be concise and professional. You're helping a scheduler who may be on a phone call.
- When searching for providers, always call find_available_providers with the client_id. Don't guess.
- When asked to create a client/provider, extract all info from the message and call the tool.
- When showing results, summarize them clearly — dates, times, provider names.
- If you need more information (e.g., client name not recognized), ask the user.
- For booking, always confirm the details before calling book_session.
- Never fabricate data. Only report what the tools return.
- When a tool returns an error, explain it to the user and suggest what to do.
- Use 12-hour time format (e.g., 2:30 PM) in your responses for readability.`;

function createLLMClient() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';

  if (!apiKey || !endpoint) return null;

  const client = new AzureOpenAI({
    apiKey,
    endpoint,
    deployment,
    apiVersion,
  });

  return { client, model: deployment };
}

/**
 * Run the agent loop: LLM → tool calls → LLM → ... → final response
 * @param {string} userMessage
 * @param {Array} history - [{role, content}]
 * @param {Array} toolDefs - OpenAI tool definitions
 * @param {Function} executeToolFn - (name, args) => result
 * @returns {{ response: string, toolCalls: Array }}
 */
async function runAgentLoop(userMessage, history, toolDefs, executeToolFn) {
  const llm = createLLMClient();
  if (!llm) throw new Error('AI not configured. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables.');

  // Build messages: system + trimmed history + user message
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-MAX_HISTORY_MESSAGES),
    { role: 'user', content: userMessage }
  ];

  const allToolCalls = [];
  let rounds = 0;
  let totalCalls = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      messages,
      tools: toolDefs,
      tool_choice: 'auto',
    });

    const choice = completion.choices[0];
    const assistantMsg = choice.message;

    // If no tool calls, we have the final response
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return {
        response: assistantMsg.content || 'I processed your request.',
        tool_calls: allToolCalls
      };
    }

    // Execute tool calls
    messages.push(assistantMsg); // Add assistant message with tool_calls

    for (const tc of assistantMsg.tool_calls) {
      totalCalls++;
      if (totalCalls > MAX_TOTAL_TOOL_CALLS) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: 'Tool call limit reached' }) });
        continue;
      }

      let args;
      try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

      const result = executeToolFn(tc.function.name, args);
      const resultStr = JSON.stringify(result);

      allToolCalls.push({
        name: tc.function.name,
        arguments: args,
        result: result
      });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultStr.length > 4000 ? resultStr.substring(0, 4000) + '...(truncated)' : resultStr
      });
    }
  }

  // Exceeded max rounds — ask LLM for a final summary
  messages.push({ role: 'user', content: 'Please summarize what you found and respond to the user.' });
  const final = await llm.client.chat.completions.create({ model: llm.model, messages });
  return {
    response: final.choices[0].message.content || 'I completed the requested operations.',
    tool_calls: allToolCalls
  };
}

module.exports = { runAgentLoop, createLLMClient, SYSTEM_PROMPT };
