// Gemeinsamer Claude-Client für Extraktor und Anfrage-Agent.
const config = require('../config');

let client = null;

function anthropic() {
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({
      apiKey: config.llm.apiKey,
      ...(config.llm.workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': config.llm.workspaceId } } : {}),
    });
  }
  return client;
}

module.exports = { anthropic };
