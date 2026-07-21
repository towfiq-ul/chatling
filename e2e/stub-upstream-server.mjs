// A minimal stand-in for an OpenAI-compatible /chat/completions endpoint, so
// the E2E suite can exercise the full widget -> Worker -> "LLM" round trip
// deterministically and offline, without needing a real OpenRouter API key
// in this environment. Point AI_BASE_URL at a real provider to additionally
// verify against the live API before shipping (see PRD §5.4's lesson about
// catching a real 402 this way).
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 4790);

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/chat/completions') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Not found' } }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
  } catch {
    // fall through with an empty body
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m?.role === 'user');
  const content = `Stub reply. You asked: "${lastUser?.content ?? ''}". Our placeholder services are listed in the Services section.`;

  // A short artificial delay so tests can reliably observe the widget's
  // loading/typing-indicator state before the response resolves.
  await new Promise((resolve) => setTimeout(resolve, 400));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content } }],
    }),
  );
});

server.listen(port, () => {
  console.log(`Stub upstream listening on http://localhost:${port}`);
});
