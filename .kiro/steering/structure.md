---
inclusion: always
---

# Voiceter Backend Integration - Project Structure

## Folder Structure

```
voiceter-backend/
├── src/
│   ├── server/
│   │   ├── index.ts                 # Main entry point
│   │   ├── app.ts                   # Express app setup
│   │   └── config.ts                # Configuration loader
│   │
│   ├── websocket/
│   │   ├── server.ts                # WebSocket server implementation
│   │   ├── handler.ts               # WebSocket event handlers
│   │   ├── events.ts                # Event type definitions
│   │   └── validator.ts             # Message schema validation
│   │
│   ├── bedrock/
│   │   ├── client.ts                # Bedrock client initialization
│   │   ├── streaming.ts             # Bidirectional streaming handler
│   │   ├── events.ts                # Bedrock event processing
│   │   └── cleanup.ts               # Stream cleanup logic
│   │
│   ├── session/
│   │   ├── manager.ts               # Session lifecycle management
│   │   ├── state.ts                 # Session state interface
│   │   ├── storage.ts               # Session storage (memory/Redis)
│   │   └── cleanup.ts               # Stale session cleanup
│   │
│   ├── questionnaire/
│   │   ├── engine.ts                # Questionnaire logic engine
│   │   ├── loader.ts                # Load questionnaires from JSON
│   │   ├── validator.ts             # Response validation
│   │   ├── logic.ts                 # Display/skip logic evaluation
│   │   └── types.ts                 # Questionnaire type definitions
│   │
│   ├── audio/
│   │   ├── processor.ts             # Audio format conversion
│   │   ├── encoder.ts               # Base64 encoding/decoding
│   │   └── validator.ts             # Audio format validation
│   │
│   ├── tools/
│   │   ├── executor.ts              # Tool execution framework
│   │   ├── record-response.ts       # record_response tool
│   │   ├── get-next-question.ts     # get_next_question tool
│   │   ├── validate-answer.ts       # validate_answer tool
│   │   └── get-demo-context.ts      # get_demo_context tool
│   │
│   ├── sentiment/
│   │   ├── analyzer.ts              # Sentiment analysis
│   │   └── classifier.ts            # Sentiment classification
│   │
│   ├── quota/
│   │   ├── manager.ts               # Quota tracking and enforcement
│   │   ├── storage.ts               # Quota count storage
│   │   └── types.ts                 # Quota type definitions
│   │
│   ├── data/
│   │   ├── dynamodb.ts              # DynamoDB client wrapper
│   │   ├── s3.ts                    # S3 client wrapper
│   │   ├── repositories/
│   │   │   ├── session.ts           # Session repository
│   │   │   ├── response.ts          # Response repository
│   │   │   ├── transcript.ts        # Transcript repository
│   │   │   └── recording.ts         # Recording repository (S3)
│   │   └── types.ts                 # Data model type definitions
│   │
│   ├── monitoring/
│   │   ├── logger.ts                # Structured logging
│   │   ├── metrics.ts               # CloudWatch metrics
│   │   └── health.ts                # Health check endpoint
│   │
│   ├── auth/
│   │   ├── middleware.ts            # Authentication middleware
│   │   ├── jwt.ts                   # JWT validation
│   │   └── session.ts               # Session ID validation
│   │
│   ├── errors/
│   │   ├── handler.ts               # Error handling middleware
│   │   ├── codes.ts                 # Error code definitions
│   │   └── formatter.ts             # Error response formatting
│   │
│   └── utils/
│       ├── uuid.ts                  # UUID generation
│       ├── retry.ts                 # Retry with exponential backoff
│       ├── sleep.ts                 # Sleep utility
│       └── validation.ts            # Common validation functions
│
├── questionnaires/
│   ├── demo1_csat_nps.json
│   ├── demo2_concept_test.json
│   ├── demo3_political_polling.json
│   └── demo4_brand_tracker.json
│
├── tests/
│   ├── unit/
│   │   ├── websocket/
│   │   ├── bedrock/
│   │   ├── session/
│   │   ├── questionnaire/
│   │   ├── audio/
│   │   ├── tools/
│   │   ├── sentiment/
│   │   ├── quota/
│   │   └── data/
│   │
│   ├── property/
│   │   ├── session-id-uniqueness.test.ts
│   │   ├── message-schema.test.ts
│   │   ├── invalid-message-rejection.test.ts
│   │   ├── uuid-uniqueness.test.ts
│   │   ├── audio-encoding.test.ts
│   │   ├── audio-format.test.ts
│   │   ├── contentname-consistency.test.ts
│   │   ├── next-question-logic.test.ts
│   │   ├── answer-validation.test.ts
│   │   ├── display-logic.test.ts
│   │   ├── skip-logic.test.ts
│   │   ├── dynamic-text.test.ts
│   │   ├── dynamic-options.test.ts
│   │   ├── sentiment-classification.test.ts
│   │   ├── quota-persistence.test.ts
│   │   ├── error-log-completeness.test.ts
│   │   ├── error-sanitization.test.ts
│   │   ├── barge-in-state.test.ts
│   │   ├── session-restoration.test.ts
│   │   └── session-isolation.test.ts
│   │
│   ├── integration/
│   │   ├── websocket-communication.test.ts
│   │   ├── bedrock-integration.test.ts
│   │   ├── database-integration.test.ts
│   │   └── end-to-end.test.ts
│   │
│   └── fixtures/
│       ├── questionnaires/
│       ├── audio/
│       └── sessions/
│
├── infrastructure/
│   ├── cdk/
│   │   ├── lib/
│   │   │   ├── vpc-stack.ts
│   │   │   ├── ecs-stack.ts
│   │   │   ├── alb-stack.ts
│   │   │   ├── dynamodb-stack.ts
│   │   │   ├── s3-stack.ts
│   │   │   ├── iam-stack.ts
│   │   │   └── cloudwatch-stack.ts
│   │   ├── bin/
│   │   │   └── app.ts
│   │   ├── cdk.json
│   │   └── package.json
│   │
│   └── docker/
│       ├── Dockerfile
│       └── .dockerignore
│
├── docs/
│   ├── api/
│   │   ├── websocket-events.md
│   │   ├── error-codes.md
│   │   └── session-lifecycle.md
│   │
│   ├── integration/
│   │   ├── getting-started.md
│   │   ├── examples.md
│   │   └── troubleshooting.md
│   │
│   └── architecture/
│       ├── overview.md
│       ├── components.md
│       └── data-flow.md
│
├── .kiro/
│   ├── specs/
│   │   └── voiceter-backend-integration/
│   │       ├── requirements.md
│   │       ├── design.md
│   │       └── tasks.md
│   │
│   └── steering/
│       ├── product.md
│       ├── tech.md
│       └── structure.md
│
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
├── .gitignore
└── README.md
```

## Code Organization Principles

### 1. Separation of Concerns
- Each module has a single, well-defined responsibility
- Business logic separated from infrastructure concerns
- Data access layer abstracted from business logic
- WebSocket communication separated from Bedrock integration

### 2. Dependency Direction
- Dependencies flow inward: Infrastructure → Business Logic → Domain
- Domain models have no dependencies on infrastructure
- Business logic depends on interfaces, not implementations
- Infrastructure implements interfaces defined by business logic

### 3. Module Boundaries
- **server/**: Application entry point and configuration
- **websocket/**: WebSocket communication layer
- **bedrock/**: AWS Bedrock integration
- **session/**: Session lifecycle management
- **questionnaire/**: Survey logic and question flow
- **audio/**: Audio processing utilities
- **tools/**: Tool execution framework
- **sentiment/**: Sentiment analysis
- **quota/**: Quota management
- **data/**: Data persistence layer
- **monitoring/**: Logging, metrics, health checks
- **auth/**: Authentication and authorization
- **errors/**: Error handling
- **utils/**: Shared utilities

### 4. File Naming Conventions
- **kebab-case**: All file names use kebab-case (e.g., `session-manager.ts`)
- **Descriptive**: File names clearly indicate contents (e.g., `record-response.ts` for record_response tool)
- **Test Files**: Test files mirror source structure with `.test.ts` suffix
- **Type Files**: Type definitions in `types.ts` files within each module

### 5. Import Organization
```typescript
// 1. Node.js built-in modules
import { EventEmitter } from 'events';

// 2. External dependencies
import { Socket } from 'socket.io';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// 3. Internal modules (absolute imports)
import { SessionManager } from '@/session/manager';
import { QuestionnaireEngine } from '@/questionnaire/engine';

// 4. Types
import type { Session, SessionMetadata } from '@/session/types';

// 5. Relative imports (only for same module)
import { validateMessage } from './validator';
```

## Naming Conventions

### Variables and Functions
- **camelCase**: Variables and functions use camelCase
- **Descriptive**: Names clearly indicate purpose
- **Verbs for Functions**: Functions start with verbs (e.g., `createSession`, `validateResponse`)
- **Nouns for Variables**: Variables are nouns (e.g., `sessionId`, `questionnaireEngine`)

### Classes and Interfaces
- **PascalCase**: Classes and interfaces use PascalCase
- **Descriptive**: Names clearly indicate purpose
- **Interface Prefix**: No "I" prefix for interfaces (e.g., `Session`, not `ISession`)
- **Implementation Suffix**: Implementations may have suffix (e.g., `SessionManagerImpl`)

### Constants
- **UPPER_SNAKE_CASE**: Constants use UPPER_SNAKE_CASE
- **Descriptive**: Names clearly indicate purpose
- **Grouped**: Related constants grouped in objects

```typescript
const ERROR_CODES = {
  WS_CONNECTION_FAILED: 'WS_CONNECTION_FAILED',
  BEDROCK_INIT_FAILED: 'BEDROCK_INIT_FAILED',
  DB_WRITE_FAILED: 'DB_WRITE_FAILED',
};
```

### Types and Interfaces
- **PascalCase**: Types and interfaces use PascalCase
- **Descriptive**: Names clearly indicate purpose
- **Suffix for Events**: Event types end with "Event" (e.g., `SessionStartEvent`)
- **Suffix for Configs**: Configuration types end with "Config" (e.g., `StreamConfig`)

## Module Dependencies

### Dependency Graph
```
server
  ├── websocket
  │   ├── session
  │   ├── bedrock
  │   └── errors
  │
  ├── bedrock
  │   ├── audio
  │   ├── tools
  │   └── errors
  │
  ├── session
  │   ├── data
  │   └── utils
  │
  ├── questionnaire
  │   ├── sentiment
  │   ├── quota
  │   └── utils
  │
  ├── tools
  │   ├── questionnaire
  │   ├── data
  │   └── errors
  │
  ├── data
  │   ├── monitoring
  │   └── errors
  │
  └── monitoring
      └── utils
```

### Circular Dependency Prevention
- Use dependency injection to break circular dependencies
- Use interfaces to decouple modules
- Use event emitters for loose coupling
- Avoid importing parent modules from child modules

## Testing Structure

### Unit Tests
- Mirror source structure in `tests/unit/`
- One test file per source file
- Test file name: `<source-file>.test.ts`
- Group related tests with `describe` blocks
- Use descriptive test names with `it` or `test`

### Property-Based Tests
- Separate directory: `tests/property/`
- One test file per property
- Test file name: `<property-name>.test.ts`
- Use fast-check for property generation
- Run 100+ iterations per property

### Integration Tests
- Separate directory: `tests/integration/`
- Test component interactions
- Use real or mocked AWS services
- Test end-to-end flows

### Test Fixtures
- Shared test data in `tests/fixtures/`
- Organized by type (questionnaires, audio, sessions)
- Reusable across tests

## Configuration Management

### Environment Variables
- Load from `.env` file in development
- Load from ECS task definition in production
- Validate required variables at startup
- Fail fast with clear error messages

### Configuration Schema
```typescript
interface Config {
  aws: {
    region: string;
    bedrockModelId: string;
    dynamodbTablePrefix: string;
    s3BucketName: string;
  };
  server: {
    port: number;
    logLevel: string;
  };
  auth: {
    enabled: boolean;
    cognitoUserPoolId?: string;
  };
  redis?: {
    url: string;
  };
}
```

### Configuration Validation
```typescript
function validateConfig(config: Config): void {
  if (!config.aws.region) {
    throw new Error('AWS_REGION is required');
  }
  if (!config.aws.bedrockModelId) {
    throw new Error('BEDROCK_MODEL_ID is required');
  }
  // ... validate all required fields
}
```

## Logging Standards

### Log Format
```typescript
{
  timestamp: string;      // ISO 8601
  level: string;          // DEBUG, INFO, WARN, ERROR
  sessionId?: string;     // Session ID if available
  event: string;          // Event name
  data: object;           // Event-specific data
  error?: {               // Error details if applicable
    code: string;
    message: string;
    stack: string;
  };
}
```

### Log Levels
- **DEBUG**: Detailed debugging information (disabled in production)
- **INFO**: General informational messages
- **WARN**: Warning messages (potential issues)
- **ERROR**: Error messages with stack traces

### Logging Best Practices
- Always include sessionId when available
- Use structured logging (JSON format)
- Log all errors with full context
- Log important state transitions
- Don't log sensitive data (passwords, tokens, PII)
- Use appropriate log levels

## Error Handling Standards

### Error Classes
```typescript
class VoiceterError extends Error {
  constructor(
    public code: string,
    message: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'VoiceterError';
  }
}

class WebSocketError extends VoiceterError {
  constructor(message: string, recoverable: boolean = true) {
    super('WS_ERROR', message, recoverable);
    this.name = 'WebSocketError';
  }
}
```

### Error Handling Pattern
```typescript
try {
  await operation();
} catch (error) {
  if (error instanceof VoiceterError) {
    logger.error('Known error occurred', {
      code: error.code,
      message: error.message,
      recoverable: error.recoverable,
      sessionId
    });
    
    socket.emit('error', {
      errorCode: error.code,
      errorMessage: sanitizeErrorMessage(error.message),
      recoverable: error.recoverable
    });
  } else {
    logger.error('Unknown error occurred', {
      error,
      sessionId
    });
    
    socket.emit('error', {
      errorCode: 'INTERNAL_ERROR',
      errorMessage: 'An unexpected error occurred',
      recoverable: false
    });
  }
}
```

## Documentation Standards

### Code Comments
- Use JSDoc for public APIs
- Explain "why", not "what"
- Document complex algorithms
- Document assumptions and constraints
- Keep comments up-to-date

### JSDoc Example
```typescript
/**
 * Evaluates display logic conditions to determine if a question should be shown.
 * 
 * @param question - The question with display logic
 * @param session - The current session state
 * @returns true if the question should be displayed, false otherwise
 * 
 * @remarks
 * Display logic supports AND/OR operators and multiple conditions.
 * Conditions are evaluated against prior responses in the session.
 */
function evaluateDisplayLogic(
  question: Question,
  session: Session
): boolean {
  // Implementation
}
```

### README Files
- Each major module should have a README.md
- Explain module purpose and responsibilities
- Document public APIs
- Provide usage examples
- Link to related documentation

## Version Control

### Branch Strategy
- **main**: Production-ready code
- **develop**: Integration branch for features
- **feature/***: Feature branches
- **bugfix/***: Bug fix branches
- **hotfix/***: Emergency fixes for production

### Commit Messages
- Use conventional commits format
- Format: `<type>(<scope>): <subject>`
- Types: feat, fix, docs, style, refactor, test, chore
- Example: `feat(websocket): add barge-in support`

### Pull Request Guidelines
- One feature/fix per PR
- Include tests for new code
- Update documentation
- Pass all CI checks
- Request review from team member
