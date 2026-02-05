# Routes Layer

This directory contains HTTP route handlers for the Express application.

## Routes

### OpenAI Compatible Routes (`openai.js`)

OpenAI-standard API endpoints:
- `POST /v1/chat/completions` - Chat completions (streaming and non-streaming)
- `GET /v1/models` - List available models

### Agent Routes (`agent.js`)

Agent mode endpoints (planned):
- `POST /v1/agent/chat` - Send message with tool support
- `GET /v1/agent/sessions` - List sessions
- `GET /v1/agent/sessions/:id` - Get session details
- `DELETE /v1/agent/sessions/:id` - Delete session
- `POST /v1/agent/sessions/:id/attach` - Attach to session

## Usage

```javascript
import openaiRoutes from './routes/openai.js';
import agentRoutes from './routes/agent.js';

app.use('/v1', openaiRoutes);
app.use('/v1/agent', agentRoutes);
```

## Design Principles

- RESTful conventions - standard HTTP methods and status codes
- Authentication middleware - API key validation
- Error handling - consistent error response format
- Separation of concerns - routes delegate to adapters
